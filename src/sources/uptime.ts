import { kv } from "./kv.ts";

// Uptime tracking for the classic 90-day status stripe. For each service we
// accumulate, per UTC day, how many ms it was up and how many ms we observed it
// — so a day's uptime is up/total and the headline figure is the sum over the
// window.
//
// The bot ("Live Lobbies") can't record while it's down, so we measure from the
// gap between heartbeats: each cycle attributes the elapsed time since the last
// beat as "up", unless the gap is too large (a restart/outage), in which case
// only a small grace window counts and the rest is downtime. "Up" also requires
// a feed to be available — if both wc3stats and wc3maps are down the bot can't
// serve lobbies, so that counts as downtime even though the process is alive.
// This makes Live Lobbies the OR of the two feeds (plus process liveness).
//
// wc3stats / wc3maps are only credited time we actually observed them. We don't
// probe wc3maps while wc3stats is online, so on days that stayed on wc3stats the
// wc3maps total is simply zero (shown as "no data"), which is the intended
// caveat.

const DAY = 24 * 60 * 60 * 1000;
// Largest gap between heartbeats still treated as the bot being up. Cycles run
// every ~10s and always finish within the 60s watchdog, so a gap beyond this
// means the process was actually down.
const MAX_GAP = 90 * 1000;
const DAYS_SHOWN = 90;
const DAYS_KEPT = DAYS_SHOWN + 2;

const services = [
  { key: "bot", label: "Live Lobbies" },
  { key: "wc3stats", label: "wc3stats" },
  { key: "wc3maps", label: "wc3maps" },
] as const;

type Day = { up: number; total: number };

const beatKey = ["uptime", "lastBeat"];

// Split [start, end) across UTC-day buckets, adding the per-day overlap to the
// given field.
const addInterval = (
  deltas: Map<number, Day>,
  start: number,
  end: number,
  field: "up" | "total",
) => {
  for (let s = start; s < end;) {
    const day = Math.floor(s / DAY);
    const dayEnd = (day + 1) * DAY;
    const slice = Math.min(end, dayEnd) - s;
    const d = deltas.get(day) ?? { up: 0, total: 0 };
    d[field] += slice;
    deltas.set(day, d);
    s = dayEnd;
  }
};

const accrue = async (
  service: string,
  totalStart: number,
  totalEnd: number,
  upStart: number,
  upEnd: number,
) => {
  const deltas = new Map<number, Day>();
  addInterval(deltas, totalStart, totalEnd, "total");
  if (upEnd > upStart) addInterval(deltas, upStart, upEnd, "up");
  await Promise.all(
    [...deltas].map(async ([day, d]) => {
      const key = ["uptime", service, day];
      const cur = (await kv.get<Day>(key)).value ?? { up: 0, total: 0 };
      await kv.set(key, { up: cur.up + d.up, total: cur.total + d.total });
    }),
  );
};

const prune = async (today: number) => {
  try {
    const stale: Deno.KvKey[] = [];
    for (const { key: service } of services) {
      for await (
        const e of kv.list({ prefix: ["uptime", service] }, { batchSize: 500 })
      ) {
        const day = e.key.at(-1);
        if (typeof day === "number" && day < today - DAYS_KEPT) {
          stale.push(e.key);
        }
      }
    }
    await Promise.all(stale.map((k) => kv.delete(k)));
  } catch (err) {
    console.error(new Date(), "Failed to prune uptime buckets", err);
  }
};

type Liveness = {
  wc3statsUp: boolean;
  wc3mapsUp: boolean;
  wc3mapsChecked: boolean;
};

/**
 * Heartbeat. Call once per update cycle with the freshly observed source
 * liveness. Attributes the time since the last beat to the bot, wc3stats, and
 * (when checked) wc3maps.
 */
export const recordUptime = async (liveness: Liveness, now = Date.now()) => {
  try {
    const lastBeat = (await kv.get<number>(beatKey)).value;
    await kv.set(beatKey, now);
    // First beat ever, or a clock that went backwards: nothing to attribute.
    if (typeof lastBeat !== "number" || now <= lastBeat) return;

    // The window we trust as observed: from the last beat up to a grace cap.
    // For a normal cycle this is the whole gap; after an outage it's just the
    // grace window and the rest of the gap is the bot's downtime.
    const coveredEnd = Math.min(now, lastBeat + MAX_GAP);

    // The lobby service is functional whenever a feed is available; if both are
    // down (or the process is) it can't serve lobbies, so that's downtime.
    const feedUp = liveness.wc3statsUp || liveness.wc3mapsUp;

    await Promise.all([
      // Live Lobbies: up = process alive (covered window) AND a feed available.
      accrue("bot", lastBeat, now, lastBeat, feedUp ? coveredEnd : lastBeat),
      // Sources: only credit time we actually observed (the covered window).
      accrue(
        "wc3stats",
        lastBeat,
        coveredEnd,
        lastBeat,
        liveness.wc3statsUp ? coveredEnd : lastBeat,
      ),
      liveness.wc3mapsChecked
        ? accrue(
          "wc3maps",
          lastBeat,
          coveredEnd,
          lastBeat,
          liveness.wc3mapsUp ? coveredEnd : lastBeat,
        )
        : Promise.resolve(),
    ]);

    // Sweep expired buckets once a day, when the day rolls over.
    if (Math.floor(lastBeat / DAY) !== Math.floor(now / DAY)) {
      await prune(Math.floor(now / DAY));
    }
  } catch (err) {
    console.error(new Date(), "Failed to record uptime", err);
  }
};

export type UptimeDay = { day: number; up: number; total: number };
export type ServiceUptime = {
  label: string;
  days: UptimeDay[];
  overallUp: number;
  overallTotal: number;
};

let cache: { at: number; summary: ServiceUptime[] } | undefined;
const CACHE_MS = 60_000;

/** Per-service uptime over the last DAYS_SHOWN days. Cached for a minute. */
export const getUptimeSummary = async (): Promise<ServiceUptime[]> => {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.summary;

  const today = Math.floor(Date.now() / DAY);
  const start = today - (DAYS_SHOWN - 1);

  const summary = await Promise.all(services.map(async ({ key, label }) => {
    const buckets = new Map<number, Day>();
    for await (
      const e of kv.list<Day>({ prefix: ["uptime", key] }, { batchSize: 500 })
    ) {
      const day = e.key.at(-1);
      if (typeof day === "number") buckets.set(day, e.value);
    }

    const days: UptimeDay[] = [];
    let overallUp = 0;
    let overallTotal = 0;
    for (let d = start; d <= today; d++) {
      const b = buckets.get(d) ?? { up: 0, total: 0 };
      days.push({ day: d, up: b.up, total: b.total });
      overallUp += b.up;
      overallTotal += b.total;
    }
    return { label, days, overallUp, overallTotal };
  }));

  cache = { at: Date.now(), summary };
  return summary;
};
