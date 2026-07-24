/**
 * Timestamp guards that stop a stale feed entry from being mistaken for a brand
 * new lobby.
 *
 * Both feeds report `created` in Unix seconds, and each stamps it when *it*
 * first saw the lobby, so the two can disagree by a few seconds about the same
 * game. Every comparison here is therefore one-sided and generously margined:
 * we only suppress on evidence that a lobby is *much* older than it could be if
 * it were genuinely new, and we fall back to treating a lobby as new whenever
 * the timestamps can't settle it.
 */

/**
 * A lobby that has been open this long is a stale feed entry rather than a
 * joinable game. wc3maps has been observed serving lobbies 30h+ after they
 * closed, which is what let a long-dead game reappear as "new" every time the
 * bot fell back to it.
 */
export const MAX_LOBBY_AGE_S = 12 * 60 * 60;

/**
 * How much later than our first sighting a lobby must have been created before
 * we accept it as a genuine remake rather than the same instance resurfacing.
 * We only ask this of lobbies we've already finished with, and a lobby only
 * reaches that state after leaving the list and serving out its five minute
 * death grace, so a real remake clears this window comfortably.
 */
export const REMAKE_MARGIN_MS = 10 * 60 * 1000;

/** Whether a lobby has been open too long to be a real, joinable game. */
export const isStaleLobby = (
  created: number | undefined,
  nowS: number,
): boolean => created !== undefined && nowS - created > MAX_LOBBY_AGE_S;

/**
 * Whether an incoming lobby is one we've already picked up rather than a new
 * one sharing its name, host, and map.
 *
 * A remake is created *after* we first saw the lobby it replaces; a stale feed
 * entry still carries the original's creation time. Comparing against our own
 * clock rather than the other feed's `created` keeps this immune to the two
 * sources disagreeing about when a lobby appeared.
 */
export const isKnownInstance = (
  created: number | undefined,
  firstSeenAt: number | null | undefined,
): boolean => {
  // No memory of the lobby, or nothing to date it by. Fail open: a duplicate
  // post is recoverable, silently swallowing real lobbies is not.
  if (!firstSeenAt || created === undefined) return false;
  return created * 1000 <= firstSeenAt + REMAKE_MARGIN_MS;
};

/** Drops lobbies a feed is still serving long after they stopped existing. */
export const dropStaleLobbies = <T extends { created?: number }>(
  lobbies: T[],
  nowS: number = Date.now() / 1000,
): T[] => lobbies.filter((l) => !isStaleLobby(l.created, nowS));
