import { kv } from "./kv.ts";

// Cheap usage metrics: how many messages we posted, how many updates we sent,
// and across how many distinct Discord servers — bucketed over a handful of
// rolling time windows for the status page.
//
// We keep two resolutions of time buckets plus a single all-time aggregate:
//   - 5-minute buckets cover the <= 1 day windows (1h, 24h)
//   - daily buckets cover the > 1 day windows
// The bot serves a bounded number of guilds, so the per-bucket server set stays
// small and unioning them to count distinct servers is cheap.

const FINE = 5 * 60 * 1000; // 5-minute resolution for sub-day windows
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Retain a little past each window so the largest window always has full data.
const FINE_KEPT = 300; // 5-min buckets ≈ 25h, covers the 24h window
const DAYS_KEPT = 400; // covers the 365d window

type Bucket = { messages: number; updates: number; servers: string[] };

// Buckets written before the "lobbies" -> "messages" rename stored a `lobbies`
// field; coalesce so existing data carries over. We also guard against NaN: an
// earlier build summed undefined fields and persisted NaN into KV, and NaN is
// not caught by `??`, so check for finiteness explicitly.
type StoredBucket = Partial<Bucket> & { lobbies?: number };
const fin = (x: unknown): number | undefined =>
  typeof x === "number" && Number.isFinite(x) ? x : undefined;
const normalize = (v: StoredBucket | null | undefined): Bucket => ({
  messages: fin(v?.messages) ?? fin(v?.lobbies) ?? 0,
  updates: fin(v?.updates) ?? 0,
  servers: v?.servers ?? [],
});

/**
 * One-time cleanup: rewrite any bucket still holding a legacy `lobbies` field or
 * a non-finite (NaN) count, so the stored data matches the current shape. Also
 * backfills the all-time bucket from the daily buckets if it's behind — the NaN
 * repair reset it to zero, and since tracking just began the daily sum is the
 * true all-time total. Idempotent and cheap.
 */
export const repairMetrics = async () => {
  try {
    let fixed = 0;
    let dailyMsgs = 0;
    let dailyUpdates = 0;
    const dailyServers = new Set<string>();
    let allBucket: Bucket | null = null;

    for await (
      const e of kv.list<StoredBucket>(
        { prefix: ["metrics"] },
        { batchSize: 500 },
      )
    ) {
      // Drop the old hourly buckets; sub-day windows now use 5-minute buckets.
      if (e.key[1] === "hour") {
        await kv.delete(e.key);
        fixed++;
        continue;
      }
      const v = e.value;
      const clean = normalize(v);
      if (
        v?.lobbies !== undefined ||
        !Number.isFinite(v?.messages) ||
        !Number.isFinite(v?.updates)
      ) {
        await kv.set(e.key, clean);
        fixed++;
      }
      if (e.key[1] === "day") {
        dailyMsgs += clean.messages;
        dailyUpdates += clean.updates;
        for (const s of clean.servers) dailyServers.add(s);
      } else if (e.key[1] === "all") {
        allBucket = clean;
      }
    }
    if (fixed) console.log(new Date(), "Repaired", fixed, "metric buckets");

    // Backfill the all-time bucket from daily data when it's behind. Max, never
    // reduce, so it stays correct once old day buckets are pruned.
    const cur = allBucket ?? { messages: 0, updates: 0, servers: [] };
    const backfilled: Bucket = {
      messages: Math.max(cur.messages, dailyMsgs),
      updates: Math.max(cur.updates, dailyUpdates),
      servers: [...new Set([...cur.servers, ...dailyServers])],
    };
    if (
      backfilled.messages !== cur.messages ||
      backfilled.updates !== cur.updates ||
      backfilled.servers.length !== cur.servers.length
    ) {
      await kv.set(allKey, backfilled);
      console.log(new Date(), "Backfilled all-time metric bucket from daily");
    }
  } catch (err) {
    console.error(new Date(), "Failed to repair metrics", err);
  }
};

const fineKey = (index: number) => ["metrics", "fine", index];
const dayKey = (index: number) => ["metrics", "day", index];
const allKey = ["metrics", "all"];

const merge = (base: Bucket, add: Bucket): Bucket => ({
  messages: base.messages + add.messages,
  updates: base.updates + add.updates,
  servers: [...new Set([...base.servers, ...add.servers])],
});

