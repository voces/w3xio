import { kv } from "./kv.ts";

// Usage metrics: how many messages we posted, how many updates we sent, and
// across how many distinct Discord servers — bucketed over rolling time windows
// for the status page.
//
// Each window reads from a resolution sized to it, so precision stays high
// without keeping a year of fine-grained buckets:
//   - 1-minute buckets  -> 1h
//   - 5-minute buckets  -> 24h
//   - hourly buckets    -> 7d
//   - 12-hour buckets   -> 30d
//   - daily buckets     -> 90d, 1y
//   - a single all-time counter
// Windows weight their boundary buckets by the fraction that overlaps the
// window, so totals don't jump a whole bucket at a time. The bot serves a
// bounded number of guilds, so unioning per-bucket server sets stays cheap.

const MIN = 60 * 1000;
const FINE = 5 * MIN;
const HOUR = 60 * MIN;
const HALFDAY = 12 * HOUR;
const DAY = 24 * HOUR;

// Retain a little past each window so the largest window for a resolution always
// has full data.
const MIN_KEPT = 90; // 1-min buckets ≈ 1.5h, covers the 1h window
const FINE_KEPT = 300; // 5-min buckets ≈ 25h, covers the 24h window
const HOUR_KEPT = 192; // hourly buckets ≈ 8d, covers the 7d window
const HALFDAY_KEPT = 64; // 12h buckets ≈ 32d, covers the 30d window
const DAY_KEPT = 400; // daily buckets, covers the 1y window

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

const minKey = (index: number) => ["metrics", "min", index];
const fineKey = (index: number) => ["metrics", "fine", index];
const hourKey = (index: number) => ["metrics", "hour", index];
const halfDayKey = (index: number) => ["metrics", "h12", index];
const dayKey = (index: number) => ["metrics", "day", index];
const allKey = ["metrics", "all"];

const merge = (base: Bucket, add: Bucket): Bucket => ({
  messages: base.messages + add.messages,
  updates: base.updates + add.updates,
  servers: [...new Set([...base.servers, ...add.servers])],
});

const pruneRes = async (
  prefix: Deno.KvKey,
  index: number,
  kept: number,
  stale: Deno.KvKey[],
) => {
  for await (const e of kv.list({ prefix }, { batchSize: 500 })) {
    if ((e.key.at(-1) as number) < index - kept) stale.push(e.key);
  }
};

const pruneOld = async (
  min: number,
  fine: number,
  hour: number,
  halfDay: number,
  day: number,
) => {
  try {
    const stale: Deno.KvKey[] = [];
    await pruneRes(["metrics", "min"], min, MIN_KEPT, stale);
    await pruneRes(["metrics", "fine"], fine, FINE_KEPT, stale);
    await pruneRes(["metrics", "hour"], hour, HOUR_KEPT, stale);
    await pruneRes(["metrics", "h12"], halfDay, HALFDAY_KEPT, stale);
    await pruneRes(["metrics", "day"], day, DAY_KEPT, stale);
    await Promise.all(stale.map((k) => kv.delete(k)));
  } catch (err) {
    console.error(new Date(), "Failed to prune metrics buckets", err);
  }
};

/**
 * One-time cleanup: rewrite any bucket still holding a legacy `lobbies` field or
 * a non-finite (NaN) count, so the stored data matches the current shape. Also
 * backfills the all-time bucket from the daily buckets if it's behind — an
 * earlier NaN repair reset it to zero. Idempotent and cheap.
 */
