import { ChannelType } from "npm:@discordjs/core";
import { discord, messageAdmin } from "../../sources/discord.ts";
import { db } from "../../sources/kv.ts";
import { alertToApi, zAlertFromApi } from "../convert.ts";
import { Handler } from "../types.ts";

const alertAdmin = async (channelId: string, updated: boolean) => {
  const channel = await discord.channels.get(channelId);
  const name = channel.type === ChannelType.DM
    ? channel.recipients?.filter((r) => !r.bot).map((u) => u.username).join(
      ", ",
    )
    : channel.name;

  messageAdmin(
    `Alert ${updated ? "updated" : "created"} in channel ${
      name ? `${name} (${channelId})` : channelId
    }`,
  );
};

export const upsertAlert: Handler = async (ctx) => {
  const alert = zAlertFromApi.parse(ctx.body);

  const existing = await db.alerts.find(alert.channelId);

  const result = await db.alerts.set(alert.channelId, alert, {
    overwrite: true,
  });

  if (!result.ok) throw new Error("Unable to insert alert");

  alertAdmin(alert.channelId, !!existing);

  return {
    action: existing ? "updated" : "created",
    alert: alertToApi(alert),
  };
};