const pruneOld = async (fine: number, day: number) => {
  try {
    const stale: Deno.KvKey[] = [];
    for await (
      const e of kv.list({ prefix: ["metrics", "fine"] }, { batchSize: 500 })
    ) {
      if ((e.key.at(-1) as number) < fine - FINE_KEPT) stale.push(e.key);
    }
    for await (
      const e of kv.list({ prefix: ["metrics", "day"] }, { batchSize: 500 })
    ) {
      if ((e.key.at(-1) as number) < day - DAYS_KEPT) stale.push(e.key);
    }
    await Promise.all(stale.map((k) => kv.delete(k)));
  } catch (err) {
    console.error(new Date(), "Failed to prune metrics buckets", err);
  }
};

/**
 * Record a cycle's worth of activity. `servers` should be the Discord servers
 * the counted `messages` were posted to. No-ops when there's nothing to record.
 */
export const recordMetrics = async (
  add: { messages: number; updates: number; servers: string[] },
  now = Date.now(),
) => {
  if (!add.messages && !add.updates) return;
  try {
    const fine = Math.floor(now / FINE);
    const day = Math.floor(now / DAY);

    const [fineB, dayB, allB] = await Promise.all([
      kv.get<StoredBucket>(fineKey(fine)),
      kv.get<StoredBucket>(dayKey(day)),
      kv.get<StoredBucket>(allKey),
    ]);

    const sample: Bucket = {
      messages: add.messages,
      updates: add.updates,
      servers: [...new Set(add.servers)],
    };

    await Promise.all([
      kv.set(fineKey(fine), merge(normalize(fineB.value), sample)),
      kv.set(dayKey(day), merge(normalize(dayB.value), sample)),
      kv.set(allKey, merge(normalize(allB.value), sample)),
    ]);

    // Sweep expired buckets about once an hour, on the first write to a new
    // bucket that lands on an hour boundary.
    if (!fineB.value && fine % (HOUR / FINE) === 0) await pruneOld(fine, day);
  } catch (err) {
    console.error(new Date(), "Failed to record metrics", err);
  }
};

export type MetricsWindow = {
  label: string;
  messages: number;
  updates: number;
  servers: number;
};

const windows: { label: string; ms: number; daily: boolean }[] = [
  { label: "1h", ms: HOUR, daily: false },
  { label: "24h", ms: DAY, daily: false },
  { label: "7d", ms: 7 * DAY, daily: true },
  { label: "30d", ms: 30 * DAY, daily: true },
  { label: "90d", ms: 90 * DAY, daily: true },
  { label: "1y", ms: 365 * DAY, daily: true },
];

const readBuckets = async (
  prefix: Deno.KvKey,
): Promise<Map<number, Bucket>> => {
  const map = new Map<number, Bucket>();
  for await (const e of kv.list<StoredBucket>({ prefix }, { batchSize: 500 })) {
    map.set(e.key.at(-1) as number, normalize(e.value));
  }
  return map;
};

let cache: { at: number; summary: MetricsWindow[] } | undefined;
const CACHE_MS = 60_000;

/**
 * Summarize activity across each rolling window. Counts are over-approximate at
 * the bucket boundary (the oldest bucket touched is included whole), which is
 * plenty precise for a usage dashboard. Cached for a minute.
 */
export const getMetricsSummary = async (): Promise<MetricsWindow[]> => {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.summary;

  const now = Date.now();
  const [fine, daily, all] = await Promise.all([
    readBuckets(["metrics", "fine"]),
    readBuckets(["metrics", "day"]),
    kv.get<StoredBucket>(allKey),
  ]);

  const summary: MetricsWindow[] = windows.map(
    ({ label, ms, daily: byDay }) => {
      const size = byDay ? DAY : FINE;
      const cutoff = Math.floor((now - ms) / size);
      const source = byDay ? daily : fine;

      let messages = 0;
      let updates = 0;
      const servers = new Set<string>();
      for (const [index, b] of source) {
        if (index < cutoff) continue;
        messages += b.messages;
        updates += b.updates;
        for (const s of b.servers) servers.add(s);
      }
      return { label, messages, updates, servers: servers.size };
    },
  );

  const allB = normalize(all.value);
  summary.push({
    label: "All",
    messages: allB.messages,
    updates: allB.updates,
    servers: allB.servers.length,
  });

  cache = { at: now, summary };
  return summary;
};
