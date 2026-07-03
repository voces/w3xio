import { upsertAlert as upsertAlertCore } from "../../sources/alerts.ts";
import { Handler } from "../types.ts";

export const upsertAlert: Handler = (ctx) => upsertAlertCore(ctx.body);
