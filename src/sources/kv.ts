import { collection, kvdex } from "jsr:@olli/kvdex";
import { z } from "npm:zod";
import { zLobby } from "./lobbies.ts";

const kv = await Deno.openKv();

export const zAlert = z.object({
  channelId: z.string(),
  message: z.string().optional(),
  meta: z.union([
    z.object({
      type: z.literal("dm"),
      recipients: z.array(z.object({ id: z.string(), username: z.string() })),
    }),
    z.object({
      type: z.literal("guildChannel"),
      guildId: z.string(),
      guildName: z.string(),
      channelName: z.string(),
    }),
  ]).optional(),
  rules: z.object({
    key: z.union([
      z.literal("map"),
      z.literal("host"),
      z.literal("name"),
      z.literal("server"),
    ]),
    value: z.union([z.string(), z.instanceof(RegExp)]),
  }).array().nonempty(),
  advanced: z.object({
    slotOffset: z.number().optional(),
    thumbnail: z.string().optional(),
  }).optional(),
});
export type Alert = z.infer<typeof zAlert>;
export type Rule = Alert["rules"][number];

export const db = kvdex(kv, {
  alerts: collection(zAlert, { idGenerator: (v) => v.channelId }),
  lobbies: collection(zLobby),
});
