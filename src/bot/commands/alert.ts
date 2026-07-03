import {
  APIRole,
  ComponentType,
  InteractionResponseType,
  PermissionFlagsBits,
  TextInputStyle,
} from "discord-api-types/v10";
import { InternalHandler } from "../types.ts";
import { discord } from "../../sources/discord.ts";
import { hasPermission } from "../permissions.ts";
import { getAlert } from "../alerts.ts";

const derichMessage = async (
  message: string | undefined,
  guildId: string | undefined,
) => {
  if (!message) return message;
  const mentions = Array.from(
    new Set(
      Array.from(message.matchAll(/<@&\d+>/g)).map((m) => m[0].slice(3, -1)),
    ),
  );
  if (!mentions.length) return message;

  const roles = guildId
    ? await discord.guilds.getRoles(guildId) as APIRole[]
    : [];

  for (const mention of mentions) {
    const role = roles.find((r) => r.id === mention);
    if (role) {
      message = message.replace(
        new RegExp(`<@&${mention}>`, "g"),
        `@${role.name}`,
      );
      continue;
    }
  }

  return message;
};

export const handleAlert: InternalHandler = async ({ channelId, guildId }) => {
  const [current, allowed] = await Promise.all([
    await getAlert(channelId).then((r) => "channelId" in r ? r : undefined),
    guildId
      ? hasPermission({
        channelId,
        guildId,
        permission: PermissionFlagsBits.SendMessages |
          PermissionFlagsBits.EmbedLinks,
      })
      : true,
  ]);

  if (!allowed && !current) {
    return "I either do not have permission to send messages or use embeds in this channel.";
  }

  return {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: "alert",
      title: current ? "Edit alert" : "Create alert",
      components: [{
        type: ComponentType.ActionRow,
        components: [{
          type: ComponentType.TextInput,
          custom_id: "message",
          label: "Message (optional)",
          placeholder: "@lobby",
          value: await derichMessage(current?.message, guildId),
          style: TextInputStyle.Paragraph,
          required: false,
        }],
      }, {
        type: ComponentType.ActionRow,
        components: [{
          type: ComponentType.TextInput,
          custom_id: "map",
          label: "File name (optional)",
          placeholder: "/tree.*tag/i",
          value: current?.rules.find((r) => r.key === "map")?.value,
          style: TextInputStyle.Short,
          required: false,
        }],
      }, {
        type: ComponentType.ActionRow,
        components: [{
          type: ComponentType.TextInput,
          custom_id: "host",
          label: "Host (optional)",
          placeholder: "verit",
          value: current?.rules.find((r) => r.key === "host")?.value,
          style: TextInputStyle.Short,
          required: false,
        }],
      }, {
        type: ComponentType.ActionRow,
        components: [{
          type: ComponentType.TextInput,
          custom_id: "name",
          label: "Lobby name (optional)",
          placeholder: "-aram",
          value: current?.rules.find((r) => r.key === "name")?.value,
          style: TextInputStyle.Short,
          required: false,
        }],
      }, {
        type: ComponentType.ActionRow,
        components: [{
          type: ComponentType.TextInput,
          custom_id: "server",
          label: "Realm (optional)",
          placeholder: "us, eu, or kr",
          value: current?.rules.find((r) => r.key === "server")?.value,
          style: TextInputStyle.Short,
          required: false,
        }],
      }],
    },
  };
};
