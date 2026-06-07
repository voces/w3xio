import { z } from "npm:zod";
import { discord, messageAdmin, messageAnders } from "./discord.ts";

export const zLobby = z.object({
  host: z.string(),
  map: z.string().transform((v) =>
    v.replace(/\.w3[xm]$/, "").replace(/_/g, " ")
  ),
  name: z.string(),
  server: z.string(),
  slotsTaken: z.number(),
  slotsTotal: z.number(),
  messages: z.object({ channel: z.string(), message: z.string() }).array()
    .optional()
    .default([]),
  deadAt: z.number().optional(),
  created: z.number().optional(),
  dead: z.boolean().optional(),
}).transform((v) => ({ ...v, id: `${v.name}-${v.host}-${v.map}` }));

export type Lobby = z.infer<typeof zLobby>;

const zGameList = z.object({ body: zLobby.array() });

const thLobby = z.object({
  host: z.string(),
  path: z.string().transform((v) =>
    v.replace(/\.w3[xm]$/, "").replace(/_/g, " ")
  ),
  name: z.string(),
  region: z.string(),
  slots_taken: z.number(),
  slots_total: z.number(),
  created: z.number(),
}).transform(({ path, region, slots_taken, slots_total, ...v }) => ({
  ...v,
  id: `${v.name}-${v.host}-${path}`,
  map: path,
  server: region,
  slotsTaken: slots_taken,
  slotsTotal: slots_total,
  messages: [],
}));
const thGameList = z.object({ data: thLobby.array() });

export type DataSource = "init" | "none" | "wc3stats" | "wc3maps";
let dataSource: DataSource = "init";
let strikeLastAndersMessage: (() => void) | void;
export const getDataSource = () => dataSource;

let wc3statsUp = false;
let wc3mapsUp = false;
let wc3mapsChecked = false;
export const getSourceLiveness = () => ({
  wc3statsUp,
  wc3mapsUp,
  wc3mapsChecked,
});

// Persisted so the active feed survives reboots: we only want to alert the
// admin on a *true* change of source, not re-announce the same one on every
// restart.
let onDataSourceChange: ((source: DataSource) => void) | undefined;
export const setOnDataSourceChange = (fn: (source: DataSource) => void) => {
  onDataSourceChange = fn;
};
export const restoreDataSource = (source: DataSource) => {
  if (dataSource === "init") dataSource = source;
};

const ensureDataSource = (newDataSource: DataSource) => {
  if (dataSource === newDataSource) return;
  const oldDataSource = dataSource;
  dataSource = newDataSource;
  // Persist immediately so a restart resumes on the same source silently.
  onDataSourceChange?.(newDataSource);
  discord.applications.editCurrent({
    description: `Lobby feed: ${dataSource}${
      dataSource === "none" ? "" : ".com"
    }`,
  })
    .then((v) => {
      console.log(new Date(), v.description);
      messageAdmin(v.description);
      if (oldDataSource === "wc3stats") {
        messageAnders("wc3stats down!").then((strike) =>
          strikeLastAndersMessage = strike
        );
      } else if (newDataSource === "wc3stats" && strikeLastAndersMessage) {
        strikeLastAndersMessage();
      }
    })
    .catch((err: unknown) => {
      console.error(new Date(), err);
      messageAdmin(`${err}`);
    });
};

let failedTries = 0;
// Timestamps (ms) used to throttle how often we probe an unavailable feed.
let lastWc3statsProbe = 0;
let lastBothDownProbe = 0;

// Network tuning.
const PROBE_TIMEOUT_MS = 5_000;
// Both feeds down: give slow/struggling servers more room since we're not
// racing a live update and only probe about once a minute anyway.
const DOWN_TIMEOUT_MS = 15_000;
// Retries only for the active (normally-succeeding) source — never for probes.
const ACTIVE_RETRIES = 2;
const RETRY_DELAY_MS = 500;
// While wc3maps is serving as fallback, re-probe wc3stats this often to detect
// recovery instead of hammering it every 10s cycle.
const WC3STATS_RECHECK_MS = 5 * 60_000;
// While both feeds are down, re-probe this often — aggressive enough to wake up
// quickly, but not every cycle.
const BOTH_DOWN_RECHECK_MS = 60_000;

