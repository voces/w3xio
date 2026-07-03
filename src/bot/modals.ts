import {
  AllowedMentionsTypes,
  APIInteractionResponse,
  APIModalSubmitInteraction,
  InteractionResponseType,
} from "discord-api-types/v10";
import { z } from "zod";
import regExpEscape from "regex-escape";
import { discord } from "../sources/discord.ts";
import { upsertAlert, zAlertKey } from "./alerts.ts";
import { validateRuleValue, validateTemplate } from "./validation.ts";

const zSubmitProps = z.object({
  message: z.string().optional().transform((v) => v ? v : undefined),
  map: z.string().optional().transform((v) => v ? v : undefined),
  host: z.string().optional().transform((v) => v ? v : undefined),
  name: z.string().optional().transform((v) => v ? v : undefined),
  server: z.string().optional().transform((v) => v ? v : undefined),
});

const enrichMessage = async (
  message: string | undefined,
  guildId: string | undefined,
) => {
  if (!message?.includes("@")) return message;

  const roles = guildId
    ? (await discord.guilds.getRoles(guildId)).sort((a, b) =>
      b.name.length - a.name.length
    )
    : [];

  for (const role of roles) {
    message = message.replace(
      new RegExp(`@${regExpEscape(role.name)}`, "ig"),
      `<@&${role.id}>`,
    );
  }

  return message;
};

const escape = (value: string) => value.replace(/(\*|_|`|~|\\)/g, "\\$1");

const formatAsString = (value: string) => {
  const [, pattern, flags] = value.match(/^\/(.*)\/(\w*)$/) ?? [];
  if (pattern) {
    return `\`${new RegExp(pattern, flags).toString().replace(/`/g, "\\$1")}\``;
  }
  if (value.includes('"')) {
    if (value.includes("'")) return `\`${escape(value)}\``;
    return `'${escape(value)}'`;
  }
  return `"${escape(value)}"`;
};

export const handleModalSubmit = async (
  interaction: APIModalSubmitInteraction,
) => {
  if (!interaction.channel) {
    return Response.json({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { content: "Unknown channel" },
    });
  }

  if (interaction.data.custom_id !== "alert") {
    return Response.json({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { content: `Unknown modal '${interaction.data.custom_id}'` },
    });
  }

  const values = zSubmitProps.parse(Object.fromEntries(
    interaction.data.components.flatMap((r) =>
      "components" in r ? r.components.map((c) => [c.custom_id, c.value]) : []
    ),
  ));
  const rules = Object.entries(values)
    .filter((entry): entry is [string, string] =>
      entry[0] !== "message" && typeof entry[1] === "string"
    )
    .map(([key, value]) => ({ key: zAlertKey.parse(key), value }));
  if (!rules.length) {
    return Response.json({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { content: "Must apply at least 1 filter" },
    });
  }

  // Validate regex patterns in rules
  for (const rule of rules) {
    const error = validateRuleValue(rule.value);
    if (error) {
      return Response.json({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { content: error },
      });
    }
  }

  const message = await enrichMessage(values.message, interaction.guild_id);

  // Validate template message
  if (message) {
    const error = validateTemplate(message);
    if (error) {
      return Response.json({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { content: error },
      });
    }
  }

  const { action } = await upsertAlert({
    channelId: interaction.channel.id,
    message,
    rules,
  });

  console.log(`${action === "updated" ? "Edited" : "Created"} alert`, {
    channelId: interaction.channel.id,
    channelName: interaction.channel.name,
    userId: interaction.user?.id,
    userName: interaction.user?.username,
  });

  return Response.json(
    {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: `${action == "updated" ? "Edited" : "Created"} alert ${
          action === "updated" ? "to" : "with"
        } filter${rules.length > 1 ? "s" : ""} ${
          rules.map((r) => `${r.key} ${formatAsString(r.value)}`).join(" ")
        }${message ? ` and message ${formatAsString(message)}` : ""}`,
        allowed_mentions: {
          parse: [AllowedMentionsTypes.Role, AllowedMentionsTypes.Everyone],
        },
      },
    } satisfies APIInteractionResponse,
  );
};
