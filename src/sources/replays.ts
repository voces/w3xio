import { z } from "npm:zod";
import { zodFetch } from "./util.ts";
import { meta } from "./kv.ts";

export const getReplays = async () => {
  const result = await zodFetch(
    `https://api.wc3stats.com/replays&since=${await meta.getReplayOffset()}`,
    {
      schema: z.object({
        body: z.array(z.object({
          name: z.string(),
          id: z.number(),
          players: z.array(z.object({
            name: z.string(),
          })),
        })),
      }),
    },
  );
  if (result.body.length) {
    await meta.setReplayOffset(result.body.at(-1)!.id);
  }
  return result.body.map((b) => ({
    id: b.id,
    name: b.name,
    players: b.players.map((p) => p.name),
  }));
};

export const getReplayMap = async (replayId: number) => {
  const replay = await zodFetch(
    `https://api.wc3stats.com/replays/${replayId}`,
    {
      schema: z.object({
        body: z.object({
          data: z.object({
            game: z.object({
              map: z.string().transform((v) =>
                v.replace(/\.w3[xm]$/, "").replace(/_/g, " ")
              ),
            }),
          }),
        }),
      }),
    },
  );
  return replay.body.data.game.map;
};

export const getLastReplayId = () =>
  zodFetch("https://api.wc3stats.com/replays&order=desc&limit=1", {
    schema: z.object({ body: z.array(z.object({ id: z.number() })) }),
  }).then((r) => r.body[0].id);
