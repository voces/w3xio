import { z } from "zod";
import { Handler } from "../types.ts";
import { getAlert as getAlertCore } from "../../sources/alerts.ts";

export const getAlert: Handler = (ctx) => {
  const { channelId } = z.object({ channelId: z.string() }).parse(
    ctx.route.pathname.groups,
  );

  return getAlertCore(channelId);
};
