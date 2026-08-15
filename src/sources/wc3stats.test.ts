import { assertEquals } from "@std/assert";
import { slotsToTeams, zGameList, zLobbyTeam } from "./wc3stats.ts";

const open = (team: number, teamName: string | null, color = "red") => ({
  team,
  teamName,
  color,
  isComputer: false,
  isObserver: false,
  computerType: null,
  player: null,
});

const taken = (
  team: number,
  teamName: string | null,
  name: string,
  color = "red",
) => ({
  ...open(team, teamName, color),
  player: { name, battleTag: `${name}#1234` },
});

const computer = (team: number, teamName: string, computerType: string) => ({
  ...open(team, teamName),
  isComputer: true,
  computerType,
});

Deno.test("slotsToTeams: groups players under their team", () =>
  assertEquals(
    slotsToTeams([
      taken(0, "Alliance", "Clownhunt"),
      open(0, "Alliance"),
      taken(1, "Horde", "Moridin"),
      taken(1, "Horde", "ArkhanIV"),
    ]),
    [
      { name: "Alliance", players: [{ name: "Clownhunt", color: "red" }] },
      {
        name: "Horde",
        players: [{ name: "Moridin", color: "red" }, {
          name: "ArkhanIV",
          color: "red",
        }],
      },
    ],
  ));

Deno.test("slotsToTeams: keeps a named team with nobody in it", () =>
  assertEquals(
    slotsToTeams([taken(0, "Alliance", "Clownhunt"), open(1, "Horde")]),
    [
      { name: "Alliance", players: [{ name: "Clownhunt", color: "red" }] },
      { name: "Horde", players: [] },
    ],
  ));

Deno.test("slotsToTeams: drops unnamed teams holding only open slots", () =>
  assertEquals(
    slotsToTeams([taken(0, null, "Clownhunt"), open(1, null), open(2, null)]),
    [{ name: "Team 1", players: [{ name: "Clownhunt", color: "red" }] }],
  ));

Deno.test("slotsToTeams: strips colour codes from team names", () =>
  assertEquals(
    slotsToTeams([taken(0, "|cffFF8C0AEvil Pumpkins|r", "Clownhunt")]),
    [{ name: "Evil Pumpkins", players: [{ name: "Clownhunt", color: "red" }] }],
  ));

Deno.test("slotsToTeams: leaves computers out of a team people are in", () =>
  assertEquals(
    slotsToTeams([
      taken(0, "Humans", "Clownhunt"),
      computer(0, "Humans", "normal"),
      open(0, "Humans"),
    ]),
    [{ name: "Humans", players: [{ name: "Clownhunt", color: "red" }] }],
  ));

Deno.test("slotsToTeams: drops a team whose every slot is a computer", () =>
  assertEquals(
    slotsToTeams([
      taken(0, "Humans", "Clownhunt"),
      computer(1, "Legion", "normal"),
      computer(1, "Legion", "hard"),
    ]),
    [{ name: "Humans", players: [{ name: "Clownhunt", color: "red" }] }],
  ));

Deno.test("slotsToTeams: keeps a team that is still joinable beside its AI", () =>
  assertEquals(
    slotsToTeams([
      taken(0, "West Legion", "Clownhunt"),
      computer(0, "West Legion", "normal"),
      open(1, "East Legion"),
      computer(1, "East Legion", "normal"),
    ]),
    [
      { name: "West Legion", players: [{ name: "Clownhunt", color: "red" }] },
      { name: "East Legion", players: [] },
    ],
  ));

Deno.test("slotsToTeams: leaves out the WC3Tracker bot", () =>
  assertEquals(
    slotsToTeams([
      taken(0, "Alliance", "Clownhunt"),
      taken(0, "Alliance", "WC3Tracker"),
    ]),
    [{ name: "Alliance", players: [{ name: "Clownhunt", color: "red" }] }],
  ));

