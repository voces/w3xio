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

export const getChannelDisplay = async (channelId: string) => {
  const channel = await discord.channels.get(channelId);
  if (channel.type === ChannelType.DM) {
    return `DM ${
      channel.recipients?.map((r) => `${r.username} (userId=${r.id})`).join(
        ", ",
      )
    } (channelId=${channelId})`;
  }

  if ("guild_id" in channel && typeof channel.guild_id === "string") {
    const guild = await discord.guilds.get(channel.guild_id, {
      with_counts: false,
    });

    return `guild ${guild.name} (guildId=${guild.id}) channel ${channel.name} (channelId=${channelId})`;
  }

  if (channel.name) return `channel ${channel.name} (channelId=${channel.id})`;

  return channelId;
};
