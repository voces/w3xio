import { kv } from "./kv.ts";

// Cheap usage metrics: how many messages we posted, how many updates we sent,
// and across how many distinct Discord servers — bucketed over a handful of
// rolling time windows for the status page.
//
// We keep two resolutions of time buckets plus a single all-time aggregate:
//   - hourly buckets cover the <= 1 day windows
//   - daily buckets cover the > 1 day windows
// The bot serves a bounded number of guilds, so the per-bucket server set stays
// small and unioning them to count distinct servers is cheap.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Retain a little past each window so the largest window always has full data.
const HOURS_KEPT = 48; // covers the 24h window
const DAYS_KEPT = 400; // covers the 365d window

type Bucket = { messages: number; updates: number; servers: string[] };

// Buckets written before the "lobbies" -> "messages" rename stored a `lobbies`
// field; coalesce so existing data carries over instead of reading as NaN.
type StoredBucket = Partial<Bucket> & { lobbies?: number };
const normalize = (v: StoredBucket | null | undefined): Bucket => ({
  messages: v?.messages ?? v?.lobbies ?? 0,
  updates: v?.updates ?? 0,
  servers: v?.servers ?? [],
});

const hourKey = (index: number) => ["metrics", "hour", index];
const dayKey = (index: number) => ["metrics", "day", index];
const allKey = ["metrics", "all"];

const merge = (base: Bucket, add: Bucket): Bucket => ({
  messages: base.messages + add.messages,
  updates: base.updates + add.updates,
  servers: [...new Set([...base.servers, ...add.servers])],
});

const pruneOld = async (hour: number, day: number) => {
  try {
    const stale: Deno.KvKey[] = [];
    for await (
      const e of kv.list({ prefix: ["metrics", "hour"] }, { batchSize: 500 })
    ) {
      if ((e.key.at(-1) as number) < hour - HOURS_KEPT) stale.push(e.key);
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
) => {
  if (!add.messages && !add.updates) return;
  try {
    const now = Date.now();
    const hour = Math.floor(now / HOUR);
    const day = Math.floor(now / DAY);

    const [hourB, dayB, allB] = await Promise.all([
      kv.get<StoredBucket>(hourKey(hour)),
      kv.get<StoredBucket>(dayKey(day)),
      kv.get<StoredBucket>(allKey),
    ]);

    const sample: Bucket = {
      messages: add.messages,
      updates: add.updates,
      servers: [...new Set(add.servers)],
    };

    await Promise.all([
      kv.set(hourKey(hour), merge(normalize(hourB.value), sample)),
      kv.set(dayKey(day), merge(normalize(dayB.value), sample)),
      kv.set(allKey, merge(normalize(allB.value), sample)),
    ]);

    // A freshly created hour bucket means the clock rolled over — a good, cheap
    // moment (once an hour) to sweep away expired buckets.
    if (!hourB.value) await pruneOld(hour, day);
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
  const [hourly, daily, all] = await Promise.all([
    readBuckets(["metrics", "hour"]),
    readBuckets(["metrics", "day"]),
    kv.get<StoredBucket>(allKey),
  ]);

  const summary: MetricsWindow[] = windows.map(
    ({ label, ms, daily: byDay }) => {
      const size = byDay ? DAY : HOUR;
      const cutoff = Math.floor((now - ms) / size);
      const source = byDay ? daily : hourly;

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
