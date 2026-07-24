import { assertEquals } from "@std/assert";
import {
  dropStaleLobbies,
  isKnownInstance,
  isStaleLobby,
  MAX_LOBBY_AGE_S,
  REMAKE_MARGIN_MS,
} from "./staleness.ts";

const NOW_S = 1_700_000_000;
const NOW_MS = NOW_S * 1000;

Deno.test("isStaleLobby: a fresh lobby is not stale", () =>
  assertEquals(isStaleLobby(NOW_S - 60, NOW_S), false));

Deno.test("isStaleLobby: a lobby at the age limit is not stale", () =>
  assertEquals(isStaleLobby(NOW_S - MAX_LOBBY_AGE_S, NOW_S), false));

Deno.test("isStaleLobby: a lobby past the age limit is stale", () =>
  assertEquals(isStaleLobby(NOW_S - MAX_LOBBY_AGE_S - 1, NOW_S), true));

Deno.test("isStaleLobby: the 30h wc3maps ghost is stale", () =>
  assertEquals(isStaleLobby(NOW_S - 30 * 60 * 60, NOW_S), true));

Deno.test("isStaleLobby: an undated lobby is kept", () =>
  assertEquals(isStaleLobby(undefined, NOW_S), false));

Deno.test("dropStaleLobbies: keeps fresh, drops ancient, keeps undated", () =>
  assertEquals(
    dropStaleLobbies([
      { created: NOW_S - 60 },
      { created: NOW_S - 30 * 60 * 60 },
      { created: undefined },
    ], NOW_S),
    [{ created: NOW_S - 60 }, { created: undefined }],
  ));

Deno.test("isKnownInstance: no ledger entry means treat as new", () =>
  assertEquals(isKnownInstance(NOW_S, null), false));

Deno.test("isKnownInstance: an undated lobby is treated as new", () =>
  assertEquals(isKnownInstance(undefined, NOW_MS), false));

Deno.test("isKnownInstance: a lobby created before we saw it is known", () =>
  assertEquals(isKnownInstance(NOW_S - 120, NOW_MS), true));

Deno.test("isKnownInstance: the 30h ghost of a lobby we posted is known", () => {
  // The feed still serves it with its original timestamp, so it dates to right
  // about when we first saw it 30 hours ago.
  const firstSeenAt = NOW_MS - 30 * 60 * 60 * 1000;
  assertEquals(isKnownInstance(NOW_S - 30 * 60 * 60, firstSeenAt), true);
});

Deno.test("isKnownInstance: a source stamping created slightly late is still known", () => {
  // wc3maps may have first seen the lobby minutes after wc3stats did, so its
  // `created` sits a little after our own first sighting.
  assertEquals(isKnownInstance(NOW_S + 120, NOW_MS), true);
});

Deno.test("isKnownInstance: a lobby remade well after we saw the last one is new", () =>
  assertEquals(
    isKnownInstance(NOW_S + REMAKE_MARGIN_MS / 1000 + 60, NOW_MS),
    false,
  ));

Deno.test("isKnownInstance: a remake a day later is new", () =>
  assertEquals(isKnownInstance(NOW_S + 24 * 60 * 60, NOW_MS), false));
