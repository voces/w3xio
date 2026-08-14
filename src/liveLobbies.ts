import {
  DataSource,
  getLobbies,
  getSourceLiveness,
  Lobby,
  restoreDataSource,
  setOnDataSourceChange,
} from "./sources/lobbies.ts";
import { Alert, db, lobbyLedger, meta, Rule } from "./sources/kv.ts";
import { isKnownInstance } from "./sources/staleness.ts";
import { discord, messageAdminAndWarn } from "./sources/discord.ts";
import { DiscordAPIError } from "@discordjs/rest";
import {
  AllowedMentionsTypes,
  APIEmbed,
  APIEmbedField,
  APIEmbedFooter,
} from "discord-api-types/v10";
import { LobbyTeam } from "./sources/wc3stats.ts";
import { getReplayMap, getReplays } from "./sources/replays.ts";
import { notifyHealthy, notifyReady } from "./sources/watchdog.ts";
import { recordMetrics, repairMetrics } from "./sources/metrics.ts";
import { recordUptime } from "./sources/uptime.ts";
import { renderMessage } from "./template.ts";

export const stats = { lastDataUpdate: 0 };

let cachedLobbies: Lobby[] = [];
export const getCachedLobbies = () => cachedLobbies;

let lobbyCache: Map<string, Lobby> | undefined;
const setLobby = async (lobby: Lobby) => {
  await db.lobbies.set(lobby.id, lobby, { overwrite: true });
  lobbyCache?.set(lobby.id, lobby);
};
const deleteLobby = async (id: string) => {
  await db.lobbies.delete(id);
  lobbyCache?.delete(id);
};

const UPDATES_PER_MINUTE = 6;
// Load shedding only applies to updates of alive or missing lobbies; creation
// and deads always get sent
const BUCKET_CAPACITY = 10;
const BUCKET_RATE = 2;

export const process = (rules: Rule[], lobby: Lobby): boolean =>
  rules.every(({ key, value }) => {
    const lobbyValue = lobby[key];
    if (!lobbyValue) return false;
    if (typeof value === "string") {
      if (key === "server") {
        const lowerCaseLobbyValue = lobbyValue.toLowerCase();
        return value.toLowerCase().split(",").map((v) => v.trim())
          .some((v) => lowerCaseLobbyValue.includes(v));
      }
      return lobbyValue.toLowerCase().includes(value.toLowerCase());
    }
    return !!lobbyValue.match(value);
  });

const rulesToFilter =
  (rules: Rule[]): (lobby: Lobby) => boolean => (lobby: Lobby): boolean =>
    process(rules, lobby);

const colors = {
  alive: 0x6edb6f,
  missing: 0xe69500,
  dead: 0xff7d9c,
};

// Discord caps an embed at 25 fields, and the roster shares that budget with
// the lobby's own fields. A wall of teams stops being readable well before the
// limit anyway, so cut it earlier and say how much was left off.
const MAX_TEAM_FIELDS = 12;
const FIELD_NAME_LIMIT = 256;
const FIELD_VALUE_LIMIT = 1024;

const truncate = (value: string, limit: number) =>
  value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;

