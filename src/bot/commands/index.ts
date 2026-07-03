import {
  APIApplicationCommandInteraction,
  InteractionResponseType,
} from "discord-api-types/v10";
import { handleAlert } from "./alert.ts";
import { handleMax } from "./max.ts";
import { handleRounds } from "./rounds.ts";
import { handleSummary } from "./summary.ts";
import { handleTop } from "./top.ts";
import { handleStop } from "./stop.ts";
import { AllowedInput, ExternalHandler, InternalHandler } from "../types.ts";

const wrappedHandler = (
  handler: InternalHandler,
): ExternalHandler =>
async (data: AllowedInput) => {
  const response = await handler(data);
  if (typeof response === "string") {
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { content: response },
    };
  }
  if ("type" in response) return response;
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: response,
  };
};

const wrapHandlers = (map: Record<string, InternalHandler>) =>
  Object.fromEntries(
    Object.entries(map).map(([k, v]) => [k, wrappedHandler(v)]),
  );

const commands: Record<string, ExternalHandler | undefined> = wrapHandlers({
  summary: handleSummary,
  max: handleMax,
  top: handleTop,
  rounds: handleRounds,
  alert: handleAlert,
  stop: handleStop,
});

export const handleApplicationCommand = async (
  interaction: APIApplicationCommandInteraction,
) => {
  const handler = commands[interaction.data.name];
  if (!handler) {
    return Response.json({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { content: "Unhandled interaction" },
    }, { status: 404 });
  }

  const userId = interaction.user?.id ?? interaction.member?.user.id;
  if (!userId) {
    return Response.json({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { content: "User id missing!" },
    }, { status: 404 });
  }

  const response = await handler({
    ...interaction.data,
    userId,
    channelId: interaction.channel.id,
    channelName: interaction.channel.name ?? interaction.user?.username,
    guildId: interaction.guild_id,
  });
  console.log(new Date(), interaction.data.name, response);
  return Response.json(response);
};
