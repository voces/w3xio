import { z } from "zod";
import { Handler } from "../types.ts";
import { deleteAlert as deleteAlertCore } from "../../sources/alerts.ts";

export const deleteAlert: Handler = (ctx) => {
  const { channelId } = z.object({ channelId: z.string() }).parse(
    ctx.route.pathname.groups,
  );

  return deleteAlertCore(channelId);
};