// Player and team names are arbitrary text; left alone, an underscore or
// asterisk in one silently turns into Discord formatting.
const escapeMarkdown = (value: string) =>
  value.replace(/([\\*_~`|>])/g, "\\$1");

// wc3stats publishes no logo asset we can hotlink, so its credit is text only.
const footers: Partial<Record<DataSource, APIEmbedFooter>> = {
  wc3stats: { text: "Powered by https://wc3stats.com" },
  wc3maps: {
    text: "Powered by https://wc3maps.com",
    icon_url: "https://wc3maps.com/images/logo-square.jpg",
  },
};

const teamFields = (teams: LobbyTeam[]): APIEmbedField[] => {
  const shown = teams.slice(0, MAX_TEAM_FIELDS);
  const fields = shown.map((team) => ({
    name: truncate(escapeMarkdown(team.name), FIELD_NAME_LIMIT),
    value: team.players.length
      ? truncate(
        team.players.map(escapeMarkdown).join("\n"),
        FIELD_VALUE_LIMIT,
      )
      : "*empty*",
    inline: true,
  }));
  const hidden = teams.length - shown.length;
  if (hidden > 0) {
    fields.push({ name: "…", value: `+${hidden} more teams`, inline: true });
  }
  return fields;
};

const getEmbed = (
  lobby: Lobby,
  status: "alive" | "missing" | "dead",
  dataSource: DataSource,
  advanced: Alert["advanced"] | undefined,
  replayId?: number,
): APIEmbed => ({
  color: colors[status],
  title: lobby.map,
  fields: [
    { name: "Game name", value: lobby.name },
    { name: "Host", value: lobby.host, inline: true },
    { name: "Realm", value: lobby.server, inline: true },
    {
      name: "Players",
      value: `${lobby.slotsTaken}/${
        lobby.slotsTotal - (advanced?.slotOffset ?? 0)
      }`,
      inline: true,
    },
    ...(lobby.teams?.length ? teamFields(lobby.teams) : []),
    ...(replayId
      ? [{
        name: "Replay",
        value: `[Download / Stats](https://wc3stats.com/games/${replayId})`,
      }]
      : []),
  ],
  footer: footers[dataSource],
  thumbnail: advanced?.thumbnail ? { url: advanced.thumbnail } : undefined,
});

// The roster is observed on its own schedule, a little behind the slot counts,
// so a posted lobby can be one player-swap — or one cycle — out of date while
// its count sits still. Comparing the rendered roster catches both. A feed that
// reports no roster at all never reaches this: see the carry-over below.
const teamsKey = (teams: LobbyTeam[] | undefined) =>
  teams?.map((t) => `${t.name}:${t.players.join(",")}`).join("|") ?? "";

const onNewLobby = async (
  lobby: Lobby,
  alerts: Alert[],
  dataSource: DataSource,
) => {
  console.debug(new Date(), "New lobby", lobby.name);
  stats.lastDataUpdate = Date.now();
  const results = await Promise.all(
    alerts
      .filter((a) => rulesToFilter(a.rules)(lobby))
      .map(async (alert) => {
        try {
          const renderedMessage = renderMessage(alert.message, lobby);
          const message = await discord.channels.createMessage(
            alert.channelId,
            {
              content: renderedMessage,
              embeds: [getEmbed(lobby, "alive", dataSource, alert.advanced)],
              allowed_mentions: {
                parse: [
                  AllowedMentionsTypes.Role,
                  AllowedMentionsTypes.Everyone,
                ],
              },
            },
          );
          console.log(
            new Date(),
            "Posted lobby",
            lobby.name,
            "in channel",
            alert.channelId,
            lobby.map,
          );
          return { channel: alert.channelId, message: message.id };
        } catch (err) {
          if (!(err instanceof DiscordAPIError)) {
            console.error(
              "Error posting message in channel",
              alert.channelId,
              err,
            );
          } else if (
            err.code === 50001 || err.code === 50007 || err.code === 50013
          ) {
            messageAdminAndWarn(
              "Lacking permission to send messages, removing alert channel",
              alert.channelId,
            );
            db.alerts.delete(alert.channelId);
          } else if (err.code === 10003) {
            messageAdminAndWarn(
              "Unknown channel, likely deleted",
              alert.channelId,
            );
            db.alerts.delete(alert.channelId);
          } else {
            console.error(
              "Error posting message in channel",
              alert.channelId,
              err,
            );
          }
        }
      }),
  );
  return results.filter(<T>(v: T | undefined): v is T => !!v);
};

const channelThrottles: Record<
  string,
  { lastUpdate: number; bucket: number } | undefined
