import {
  APIApplicationCommandInteraction,
  APIInteractionResponse,
  APIInteractionResponseCallbackData,
} from "discord-api-types/v10";

export type AllowedInput = APIApplicationCommandInteraction["data"] & {
  userId: string;
  channelId: string;
  channelName: string | undefined;
  guildId: string | undefined;
};

type AllowedReturn =
  | APIInteractionResponse
  | string
  | APIInteractionResponseCallbackData;

export type InternalHandler = (
  data: AllowedInput,
) => Promise<AllowedReturn> | AllowedReturn;

export type ExternalHandler = (
  data: AllowedInput,
) => Promise<APIInteractionResponse>;
