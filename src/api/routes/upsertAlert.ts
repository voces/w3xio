import { db } from "../../sources/kv.ts";
import { alertToApi, zAlertFromApi } from "../convert.ts";
import { Handler } from "../types.ts";

export const upsertAlert: Handler = async (ctx) => {
  const alert = zAlertFromApi.parse(ctx.body);

  const existing = await db.alerts.find(alert.channelId);

  const result = await db.alerts.set(alert.channelId, alert, {
    overwrite: true,
  });

  if (!result.ok) throw new Error("Unable to insert alert");

  return {
    action: existing ? "updated" : "created",
    alert: alertToApi(alert),
  };
};