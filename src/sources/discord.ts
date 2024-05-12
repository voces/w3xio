import { REST } from "npm:@discordjs/rest";
import { API } from "npm:@discordjs/core";

const rest = new REST({ version: "10" })
  .setToken(Deno.env.get("DISCORD_TOKEN")!);

export const discord = new API(rest);
