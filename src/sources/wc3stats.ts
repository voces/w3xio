/**
 * Parsing for the wc3stats `/gamelist/all` feed.
 *
 * `/gamelist/all` carries the per-slot roster that the plain `/gamelist` feed
 * omits, which is what lets us show who is actually sitting in a lobby. Every
 * other field it serves is the same data under a different shape, so this
 * module's job is to flatten it back into the {@link Lobby} shape the rest of
 * the bot — and the stored lobbies in KV — already speak.
 *
 * Kept apart from lobbies.ts so the mapping is testable without pulling in
 * Discord and Deno KV.
 */

import { z } from "zod";

/** Strips Warcraft III colour codes, e.g. `|cffffcc00Evil Pumpkins|r`. */
const stripColorCodes = (value: string): string =>
  value.replace(/\|c[0-9a-fA-F]{8}|\|[rn]/g, "").trim();

export const zLobbyTeam = z.object({
  name: z.string(),
  players: z.string().array(),
});

export type LobbyTeam = z.infer<typeof zLobbyTeam>;

const zSlot = z.object({
  computerType: z.string().nullish(),
  isComputer: z.boolean().nullish(),
  isObserver: z.boolean().nullish(),
  player: z.object({ name: z.string() }).nullish(),
  team: z.number().nullish(),
  teamName: z.string().nullish(),
});

type Slot = z.infer<typeof zSlot>;

const OBSERVERS = "Observers";

/**
 * wc3stats' own observer bot, which sits in lobbies to collect data. It holds a
 * slot but isn't somebody you'd be playing with.
 */
const TRACKER = "WC3Tracker";

/** The player in a slot, or nothing if a person isn't sitting in it. */
const playerOf = (slot: Slot): string | undefined => {
  if (slot.isComputer) return undefined;
  const name = slot.player?.name;
  return !name || name === TRACKER ? undefined : name;
};

/**
 * Groups a lobby's slots into the teams we display.
 *
 * Open slots are dropped, as are computers and wc3stats' tracker bot: the slot
 * count already says how many seats are free, and a column of filler buries the
 * players we're actually here to show. Teams the map names are kept even when
 * nobody is in them, so the shape of the game stays legible — but a team whose
 * every slot is a computer is scenery rather than somewhere to join, so those
 * are dropped outright. A team that merely *includes* an AI slot alongside free
 * ones is still joinable and stays, empty. Unnamed teams only occur
 * on maps without forces, where every free slot is its own "team", so those are
 * kept only once someone is in them. Observers are worth a line on those terms
 * too.
 */
export const slotsToTeams = (slots: Slot[]): LobbyTeam[] => {
  const teams = new Map<
    string,
    {
      name: string;
      named: boolean;
      slots: number;
      computers: number;
      players: string[];
    }
  >();

  for (const slot of slots) {
    const observer = !!slot.isObserver;
    const index = typeof slot.team === "number" && slot.team >= 0
      ? slot.team
      : 0;
    const key = observer ? OBSERVERS : `team-${index}`;
    const name = stripColorCodes(slot.teamName ?? "");

    let team = teams.get(key);
    if (!team) {
      team = {
        name: observer ? OBSERVERS : name || `Team ${index + 1}`,
        named: !observer && !!name,
        slots: 0,
        computers: 0,
        players: [],
      };
      teams.set(key, team);
    }

    team.slots++;
    const player = playerOf(slot);
    if (player) team.players.push(player);
    else if (slot.isComputer) team.computers++;
  }

  return [...teams.values()]
    .filter((team) =>
      team.players.length > 0 ||
      (team.named && team.computers < team.slots)
    )
    .map(({ name, players }) => ({ name, players }));
};

const zLobby = z.object({
  createdAt: z.string(),
  host: z.object({ battleTag: z.string() }),
  map: z.object({ path: z.string() }),
  name: z.string(),
  numPlayers: z.number(),
  numSlots: z.number(),
  region: z.string(),
  // A lobby whose roster we can't read is still a lobby worth alerting on, so a
  // malformed or absent slot list degrades to no roster rather than dropping
  // the lobby — or, since one bad entry fails the whole array, the entire feed.
  slots: zSlot.array().catch([]),
}).transform((v) => {
  // `path` is the full map path (`Maps/Download/Foo_v1.w3x`); the old feed sent
  // the bare file name. Lobby ids are built from the map, and those ids are
  // stored in KV and in the first-seen ledger, so this has to keep producing
  // exactly what `/gamelist` did or every live lobby would be reposted.
  const map = (v.map.path.split(/[\\/]/).pop() ?? v.map.path)
    .replace(/\.w3[xm]$/, "")
    .replace(/_/g, " ");
  const created = Date.parse(v.createdAt);
  const teams = slotsToTeams(v.slots);

  return {
    host: v.host.battleTag,
    map,
    name: v.name,
    server: v.region,
    slotsTaken: v.numPlayers,
    slotsTotal: v.numSlots,
    // Unix seconds, matching the old feed and the staleness guards. An
    // unparseable date leaves the lobby undated, which those guards treat as
    // "can't tell" and let through.
    created: Number.isFinite(created) ? Math.floor(created / 1000) : undefined,
    messages: [],
    // Absent rather than empty when the feed served no roster, so "we don't
    // know who is in here" stays distinguishable from "nobody is".
    teams: teams.length ? teams : undefined,
    id: `${v.name}-${v.host.battleTag}-${map}`,
  };
});

export const zGameList = z.object({ body: zLobby.array() });
