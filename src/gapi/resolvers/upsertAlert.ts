import { MutationResolvers } from "../schema.ts";
import { db, zAlert } from "../../sources/kv.ts";

export const upsertAlert: MutationResolvers["alert"] = async (
  { channelId, rules, message },
) => {
  const alert = zAlert.parse({
    channelId,
    message: message ?? undefined,
    rules: rules.map(({ key, value }) => {
      const [, pattern, flags] = value.match(/^\/(.*)\/(\w+)$/) ?? [];
      return {
        key,
        value: pattern ? new RegExp(pattern, flags || undefined) : value,
      };
    }),
  });

  const existing = await db.alerts.find(channelId);

  await db.alerts.set(channelId, alert);

  return {
    action: existing ? "updated" : "created",
    alert: {
      id: alert.channelId,
      message: alert.message ?? null,
      rules: alert.rules.map(({ key, value }) => ({
        key,
        value: value.toString(),
      })),
    },
  };
};
