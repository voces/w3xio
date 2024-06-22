import { REST } from "npm:@discordjs/rest";
import {
  API,
  ChannelType,
  type RESTPostAPIChannelMessageJSONBody,
} from "npm:@discordjs/core";

const rest = new REST({ version: "10" })
  .setToken(Deno.env.get("DISCORD_TOKEN")!);

export const discord = new API(rest);

export const messageAdmin = (
  content: RESTPostAPIChannelMessageJSONBody | string,
) =>
  discord.channels.createMessage(
    "536352428820529197",
    typeof content === "string" ? { content } : content,
  );

export const messageAdminAndWarn = (...parts: unknown[]) => {
  const args = [new Date(), ...parts];
  console.warn(...args);
  messageAdmin(args.join(" "));
};

export const getChannelInfo = async (channelId: string) => {
  const channel = await discord.channels.get(channelId);
  if (channel.type === ChannelType.DM) {
    return {
      type: "dm" as const,
      channelId,
      recipients:
        channel.recipients?.map((r) => ({ username: r.username, id: r.id })) ??
          [],
    };
  }

  if ("guild_id" in channel && typeof channel.guild_id === "string") {
    const guild = await discord.guilds.get(channel.guild_id, {
      with_counts: false,
    });

    return {
      type: "guild" as const,
      channel: { id: channel.id, name: channel.name },
      guild: { id: guild.id, name: guild.name },
    };
  }

  if (channel.name) {
    return {
      type: "unknownWithName" as const,
      channel: { id: channel.id, name: channel.name },
    };
  }

  return { type: "unknownWithoutName" as const, channelId };
};

export const getChannelDisplay = async (channelId: string) => {
  const info = await getChannelInfo(channelId);

  switch (info.type) {
    case "dm":
      return `DM ${
        info.recipients.map((r) => `${r.username} (userId=${r.id})`).join(
          ", ",
        )
      } (channelId=${channelId})`;
    case "guild":
      return `guild ${info.guild.name} (guildId=${info.guild.id}) channel ${info.channel.name} (channelId=${channelId})`;
    case "unknownWithName":
      return `channel ${info.channel.name} (channelId=${channelId})`;
    case "unknownWithoutName":
      return `channelId=${channelId}`;
    default: {
      const absurd: never = info;
      throw new Error(`Unexpected type ${absurd["type"]}`);
    }
  }
};
