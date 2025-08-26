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

const ensureDataSource = (newDatasSource: DataSource) => {
  if (dataSource === newDatasSource) return;
  const oldDataSource = dataSource;
  dataSource = newDatasSource;
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
      } else if (newDatasSource === "wc3stats" && strikeLastAndersMessage) {
        strikeLastAndersMessage();
      }
    })
    .catch((err: unknown) => {
      console.error(new Date(), err);
      messageAdmin(`${err}`);
    });
};

let failedTries = 0;

export const getLobbies = async (): Promise<
  { lobbies: Lobby[]; dataSource: DataSource }
> => {
  const wc3StatsLobbies = await fetch("https://api.wc3stats.com/gamelist")
    .then((r) => r.json())
    .then((r) => {
      const list = zGameList.parse(r).body;
      const mostRecent = Math.max(
        ...list.map((l) => l.created).filter((v) => typeof v === "number"),
      );
      if (Date.now() / 1000 - mostRecent > 300) return [];
      return list;
    })
    .catch((err) => {
      console.error(err);
      return [];
    });

  if (wc3StatsLobbies.length > 0) {
    ensureDataSource("wc3stats");
    return { lobbies: wc3StatsLobbies, dataSource };
  }

  const wc3MapsLobbies = await fetch("https://wc3maps.com/api/lobbies")
    .then(async (r) => {
      const text = await r.text();
      try {
        return JSON.parse(text);
      } catch {
        console.debug(new Date(), "Invalid json:", text);
        throw new Error(
          `Expected json, got ${r.headers.get("content-type")}`,
        );
      }
    })
    .then((r) => {
      const list = thGameList.parse(r).data;
      const mostRecent = Math.max(...list.map((l) => l.created));
      if (Date.now() / 1000 - mostRecent > 600) return [];
      return list;
    })
    .catch((err) => {
      console.error(new Date(), err);
      return [];
    });
  if (wc3MapsLobbies.length > 0) {
    failedTries = 0;
    if (dataSource !== "wc3maps") ensureDataSource("wc3maps");
  } else {
    failedTries++;
    if (failedTries > 5 && dataSource !== "none") ensureDataSource("none");
  }

  return { lobbies: wc3MapsLobbies, dataSource };
};
