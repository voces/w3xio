import { collection, kvdex } from "jsr:@olli/kvdex";
import { z } from "npm:zod";
import { zLobby } from "./lobbies.ts";

const kv = await Deno.openKv();

export const zAlert = z.object({
  channelId: z.string(),
  message: z.string().optional(),
  rules: z.object({
    key: z.union([
      z.literal("map"),
      z.literal("host"),
      z.literal("name"),
      z.literal("server"),
    ]),
    value: z.union([z.string(), z.instanceof(RegExp)]),
  }).array().nonempty(),
});
export type Alert = z.infer<typeof zAlert>;
export type Rule = Alert["rules"][number];

export const db = kvdex(kv, {
  alerts: collection(zAlert, { idGenerator: (v) => v.channelId }),
  lobbies: collection(zLobby),
});
