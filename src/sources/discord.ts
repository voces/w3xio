import { REST } from "npm:@discordjs/rest";
import {
  API,
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
