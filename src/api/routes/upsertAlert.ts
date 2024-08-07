import {
  getChannelDisplay,
  getChannelInfo,
  messageAdmin,
} from "../../sources/discord.ts";
import { db } from "../../sources/kv.ts";
import { alertToApi, zAlertFromApi } from "../convert.ts";
import { Handler } from "../types.ts";

export const upsertAlert: Handler = async (ctx) => {
  const alert = zAlertFromApi.parse(ctx.body);

  const existing = await db.alerts.find(alert.channelId);

  if (existing?.value.meta) alert.meta = existing.value.meta;
  else {
    try {
      const info = await getChannelInfo(alert.channelId);
      if (info.type === "dm") {
        alert.meta = { type: "dm", recipients: info.recipients };
      } else if (info.type === "guild") {
        alert.meta = {
          type: "guildChannel",
          guildId: info.guild.id,
          guildName: info.guild.name,
          channelName: info.channel.name,
        };
      }
    } catch (err) {
      console.error(err);
    }
  }

  if (existing?.value.advanced && !alert.advanced) {
    alert.advanced = existing.value.advanced;
  }

  const result = await db.alerts.set(alert.channelId, alert, {
    overwrite: true,
  });

  if (!result.ok) throw new Error("Unable to insert alert");

  messageAdmin(
    `Alert ${existing ? "updated" : "created"} in ${await getChannelDisplay(
      alert.channelId,
    )}\n\`\`\`js\n${Deno.inspect(alert.rules, { depth: Infinity })}\n\`\`\``,
  );

  return {
    action: existing ? "updated" : "created",
    alert: alertToApi(alert),
  };
};
