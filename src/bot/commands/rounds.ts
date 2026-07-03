import { z } from "zod";
import { cleanUsername } from "../util/cleanUsername.ts";
import { formatList } from "../util/format/formatList.ts";
import { formatTable } from "../util/format/formatTable.ts";
import { formatTime } from "../util/format/formatTime.ts";
import { optionArrayToObject } from "../util/optionArrayToObject.ts";
import { sql } from "../query.ts";
import { InternalHandler } from "../types.ts";

const verboseResponse = (
  grouped: Record<
    string,
    Record<
      string,
      Record<string, {
        change: number;
        duration: number;
      }>
    >
  >,
) =>
  Object.entries(grouped)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    .map(([_, data]) => {
      const setup = Object.keys(data).find(
        (k) => k !== "overall" && !k.includes("-"),
      )!;

      const sheep = Object.keys(data[`${setup}-sheep`]);
      const wolves = Object.keys(data[`${setup}-wolf`]);

      const generalOutcome = data[setup][sheep[0]];

      const outcomes = [
        [`in ${setup}`, generalOutcome],
        ["in team", data[`${setup}-sheep`][sheep[0]]],
        ["overall", data.overall[sheep[0]]],
      ] as const;

      return `${formatList(sheep.map(cleanUsername))} vs ${
        formatList(
          wolves.map(cleanUsername),
        )
      }
Lasted ${formatTime(Math.round(generalOutcome.duration))}
${
        formatList(
          outcomes.map(
            ([mode, o], i) =>
              `${
                o.change > 0
                  ? `${i === 0 ? "G" : "g"}ained`
                  : `${i === 0 ? "L" : "l"}ost`
              } ${o.change.toPrecision(2)} ${mode}`,
          ),
        )
      }`;
    }).join("\n\n");

export const compactResponse = (
  groupedRounds: Record<
    string,
    Record<
      string,
      Record<string, {
        change: number;
        duration: number;
      }>
    >
  >,
  self: string | undefined,
): string => {
  const reversePlayerMap: Record<string, string> = {};
  const players = Array.from(
    new Set(
      Object.values(groupedRounds).flatMap((round) =>
        Object.values(round).flatMap((g) => Object.keys(g))
      ),
    ),
  );

  for (const player of players) {
    let length = 1;
    while (player.slice(0, length) in reversePlayerMap) {
      // console.log(p.slice(0, length));
      const otherPlayer = reversePlayerMap[player.slice(0, length)];
      delete reversePlayerMap[player.slice(0, length)];
      length++;
      reversePlayerMap[otherPlayer.slice(0, length)] = otherPlayer;
    }
    reversePlayerMap[player.slice(0, length)] = player;
  }

  const playerMap = Object.fromEntries(
    Object.entries(reversePlayerMap).map(([k, v]) => [v, k]),
  );

  return `Where ${
    formatList(
      Object.entries(reversePlayerMap).map(([k, v]) =>
        `${k} = ${v.split("#")[0]}`
      ),
    )
  }:
\`\`\`diff\n${
    formatTable(
      [
        ["", "sh", "wolf", "time", "mode", "team", "ovrl"],
        ...Object.entries(groupedRounds).sort((a, b) =>
          parseInt(a[0]) - parseInt(b[0])
        ).map(
          ([_, data]) => {
            const setup = Object.keys(data).find(
              (k) => k !== "overall" && !k.includes("-"),
            )!;

            const sheep = Object.keys(data[`${setup}-sheep`]);
            const wolves = Object.keys(data[`${setup}-wolf`]);
            const generalOutcome = data[setup][sheep[0]];
            const direction = self
              ? (sheep.includes(self)
                ? generalOutcome.change > 0
                : generalOutcome.change < 0)
              : generalOutcome.change > 0;

            return [
              direction ? "+" : "-",
              sheep.map((p) => playerMap[p]).join(""),
              wolves.map((p) => playerMap[p]).join(""),
              formatTime(Math.round(generalOutcome.duration), true, "minute"),
              generalOutcome.change,
              data[`${setup}-sheep`][sheep[0]].change,
              data.overall[sheep[0]].change,
            ];
          },
        ),
      ],
      { number: (v) => v.toFixed(1) },
    )
  }
\`\`\``;
};

const zRoundsOptions = z.object({
  replay: z.number().optional(),
  compact: z.boolean().optional(),
  color: z.string().optional(),
});

export const handleRounds: InternalHandler = async (
  { userId, ...input },
): Promise<string> => {
  if (input.guildId) return "Only available via DM";
  const options = "options" in input ? input.options : [];
  const opts = zRoundsOptions.parse(optionArrayToObject(options ?? []));
  const compact = opts.compact ?? false;
  const color = opts.color ?? "self";
  const prows = sql<
    { battlenettag: string }[]
  >`SELECT battlenettag FROM elo.discordBattleNetMap WHERE discordId = ${userId};`;
  const rows = await prows;
  const self = color === "self"
    ? await prows.then((d) => d[0]?.battlenettag)
    : undefined;
  const replay: number = opts.replay ??
    await sql<
      { replayid: number }[]
    >`SELECT replayid FROM elo.replay ORDER BY replayid DESC LIMIT 1;`
      .then((d) => d[0].replayid);
  console.log({ color, self, userId, rows });

  const data = await sql<
    {
      round: number;
      mode: string;
      player: string;
      change: number;
      duration: number;
    }[]
  >`SELECT round.round, \`mode\`, player, \`change\`, duration
		FROM elo.outcome
		INNER JOIN elo.round ON outcome.replayid = round.replayid
			AND outcome.round = round.round
		WHERE outcome.replayid = ${replay};`;

  if (!data.length) {
    return "No round founds.";
  }

  const grouped = data.reduce(
    (data, { round, mode, player, ...rest }) => {
      const roundData = data[round] ?? (data[round] = {});
      const modeData = roundData[mode] ?? (roundData[mode] = {});
      modeData[player] = rest;
      return data;
    },
    {} as Record<
      string,
      Record<string, Record<string, { change: number; duration: number }>>
    >,
  );

  if (!compact) {
    const message = verboseResponse(grouped);
    if (message.length <= 2000) {
      return message;
    }
  }

  return compactResponse(grouped, self).slice(0, -3) + "```";
};