> = {};
const updateMessage = async (
  channel: string,
  message: string,
  lobby: Lobby,
  status: "alive" | "missing" | "dead",
  dataSource: DataSource,
  alert: Alert | undefined,
  replayId?: number,
): Promise<boolean> => {
  try {
    if (status === "alive" || status === "missing") {
      const channelThrottle = channelThrottles[channel] ??
        (channelThrottles[channel] = {
          lastUpdate: 0,
          bucket: BUCKET_CAPACITY,
        });
      if (channelThrottle.bucket <= 0) {
        console.debug(
          new Date(),
          "Shedding lobby update",
          lobby.name,
          "in channel",
          channel,
        );
        return false;
      }
      channelThrottle.bucket--;
      channelThrottle.lastUpdate = Date.now();
    }
    await discord.channels.editMessage(channel, message, {
      embeds: [getEmbed(lobby, status, dataSource, alert?.advanced, replayId)],
    });
    console.log(
      new Date(),
      "Updated lobby",
      lobby.name,
      "in channel",
      channel,
      "with status",
      status,
      `${lobby.slotsTaken}/${lobby.slotsTotal}`,
    );
    return true;
  } catch (err) {
    if (!(err instanceof DiscordAPIError)) {
      console.error("Error updating message in channel", channel, err);
    } else if (err.code === 10008) {
      console.warn(new Date(), "Message deleted in channel", channel);
      lobby.messages = lobby.messages.filter((m) => m.message !== message);
    } else console.error("Error updating message in channel", channel, err);
    return false;
  }
};

// Returns the number of messages actually edited (excludes throttle-shed and
// failed edits) so callers can count the work emitted.
const onUpdateLobby = async (
  lobby: Lobby,
  dataSource: DataSource,
  alerts: Alert[],
): Promise<number> => {
  console.debug(new Date(), "Updating lobby", lobby.name);
  stats.lastDataUpdate = Date.now();
  const edited = await Promise.all(
    lobby.messages.map(({ channel, message }) =>
      updateMessage(
        channel,
        message,
        lobby,
        "alive",
        dataSource,
        alerts.find((a) => a.channelId === channel),
      )
    ),
  );
  return edited.filter(Boolean).length;
};

const onMissingLobby = async (
  lobby: Lobby,
  dataSource: DataSource,
  alerts: Alert[],
) => {
  // Missing lobbies don't work correctly on AWS for some reason
  // console.debug(new Date(), "Missing lobby", lobby.name);
  await Promise.all(
    lobby.messages.map(({ channel, message }) =>
      updateMessage(
        channel,
        message,
        lobby,
        "missing",
        dataSource,
        alerts.find((a) => a.channelId === channel),
      )
    ),
  );
};

const onDeadLobby = async (
  lobby: Lobby,
  dataSource: DataSource,
  alerts: Alert[],
) => {
  console.debug(new Date(), "Dead lobby", lobby.name);
  await Promise.all(
    lobby.messages.map(({ channel, message }) =>
      updateMessage(
        channel,
        message,
        lobby,
        "dead",
        dataSource,
        alerts.find((a) => a.channelId === channel),
      )
    ),
  );
};

const onLobbyReplayPosted = async (
  lobby: Lobby,
  dataSource: DataSource,
  alerts: Alert[],
  replayId: number,
) => {
  console.debug(new Date(), "Replay posted", lobby.name);
  await Promise.all(
    lobby.messages.map(({ channel, message }) =>
      updateMessage(
        channel,
        message,
        lobby,
        "dead",
        dataSource,
        alerts.find((a) => a.channelId === channel),
        replayId,
      )
    ),
  );
};

