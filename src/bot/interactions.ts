import {
  APIInteraction,
  InteractionResponseType,
  InteractionType,
} from "discord-api-types/v10";
import { verifySignature } from "./verifySignature.ts";
import { handleApplicationCommand } from "./commands/index.ts";
import { handleModalSubmit } from "./modals.ts";

/**
 * Discord interactions webhook, folded into the w3xio HTTP server. Discord POSTs
 * every slash command / modal submit here; the request must be Ed25519 verified
 * before it is trusted. Wired up in src/api/server.ts at POST /interactions.
 */
export const handleInteraction = async (
  request: Request,
): Promise<Response> => {
  if (
    !request.headers.has("X-Signature-Ed25519") ||
    !request.headers.has("X-Signature-Timestamp")
  ) {
    return Response.json({ error: "Missing signature headers" }, {
      status: 401,
    });
  }

  const { valid, body } = await verifySignature(request);
  if (!valid) {
    return Response.json({ error: "Invalid request" }, { status: 401 });
  }

  const interaction = JSON.parse(body) as APIInteraction;

  if (interaction.type === InteractionType.Ping) {
    return Response.json({ type: InteractionResponseType.Pong });
  }

  try {
    if (interaction.type === InteractionType.ApplicationCommand) {
      return await handleApplicationCommand(interaction);
    }

    if (interaction.type === InteractionType.ModalSubmit) {
      return await handleModalSubmit(interaction);
    }
  } catch (err) {
    console.error(new Date(), "Interaction handler error:", err);
    return Response.json({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { content: "Something went wrong handling that command." },
    });
  }

  return Response.json({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content: "Unhandled interaction" },
  }, { status: 404 });
};