const fetchLobbies = async (
  url: string,
  parse: (r: Response) => Lobby[] | Promise<Lobby[]>,
  { retries, timeoutMs }: { retries: number; timeoutMs: number },
): Promise<Lobby[]> => {
  for (let attempt = 0;; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      return await parse(r);
    } catch (err) {
      if (attempt >= retries) {
        console.error(new Date(), `Failed to fetch ${url}:`, err);
        return [];
      }
      console.warn(new Date(), `Retrying ${url} (${attempt + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
};

const parseWc3stats = (r: Response): Promise<Lobby[]> =>
  r.json().then((j) => {
    const list = zGameList.parse(j).body;
    const mostRecent = Math.max(
      ...list.map((l) => l.created).filter((v) => typeof v === "number"),
    );
    if (Date.now() / 1000 - mostRecent > 300) return [];
    return list;
  });

const parseWc3maps = async (r: Response): Promise<Lobby[]> => {
  const text = await r.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    console.debug(new Date(), "Invalid json:", text);
    throw new Error(`Expected json, got ${r.headers.get("content-type")}`);
  }
  const list = thGameList.parse(json).data;
  const mostRecent = Math.max(...list.map((l) => l.created));
  if (Date.now() / 1000 - mostRecent > 600) return [];
  return list;
};

export const getLobbies = async (): Promise<
  { lobbies: Lobby[]; dataSource: DataSource }
> => {
  const now = Date.now();
  const bothDown = dataSource === "none";

  // Both feeds are down: don't spin every 10s. Re-probe about once a minute and
  // serve nothing in between.
  if (bothDown) {
    if (now - lastBothDownProbe < BOTH_DOWN_RECHECK_MS) {
      return { lobbies: [], dataSource };
    }
    lastBothDownProbe = now;
  }

  const timeoutMs = bothDown ? DOWN_TIMEOUT_MS : PROBE_TIMEOUT_MS;

  // wc3stats is the preferred source. Probe it every cycle while it's active;
  // once we've fallen back to wc3maps only re-probe periodically to detect
  // recovery instead of hammering a down service every 10s.
  const probeWc3stats = dataSource === "wc3stats" || dataSource === "init" ||
    bothDown ||
    (dataSource === "wc3maps" && now - lastWc3statsProbe >= WC3STATS_RECHECK_MS);

  if (probeWc3stats) {
    lastWc3statsProbe = now;
    const wc3StatsLobbies = await fetchLobbies(
      "https://api.wc3stats.com/gamelist",
      parseWc3stats,
      { retries: dataSource === "wc3stats" ? ACTIVE_RETRIES : 0, timeoutMs },
    );

    wc3statsUp = wc3StatsLobbies.length > 0;

    if (wc3statsUp) {
      wc3mapsChecked = false;
      ensureDataSource("wc3stats");
      return { lobbies: wc3StatsLobbies, dataSource };
    }
  }

  const wc3MapsLobbies = await fetchLobbies(
    "https://wc3maps.com/api/lobbies",
    parseWc3maps,
    { retries: dataSource === "wc3maps" ? ACTIVE_RETRIES : 0, timeoutMs },
  );
  wc3mapsChecked = true;
  wc3mapsUp = wc3MapsLobbies.length > 0;
  if (wc3mapsUp) {
    failedTries = 0;
    if (dataSource !== "wc3maps") ensureDataSource("wc3maps");
  } else {
    failedTries++;
    if (failedTries > 5 && dataSource !== "none") ensureDataSource("none");
  }

  return { lobbies: wc3MapsLobbies, dataSource };
};