const updateLobbies = async () => {
  const now = Date.now();
  for (const channel in channelThrottles) {
    const throttle = channelThrottles[channel]!;
    if (now - throttle.lastUpdate > 30 * 60 * 1000) {
      delete channelThrottles[channel];
    } else {
      throttle.bucket = Math.min(
        BUCKET_CAPACITY,
        throttle.bucket + BUCKET_RATE,
      );
    }
  }

  const [
    { lobbies: newLobbies, dataSource },
    oldLobbies,
    alerts,
    replays,
  ] = await Promise.all([
    getLobbies(),
    db.lobbies.getMany().then((v) =>
      Promise.all(v.result.map(async (d) => {
        if (d.id !== d.value.id) {
          console.warn(
            new Date(),
            "Found mismatch between document id and value id; restoring and cleaning",
            d,
          );
          await db.lobbies.set(d.value.id, d.value, { overwrite: true });
          await db.lobbies.delete(d.id);
        }
        return d.value;
      }))
    ),
    db.alerts.getMany().then((v) => v.result.map((v) => v.value)),
    getReplays().catch(() => []),
  ]);

  // Heartbeat for uptime tracking; runs every cycle regardless of lobby results.
  await recordUptime(getSourceLiveness());

  if (newLobbies.length === 0) {
    // Don't mass update lobbies to missing if we have none
    notifyHealthy();
    return console.warn(new Date(), "Found no lobbies");
  }

  lobbyCache = new Map(oldLobbies.map((l) => [l.id, l]));
  let news = 0;
  let updates = 0;
  let found = 0;
  let disappeared = 0;
  let died = 0;
  let stable = 0;
  let missing = 0;
  let pendingReplay = 0;
  let cleared = 0;
  let linked = 0;
  let ghosts = 0;
  // Metrics count work we actually emit to Discord: each message posted and each
  // live-update edit sent (excluding throttle-shed/failed edits). echoedServers
  // tracks the distinct Discord servers (guilds) we posted to.
  let echoedMessages = 0;
  let echoedUpdates = 0;
  const echoedServers = new Set<string>();

  for (const newLobby of newLobbies) {
    let oldLobby = oldLobbies.find((l) => l.id === newLobby.id);

    // Only consult the ledger when we'd otherwise post: either we have no record
    // of this lobby, or the only record is a dead one we'd treat as a remake.
    // Lobbies we're already tracking live skip the lookup entirely.
    if (!oldLobby || oldLobby.dead) {
      const firstSeenAt = await lobbyLedger.getFirstSeen(newLobby.id);
      if (isKnownInstance(newLobby.created, firstSeenAt)) {
        // A lobby we already handled, resurfacing because a feed never dropped
        // it. Leave the stored record alone: reposting is the spam we're here to
        // avoid, and updating would recolour a dead lobby as alive.
        ghosts++;
        continue;
      }
    }

    // If the host remakes with the same name, clear the old lobby first,
    // skipping chance of matching the replay
    if (oldLobby?.dead) {
      cleared++;
      await deleteLobby(oldLobby.id);
      oldLobby = undefined;
    }

    if (!oldLobby) {
      newLobby.messages = await onNewLobby(newLobby, alerts, dataSource);
      await lobbyLedger.setFirstSeen(newLobby.id, Date.now());
      news++;
      echoedMessages += newLobby.messages.length;
      for (const { channel } of newLobby.messages) {
        const meta = alerts.find((a) => a.channelId === channel)?.meta;
        // Count distinct guilds we posted to; DMs have no guild, so fall back
        // to the channel as the destination key.
        echoedServers.add(
          meta?.type === "guildChannel" ? meta.guildId : channel,
        );
      }
      await setLobby(newLobby);
    } else {
      newLobby.messages = oldLobby.messages;
      // wc3maps reports no roster, and wc3stats itself serves a lobby before it
      // has scanned one. Rather than editing every posted lobby the moment we
      // change feeds, keep the last roster we had and let it go stale until the
      // slot count moves — by then we're editing the message anyway, and a
      // count that has moved is proof the roster we're holding is wrong.
      if (!newLobby.teams && newLobby.slotsTaken === oldLobby.slotsTaken) {
        newLobby.teams = oldLobby.teams;
      }
      if (
        newLobby.slotsTaken !== oldLobby.slotsTaken || oldLobby.deadAt ||
        teamsKey(newLobby.teams) !== teamsKey(oldLobby.teams)
      ) {
        const edited = await onUpdateLobby(newLobby, dataSource, alerts);
        if (oldLobby.deadAt) found++;
        else {
          updates++;
          echoedUpdates += edited;
        }
      } else stable++;
      await setLobby(newLobby);
    }
  }

  for (const oldLobby of oldLobbies) {
    // Replay lookups
    try {
      const matching = replays.filter((r) =>
        r.name === oldLobby.name && r.players.includes(oldLobby.host)
      );
      if (matching.length) {
        const maps = await Promise.all(
          matching.map((m) => getReplayMap(m.id)),
        );
        const replay = maps.indexOf(oldLobby.map);
        if (replay >= 0) {
          linked++;
          await onLobbyReplayPosted(
            oldLobby,
            dataSource,
            alerts,
            matching[replay].id,
          );
          await deleteLobby(oldLobby.id);
          continue;
        }
      }
    } catch (err) {
      console.error(err);
    }

    const newLobby = newLobbies.find((l) => l.id === oldLobby.id);
    if (!newLobby) {
      if (!oldLobby.deadAt) {
        await onMissingLobby(oldLobby, dataSource, alerts);
        disappeared++;
        // Turn lobby orange immediately after disappearing from list; turn red after 5 minutes
        oldLobby.deadAt = Date.now() + 1000 * 60 * 5;
        await setLobby(oldLobby);
      } else if (oldLobby.deadAt <= Date.now()) {
        if (!oldLobby.dead) {
          await onDeadLobby(oldLobby, dataSource, alerts);
          died++;
          if (oldLobby.messages.length) {
            pendingReplay++;
            oldLobby.dead = true;
            await setLobby(oldLobby);
          } else {
            cleared++;
            await deleteLobby(oldLobby.id);
          }
        } else if (
          // Keep lobbies around for 24 hours in case a replay is posted
          oldLobby.deadAt + 1000 * 60 * 60 * 24 <= Date.now() ||
          !oldLobby.messages.length
        ) {
          cleared++;
          await deleteLobby(oldLobby.id);
        } else pendingReplay++;
      } else missing++;
    }
  }

  console.log(
    new Date(),
    "Found",
    newLobbies.length,
    `lobbies on ${dataSource}:`,
    news,
    "new,",
    updates,
    "updated,",
    found,
    "found, and",
    stable,
    "stable.",
    disappeared,
    "disappeared,",
    missing,
    "missing, and",
    died,
    "died.",
    pendingReplay,
    "pending replay,",
    linked,
    "linked to replay, and",
    cleared,
    "cleared.",
    ghosts,
    "ghosts.",
    replays.length,
    "new replays.",
    "Completed in",
    Math.round((Date.now() - now) / 10) / 100,
    "seconds.",
  );

  await recordMetrics({
    messages: echoedMessages,
    updates: echoedUpdates,
    servers: [...echoedServers],
  });

  cachedLobbies = [...lobbyCache.values()].sort((a, b) =>
    (a.created && b.created)
      ? b.created - a.created
      : a.created
      ? 1
      : b.created
      ? -1
      : 0
  );
  notifyHealthy();
};