Deno.test("slotsToTeams: shows observers only once somebody is watching", () => {
  const observer = { ...open(5, null), isObserver: true };
  assertEquals(
    slotsToTeams([taken(0, "Alliance", "Clownhunt"), observer]),
    [{ name: "Alliance", players: [{ name: "Clownhunt", color: "red" }] }],
  );
  assertEquals(
    slotsToTeams([
      taken(0, "Alliance", "Clownhunt"),
      { ...observer, player: { name: "Moridin" } },
    ]),
    [
      { name: "Alliance", players: [{ name: "Clownhunt", color: "red" }] },
      { name: "Observers", players: [{ name: "Moridin", color: "red" }] },
    ],
  );
});

const lobby = (overrides: Record<string, unknown> = {}) => ({
  createdAt: "2026-08-14T19:29:48+00:00",
  host: { battleTag: "Clownhunt#115445", name: "Clownhunt" },
  map: {
    path: "Maps/Download/Broken_Alliances_v8.0c.w3x",
    name: "|cffffcc00Broken Alliances|r",
  },
  name: "Broken Alliances 8.0c",
  numPlayers: 3,
  numSlots: 14,
  region: "usw",
  slots: [taken(0, "Broken Alliances", "Clownhunt"), open(1, "Neutrals")],
  ...overrides,
});

Deno.test("zGameList: flattens a lobby into the shape the bot stores", () => {
  const [parsed] = zGameList.parse({ body: [lobby()] }).body;
  assertEquals(parsed, {
    host: "Clownhunt#115445",
    map: "Broken Alliances v8.0c",
    name: "Broken Alliances 8.0c",
    server: "usw",
    slotsTaken: 3,
    slotsTotal: 14,
    created: 1786735788,
    messages: [],
    teams: [
      {
        name: "Broken Alliances",
        players: [{ name: "Clownhunt", color: "red" }],
      },
      { name: "Neutrals", players: [] },
    ],
    id: "Broken Alliances 8.0c-Clownhunt#115445-Broken Alliances v8.0c",
  });
});

Deno.test("zGameList: ids match the ones the old feed produced", () => {
  // The old feed sent the bare file name; ids built from it are already stored
  // in KV, so the map path has to reduce to exactly the same string.
  const [parsed] = zGameList.parse({ body: [lobby()] }).body;
  assertEquals(
    parsed.id,
    "Broken Alliances 8.0c-Clownhunt#115445-Broken Alliances v8.0c",
  );
  assertEquals(
    zGameList.parse({
      body: [lobby({ map: { path: "Maps\\Download\\Foo_v1.w3m" } })],
    }).body[0].map,
    "Foo v1",
  );
});

Deno.test("zGameList: a lobby without a roster keeps no teams", () =>
  assertEquals(
    zGameList.parse({ body: [lobby({ slots: [] })] }).body[0].teams,
    undefined,
  ));

Deno.test("zGameList: a malformed roster drops the roster, not the lobby", () => {
  const [parsed] = zGameList.parse({ body: [lobby({ slots: "nonsense" })] })
    .body;
  assertEquals(parsed.teams, undefined);
  assertEquals(parsed.name, "Broken Alliances 8.0c");
});

Deno.test("zGameList: an unparseable creation date leaves the lobby undated", () =>
  assertEquals(
    zGameList.parse({ body: [lobby({ createdAt: "not a date" })] }).body[0]
      .created,
    undefined,
  ));

Deno.test("slotsToTeams: carries each slot's colour for its pip", () =>
  assertEquals(
    slotsToTeams([
      taken(0, "Alliance", "Clownhunt", "red"),
      taken(0, "Alliance", "Moridin", "light_blue"),
      taken(1, "Horde", "ArkhanIV", "yellow"),
    ]),
    [
      {
        name: "Alliance",
        players: [
          { name: "Clownhunt", color: "red" },
          { name: "Moridin", color: "light_blue" },
        ],
      },
      { name: "Horde", players: [{ name: "ArkhanIV", color: "yellow" }] },
    ],
  ));

Deno.test("zLobbyTeam: reads back rosters stored before pips existed", () =>
  assertEquals(
    zLobbyTeam.parse({ name: "Alliance", players: ["Clownhunt", "Moridin"] }),
    { name: "Alliance", players: [{ name: "Clownhunt" }, { name: "Moridin" }] },
  ));
