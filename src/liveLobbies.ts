import { DataSource, getLobbies, Lobby } from "./sources/lobbies.ts";
import { Alert, db, Rule } from "./sources/kv.ts";
import { discord, messageAdminAndWarn } from "./sources/discord.ts";
import { DiscordAPIError } from "npm:@discordjs/rest@2.3.0";
import { AllowedMentionsTypes, APIEmbed } from "npm:discord-api-types/v10";
import { getReplayMap, getReplays } from "./sources/replays.ts";
import { notifyHealthy, notifyReady } from "./sources/watchdog.ts";

export const stats = { lastDataUpdate: 0 };

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
    ...(replayId
      ? [{
        name: "Replay",
        value: `[Download / Stats](https://wc3stats.com/games/${replayId})`,
      }]
      : []),
  ],
  footer: dataSource === "wc3maps"
    ? {
      text: "Powered by https://wc3maps.com",
      icon_url: "https://wc3maps.com/images/logo-square.jpg",
    }
    : undefined,
  thumbnail: advanced?.thumbnail ? { url: advanced.thumbnail } : undefined,
});

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
          const message = await discord.channels.createMessage(
            alert.channelId,
            {
              content: alert.message,
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
) => {
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
        return;
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
  } catch (err) {
    if (!(err instanceof DiscordAPIError)) {
      console.error("Error updating message in channel", channel, err);
    } else if (err.code === 10008) {
      console.warn(new Date(), "Message deleted in channel", channel);
      lobby.messages = lobby.messages.filter((m) => m.message !== message);
    } else console.error("Error updating message in channel", channel, err);
  }
};

const onUpdateLobby = async (
  lobby: Lobby,
  dataSource: DataSource,
  alerts: Alert[],
) => {
  console.debug(new Date(), "Updating lobby", lobby.name);
  stats.lastDataUpdate = Date.now();
  await Promise.all(
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

  if (newLobbies.length === 0) {
    // Don't mass update lobbies to missing if we have none
    notifyHealthy();
    return console.warn(new Date(), "Found no lobbies");
  }

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

  for (const newLobby of newLobbies) {
    let oldLobby = oldLobbies.find((l) => l.id === newLobby.id);

    // If the host remakes with the same name, clear the old lobby first,
    // skipping chance of matching the replay
    if (oldLobby?.dead) {
      cleared++;
      await db.lobbies.delete(oldLobby.id);
      oldLobby = undefined;
    }

    if (!oldLobby) {
      newLobby.messages = await onNewLobby(newLobby, alerts, dataSource);
      news++;
      await db.lobbies.set(newLobby.id, newLobby, { overwrite: true });
    } else {
      newLobby.messages = oldLobby.messages;
      if ((newLobby.slotsTaken !== oldLobby.slotsTaken) || oldLobby.deadAt) {
        await onUpdateLobby(newLobby, dataSource, alerts);
        if (oldLobby.deadAt) found++;
        else updates++;
      } else stable++;
      await db.lobbies.set(newLobby.id, newLobby, { overwrite: true });
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
          await db.lobbies.delete(oldLobby.id);
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
        await db.lobbies.set(oldLobby.id, oldLobby, { overwrite: true });
      } else if (oldLobby.deadAt <= Date.now()) {
        if (!oldLobby.dead) {
          await onDeadLobby(oldLobby, dataSource, alerts);
          died++;
          if (oldLobby.messages.length) {
            pendingReplay++;
            oldLobby.dead = true;
            await db.lobbies.set(oldLobby.id, oldLobby, { overwrite: true });
          } else {
            cleared++;
            await db.lobbies.delete(oldLobby.id);
          }
        } else if (
          // Keep lobbies around for 24 hours in case a replay is posted
          oldLobby.deadAt + 1000 * 60 * 60 * 24 <= Date.now() ||
          !oldLobby.messages.length
        ) {
          cleared++;
          await db.lobbies.delete(oldLobby.id);
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
    replays.length,
    "new replays.",
    "Completed in",
    Math.round((Date.now() - now) / 10) / 100,
    "seconds.",
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
