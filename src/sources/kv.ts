import { collection, kvdex } from "@olli/kvdex";
import { z } from "zod";
import { zLobby } from "./lobbies.ts";
import { getLastReplayId } from "./replays.ts";

export const kv = await Deno.openKv();

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

export const db = kvdex({
  kv,
  schema: {
    alerts: collection(zAlert, { idGenerator: (v) => v.channelId }),
    lobbies: collection(zLobby, { idGenerator: (v) => v.id }),
  },
});

// We have to remember that we picked a lobby up for far longer than we keep the
// lobby itself: a feed can serve a closed lobby long after we've finished with
// it, and the memory has to still be there when it does. wc3maps has been seen
// replaying lobbies 30h+ old, well past the 24h we retain a dead lobby for
// replay linking.
const LOBBY_LEDGER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Deliberately not part of the `lobbies` collection: that collection is scanned
// in full every cycle, so parking days of cold history in it would grow the hot
// path. These are point lookups only, and Deno KV expires them for us.
export const lobbyLedger = {
  async getFirstSeen(id: string): Promise<number | null> {
    const value = (await kv.get(["lobbyFirstSeen", id])).value;
    return typeof value === "number" ? value : null;
  },
  async setFirstSeen(id: string, firstSeenAt: number) {
    await kv.set(["lobbyFirstSeen", id], firstSeenAt, {
      expireIn: LOBBY_LEDGER_TTL_MS,
    });
  },
};

export const meta = {
  async getReplayOffset() {
    try {
      return z.number().parse((await kv.get(["meta", "replayOffset"])).value);
    } catch (err) {
      console.error(err);
      const current = await getLastReplayId();
      await kv.set(["meta", "replayOffset"], current);
      return current;
    }
  },
  async setReplayOffset(value: number) {
    await kv.set(["meta", "replayOffset"], value);
  },
  async getDataSource() {
    try {
      return z.enum(["none", "wc3stats", "wc3maps"]).parse(
        (await kv.get(["meta", "dataSource"])).value,
      );
    } catch {
      return null;
    }
  },
  async setDataSource(value: string) {
    await kv.set(["meta", "dataSource"], value);
  },
};