export const repairMetrics = async () => {
  try {
    let fixed = 0;
    let dailyMsgs = 0;
    let dailyUpdates = 0;
    const dailyServers = new Set<string>();
    let allBucket: Bucket | null = null;
    const dayBuckets = new Map<number, Bucket>();
    const existingHalfDays = new Set<number>();

    for await (
      const e of kv.list<StoredBucket>(
        { prefix: ["metrics"] },
        { batchSize: 500 },
      )
    ) {
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
        dayBuckets.set(e.key.at(-1) as number, clean);
      } else if (e.key[1] === "h12") {
        existingHalfDays.add(e.key.at(-1) as number);
      } else if (e.key[1] === "all") {
        allBucket = clean;
      }
    }
    if (fixed) console.log(new Date(), "Repaired", fixed, "metric buckets");

    // Seed the 12h buckets (30d window) from existing daily buckets so 30d
    // doesn't reset when that resolution is introduced. Only past days, only
    // halves that don't already exist — current-day halves are owned by
    // recordMetrics. A day splits into halves 2d and 2d+1.
    const today = Math.floor(Date.now() / DAY);
    let seeded = 0;
    for (const [d, b] of dayBuckets) {
      if (d >= today) continue;
      const firstHalf = Math.round(b.messages / 2);
      const firstUpd = Math.round(b.updates / 2);
      const halves: [number, Bucket][] = [
        [2 * d, {
          messages: firstHalf,
          updates: firstUpd,
          servers: b.servers,
        }],
        [2 * d + 1, {
          messages: b.messages - firstHalf,
          updates: b.updates - firstUpd,
          servers: b.servers,
        }],
      ];
      for (const [idx, half] of halves) {
        if (existingHalfDays.has(idx)) continue;
        await kv.set(halfDayKey(idx), half);
        seeded++;
      }
    }
    if (seeded) console.log(new Date(), "Seeded", seeded, "12h metric buckets");

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
    const min = Math.floor(now / MIN);
    const fine = Math.floor(now / FINE);
    const hour = Math.floor(now / HOUR);
    const halfDay = Math.floor(now / HALFDAY);
    const day = Math.floor(now / DAY);

    const [minB, fineB, hourB, halfDayB, dayB, allB] = await Promise.all([
      kv.get<StoredBucket>(minKey(min)),
      kv.get<StoredBucket>(fineKey(fine)),
      kv.get<StoredBucket>(hourKey(hour)),
      kv.get<StoredBucket>(halfDayKey(halfDay)),
      kv.get<StoredBucket>(dayKey(day)),
      kv.get<StoredBucket>(allKey),
    ]);

    const sample: Bucket = {
      messages: add.messages,
      updates: add.updates,
      servers: [...new Set(add.servers)],
    };

    await Promise.all([
      kv.set(minKey(min), merge(normalize(minB.value), sample)),
      kv.set(fineKey(fine), merge(normalize(fineB.value), sample)),
      kv.set(hourKey(hour), merge(normalize(hourB.value), sample)),
      kv.set(halfDayKey(halfDay), merge(normalize(halfDayB.value), sample)),
      kv.set(dayKey(day), merge(normalize(dayB.value), sample)),
      kv.set(allKey, merge(normalize(allB.value), sample)),
    ]);

    // Sweep expired buckets about once an hour, on the first write to a new
    // minute bucket that lands on an hour boundary.
    if (!minB.value && min % 60 === 0) {
      await pruneOld(min, fine, hour, halfDay, day);
    }
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

type Resolution = "min" | "fine" | "hour" | "h12" | "day";
const windows: { label: string; ms: number; size: number; res: Resolution }[] =
  [
    { label: "1h", ms: HOUR, size: MIN, res: "min" },
    { label: "24h", ms: DAY, size: FINE, res: "fine" },
    { label: "7d", ms: 7 * DAY, size: HOUR, res: "hour" },
    { label: "30d", ms: 30 * DAY, size: HALFDAY, res: "h12" },
    { label: "90d", ms: 90 * DAY, size: DAY, res: "day" },
    { label: "1y", ms: 365 * DAY, size: DAY, res: "day" },
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

// Sum a window from its buckets, weighting the trailing boundary bucket by the
// fraction that falls inside the window. The current (leading) bucket is counted
// whole: its contents only span up to now, so all of it is in the window. Server
// counts can't be fractioned, so any overlapping bucket contributes its set.
const windowed = (
  source: Map<number, Bucket>,
  size: number,
  ms: number,
  now: number,
): MetricsWindow => {
  const start = now - ms;
  let messages = 0;
  let updates = 0;
  const servers = new Set<string>();
  for (const [index, b] of source) {
    const bStart = index * size;
    const bEnd = bStart + size;
    if (bEnd <= start || bStart >= now) continue;
    const weight = bStart < start ? (bEnd - start) / size : 1;
    messages += b.messages * weight;
    updates += b.updates * weight;
    for (const s of b.servers) servers.add(s);
  }
  return {
    label: "",
    messages: Math.round(messages),
    updates: Math.round(updates),
    servers: servers.size,
  };
};

let cache: { at: number; summary: MetricsWindow[] } | undefined;
const CACHE_MS = 60_000;

/** Summarize activity across each rolling window. Cached for a minute. */
export const getMetricsSummary = async (
  now = Date.now(),
): Promise<MetricsWindow[]> => {
  if (cache && now - cache.at < CACHE_MS) return cache.summary;

  const [min, fine, hour, h12, day, all] = await Promise.all([
    readBuckets(["metrics", "min"]),
    readBuckets(["metrics", "fine"]),
    readBuckets(["metrics", "hour"]),
    readBuckets(["metrics", "h12"]),
    readBuckets(["metrics", "day"]),
    kv.get<StoredBucket>(allKey),
  ]);
  const sources: Record<Resolution, Map<number, Bucket>> = {
    min,
    fine,
    hour,
    h12,
    day,
  };

  const summary: MetricsWindow[] = windows.map((w) => ({
    ...windowed(sources[w.res], w.size, w.ms, now),
    label: w.label,
  }));

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
