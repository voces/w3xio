import { z } from "npm:zod";
import { discord } from "./discord.ts";

const hashString = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char; // Bitwise operations to mix the hash
    hash |= 0; // Convert to a 32bit integer
  }
  return hash;
};

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
}).transform((v) => ({ ...v, id: hashString(`${v.name}-${v.host}-${v.map}`) }));

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
}).transform(({ path, region, slots_taken, slots_total, ...v }) => ({
  ...v,
  id: hashString(`${v.name}-${v.host}-${path}`),
  map: path,
  server: region,
  slotsTaken: slots_taken,
  slotsTotal: slots_total,
  messages: [],
}));
const thGameList = z.object({ results: thLobby.array() });

export type DataSource = "none" | "wc3stats" | "wc3maps";
let dataSource: DataSource = "none";

const ensureDataSource = (newDatasSource: DataSource) => {
  if (dataSource === newDatasSource) return;
  dataSource = newDatasSource;
  discord.applications.editCurrent({
    description: `Lobby feed: ${dataSource}${
      dataSource === "none" ? "" : ".com"
    }`,
  })
    .then((v) => console.log(new Date(), v.description))
    .catch(console.error);
};

export const wc3stats = {
  gamelist: async (): Promise<
    { lobbies: Lobby[]; dataSource: DataSource }
  > => {
    const wc3StatsLobbies = await fetch("https://api.wc3stats.com/gamelist")
      .then((r) => r.json())
      .then((r) => zGameList.parse(r).body)
      .catch((err) => {
        console.error(err);
        return [];
      });

    if (wc3StatsLobbies.length > 0) {
      ensureDataSource("wc3stats");
      return { lobbies: wc3StatsLobbies, dataSource };
    }

    const wc3MapsLobbies = await fetch("https://wc3maps.com/api/lobbies")
      .then((r) => r.json())
      .then((r) => thGameList.parse(r).results)
      .catch((err) => {
        console.error(err);
        return [];
      });
    if (wc3MapsLobbies.length > 0 && dataSource !== "wc3maps") {
      ensureDataSource("wc3maps");
    } else if (dataSource !== "none") {
      ensureDataSource("none");
    }

    return { lobbies: wc3MapsLobbies, dataSource };
  },
};
