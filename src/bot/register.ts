import { ApplicationCommandType } from "discord-api-types/v10";
import { discord } from "../sources/discord.ts";

/**
 * Register the global slash commands on startup. Mirrors the behaviour of the
 * former standalone discord-bot service. Only the option-less commands (`alert`,
 * `stop`) are (re)created here; the stats commands carry option schemas that are
 * managed out of band, so we leave them untouched.
 */

const applicationId = Deno.env.get("APPLICATION_ID");

if (applicationId) {
  discord.applicationCommands.createGlobalCommand(applicationId, {
    type: ApplicationCommandType.ChatInput,
    name: "alert",
    description: "Enable alerts for hosted Warcraft 3 lobbies",
  }).catch(console.error);

  discord.applicationCommands.createGlobalCommand(applicationId, {
    type: ApplicationCommandType.ChatInput,
    name: "stop",
    description: "Stop Warcraft alerts",
  }).catch(console.error);
}
