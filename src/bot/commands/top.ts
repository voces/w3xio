import { z } from "zod";
import { cleanUsername } from "../util/cleanUsername.ts";
import { formatTable } from "../util/format/formatTable.ts";
import { optionArrayToObject } from "../util/optionArrayToObject.ts";
import { parseMode } from "../util/parse/parseMode.ts";
import { parseSeason } from "../util/parse/parseSeason.ts";
import { sql } from "../query.ts";
import { InternalHandler } from "../types.ts";

const zTopOptions = z.object({
  mode: z.string().optional(),
  season: z.string().optional(),
});

export const handleTop: InternalHandler = async (input): Promise<string> => {
  if (input.guildId) return "Only available via DM";
  const options = "options" in input ? input.options : [];
  const opts = zTopOptions.parse(optionArrayToObject(options ?? []));
  const mode = opts.mode ? parseMode(opts.mode) : "2v4";
  const season = parseSeason(opts.season) ??
    `${new Date().getFullYear()}Q${Math.floor(new Date().getMonth() / 3) + 1}`;

  const results = (await sql<
    { player: string; rating: number; rounds: number }[]
  >`SELECT player, rating, rounds FROM elo.elos WHERE season = ${season} AND \`mode\` = ${mode} ORDER BY rating DESC LIMIT 10;`)
    .map((r) => ({
      rounds: r.rounds,
      rating: Math.round(r.rating),
      player: cleanUsername(r.player),
    }));

  if (results.length === 1) {
    return "There are no results.";
  }

  const content = `Top 10 in ${mode} in ${season}:
\`\`\`
${
    formatTable([
      ["Player", "Rating", "Rounds"],
      ...results.map((r) => [
        r.player,
        r.rating,
        r.rounds,
      ]),
    ])
  }
\`\`\``;

  return content.slice(0, 2000);
};
