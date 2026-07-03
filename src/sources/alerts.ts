import { getChannelDisplay, getChannelInfo, messageAdmin } from "./discord.ts";
import { db } from "./kv.ts";
import { alertToApi, zAlertFromApi } from "../api/convert.ts";
import { APIError } from "../api/ErrorCode.ts";

/**
 * Core alert operations, shared by the public HTTP API (src/api/routes) and the
 * inlined Discord bot (src/bot). Both entry points funnel through here so alert
 * behaviour lives in exactly one place.
 */

export const upsertAlert = async (body: unknown) => {
  const alert = zAlertFromApi.parse(body);

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
    action: existing ? ("updated" as const) : ("created" as const),
    alert: alertToApi(alert),
  };
};

export const getAlert = async (channelId: string) => {
  const alert = await db.alerts.find(channelId);

  if (!alert) {
    throw new APIError("missing_alert", `Could not find alert '${channelId}'`, {
      channelId,
    });
  }

  return alertToApi(alert.value);
};

export const deleteAlert = async (channelId: string) => {
  const alert = await db.alerts.find(channelId);

  if (!alert) {
    throw new APIError("missing_alert", `Could not find alert '${channelId}'`, {
      channelId,
    });
  }

  await db.alerts.delete(channelId);

  messageAdmin(`Alert deleted in ${await getChannelDisplay(channelId)}`);

  return alertToApi(alert.value);
};
