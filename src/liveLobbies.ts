import { DataSource, Lobby, wc3stats } from "./sources/lobbies.ts";
import { Alert, db, Rule } from "./sources/kv.ts";
import { discord, messageAdminAndWarn } from "./sources/discord.ts";
import { DiscordAPIError } from "npm:@discordjs/rest@2.2.0";
import { AllowedMentionsTypes, APIEmbed } from "npm:discord-api-types/v10";

const UPDATES_PER_MINUTE = 6;

const process = (rules: Rule[], lobby: Lobby): boolean =>
  rules.every(({ key, value }) => {
    const lobbyValue = lobby[key];
    return lobbyValue
      ? typeof value === "string"
        ? lobbyValue.toLowerCase().includes(value.toLowerCase())
        : !!lobbyValue.match(value)
      : false;
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
  ],
  footer: dataSource === "wc3maps"
    ? {
      text: "Powered by https://wc3maps.com",
      icon_url: "https://wc3maps.com/favicon.png",
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

const updateMessage = async (
  channel: string,
  message: string,
  lobby: Lobby,
  status: "alive" | "missing" | "dead",
  dataSource: DataSource,
  alert: Alert | undefined,
) => {
  try {
    await discord.channels.editMessage(channel, message, {
      embeds: [getEmbed(lobby, status, dataSource, alert?.advanced)],
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

const updateLobbies = async () => {
  const [
    { lobbies: newLobbies, dataSource },
    oldLobbies,
    alerts,
  ] = await Promise.all([
    wc3stats.gamelist(),
    db.lobbies.getMany().then((v) => v.result.map((v) => v.value)),
    db.alerts.getMany().then((v) => v.result.map((v) => v.value)),
  ]);

  if (newLobbies.length === 0) {
    // Don't mass update lobbies to missing if we have none
    return console.warn(new Date(), "Found no lobbies");
  }

  let news = 0;
  let updates = 0;
  let found = 0;
  let missing = 0;
  let dead = 0;
  let stable = 0;
  let dying = 0;

  for (const newLobby of newLobbies) {
    const oldLobby = oldLobbies.find((l) => l.id === newLobby.id);
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
    const newLobby = newLobbies.find((l) => l.id === oldLobby.id);
    if (!newLobby) {
      if (!oldLobby.deadAt) {
        await onMissingLobby(oldLobby, dataSource, alerts);
        missing++;
        oldLobby.deadAt = Date.now() + 1000 * 60 * 5;
        await db.lobbies.set(oldLobby.id, oldLobby, { overwrite: true });
      } else if (oldLobby.deadAt <= Date.now()) {
        await onDeadLobby(oldLobby, dataSource, alerts);
        dead++;
        await db.lobbies.delete(oldLobby.id);
      } else dying++;
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
    missing,
    "missing,",
    dead,
    "dead, and",
    dying,
    "dying",
  );
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

if (!Deno.env.get("DISABLE_LIVE_LOBBIES")) {
  Deno.cron("lobbies", "* * * * *", () => {
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
