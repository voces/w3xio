import { z } from "zod";
import { formatTable } from "../util/format/formatTable.ts";
import { optionArrayToObject } from "../util/optionArrayToObject.ts";
import { parseMode } from "../util/parse/parseMode.ts";
import { parseSeason } from "../util/parse/parseSeason.ts";
import { sql } from "../query.ts";
import { InternalHandler } from "../types.ts";

const zMaxOptions = z.object({
  mode: z.string().optional(),
  season: z.string().optional(),
});

export const handleMax: InternalHandler = async (
  { userId, ...input },
): Promise<string> => {
  if (input.guildId) return "Only available via DM";
  const options = "options" in input ? input.options : [];
  const opts = zMaxOptions.parse(optionArrayToObject(options ?? []));

  const mode = opts.mode ? parseMode(opts.mode) : "%";
  const season = parseSeason(opts.season) ??
    `${new Date().getFullYear()}Q${Math.floor(new Date().getMonth() / 3) + 1}`;

  const yearPart = season.slice(0, 4);
  const monthPart = (parseInt(season[5]) - 1) * 3 + 1;
  const start = new Date(`${yearPart}-${monthPart}Z`);
  const end = new Date(`${yearPart}-${monthPart + 3}Z`);

  const results = await sql<
    {
      mode: string;
      rating: number;
      playedon: Date;
      replayid: number;
      round: number;
    }[]
  >`
    SELECT
      outcome.mode,
      outcome.rating,
      replay.playedon,
      MAX(outcome.replayid) replayid,
      MAX(round) round
    FROM elo.outcome
    INNER JOIN (
      SELECT
        mode,
        player,
        MAX(rating) max
      FROM elo.outcome
      INNER JOIN elo.replay ON outcome.replayid = replay.replayid
      WHERE
          playedon >= date ${start.toISOString().slice(0, 10)}
          AND playedon < date ${end.toISOString().slice(0, 10)}
          AND player = (
              SELECT battlenettag
              FROM elo.discordBattleNetMap
              WHERE discordId = ${userId}
          )
          AND mode LIKE ${mode}
      GROUP BY mode, player
    ) q1 ON
      outcome.mode = q1.mode
      AND outcome.rating = q1.max
      AND outcome.player = q1.player
    INNER JOIN elo.replay ON outcome.replayid = replay.replayid
    GROUP BY outcome.mode, outcome.rating
    ORDER BY outcome.mode ASC;
  `;

  const content = `Your max rating${
    results.length > 1 ? "s" : ""
  } for ${season}:
\`\`\`
${
    formatTable([
      ["Mode", "Rating", "Played on", "Replay", "Round"],
      ...results.map((r) => [
        r.mode,
        r.rating,
        new Date(r.playedon).toISOString().slice(0, 10),
        r.replayid,
        r.round,
      ]),
    ])
  }
\`\`\``;

  return content.slice(0, 2000);
};