const makeSingletonJob = (job: () => Promise<unknown>) => {
  let running = false;
  return async () => {
    if (running) {
      console.warn(new Date(), "Skipping update since already in progress");
      return;
    }
    running = true;
    try {
      await job();
    } finally {
      running = false;
    }
  };
};

const singleJobUpdateLobbies = makeSingletonJob(updateLobbies);

const period = 60_000 / UPDATES_PER_MINUTE;

let armed = false;

if (!Deno.env.get("DISABLE_LIVE_LOBBIES")) {
  // Persist the active feed and restore it on boot so we only alert on a true
  // source change, not on every restart.
  setOnDataSourceChange((source) => {
    meta.setDataSource(source).catch((err) =>
      console.error(new Date(), "Failed to persist data source", err)
    );
  });
  const restored = await meta.getDataSource();
  if (restored) restoreDataSource(restored);

  // One-time cleanup of metric buckets corrupted by the lobbies->messages rename.
  repairMetrics();

  Deno.cron("lobbies", "* * * * *", () => {
    if (!armed) {
      armed = true;
      notifyReady();
    }

    singleJobUpdateLobbies();
    for (let i = 1; i < UPDATES_PER_MINUTE; i++) {
      setTimeout(singleJobUpdateLobbies, i * period);
    }
  });

  const now = new Date();
  const time = now.getTime();
  const minute = now.getMinutes();
  const offset = now.getSeconds() * 1_000 + now.getMilliseconds();
  for (
    let i = Math.round(offset / period) * period - offset;
    i <= 60_000 - period && new Date(time + i).getMinutes() == minute;
    i += period
  ) setTimeout(singleJobUpdateLobbies, i);
}
