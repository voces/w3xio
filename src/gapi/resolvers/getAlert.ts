import { QueryResolvers } from "../schema.ts";
import { db } from "../../sources/kv.ts";
import { APIError } from "../util/ErrorCode.ts";

export const getAlert: QueryResolvers["alert"] = async ({ channelId }) => {
  const alert = await db.alerts.find(channelId);

  if (!alert) {
    throw new APIError("missing", `Could not find alert '${channelId}'`, {
      channelId,
    });
  }

  return {
    id: alert.value.channelId,
    message: alert.value.message ?? null,
    rules: alert.value.rules.map(({ key, value }) => ({
      key,
      value: value.toString(),
    })),
  };
};
