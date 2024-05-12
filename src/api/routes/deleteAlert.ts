import { z } from "npm:zod";
import { Handler } from "../types.ts";
import { db } from "../../sources/kv.ts";
import { APIError } from "../../gapi/util/ErrorCode.ts";
import { alertToApi } from "../convert.ts";

export const deleteAlert: Handler = async (ctx) => {
  const { channelId } = z.object({ channelId: z.string() }).parse(
    ctx.route.pathname.groups,
  );

  const alert = await db.alerts.find(channelId);

  if (!alert) {
    throw new APIError("missing_alert", `Could not find alert '${channelId}'`, {
      channelId,
    });
  }

  await db.alerts.delete(channelId);

  return alertToApi(alert.value);
};
