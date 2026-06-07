import { getCachedLobbies, process, stats } from "../../liveLobbies.ts";
import { getSourceLiveness, Lobby } from "../../sources/lobbies.ts";
import { getMetricsSummary } from "../../sources/metrics.ts";
import { Handler } from "../types.ts";
import { ansiToHTML } from "../util/ansiToHTML.ts";

const filterKeys = ["map", "host", "name", "server"] as const;
type FilterKey = typeof filterKeys[number];

const parseFilters = (params: URLSearchParams) => {
  const rules: { key: FilterKey; value: string | RegExp }[] = [];
  for (const key of filterKeys) {
    const raw = params.get(key);
    if (!raw) continue;
    const m = raw.match(/^\/(.+)\/(\w*)$/);
    if (m) {
      try {
        rules.push({ key, value: new RegExp(m[1], m[2] || undefined) });
        continue;
      } catch { /* fall through to string */ }
    }
    rules.push({ key, value: raw });
  }
  const alive = params.get("alive") === "1";
  const tracked = params.get("tracked") === "1";
  return {
    rules,
    alive,
    tracked,
    hasFilters: rules.length > 0 || alive || tracked,
  };
};

const matches = (
  lobby: Lobby,
  filters: ReturnType<typeof parseFilters>,
): boolean =>
  process(filters.rules, lobby) &&
  (!filters.alive || !lobby.deadAt) &&
  (!filters.tracked || !!lobby.messages.length);

export const getLobbies: Handler = async (ctx) => {
  const allLobbies = getCachedLobbies();
  const filters = parseFilters(ctx.url.searchParams);
  const limit = Math.min(
    Number(ctx.url.searchParams.get("limit")) || 100,
    1000,
  );
  const offset = Math.max(
    Number(ctx.url.searchParams.get("offset")) || 0,
    0,
  );

  let matched: typeof allLobbies;
  let total: number;
  if (!filters.hasFilters) {
    matched = allLobbies;
    total = allLobbies.length;
  } else {
    matched = allLobbies.filter((l) => matches(l, filters));
    total = matched.length;
  }

  const page = matched.slice(offset, offset + limit);
  const payload = {
    lobbies: page,
    total,
    totalUnfiltered: allLobbies.length,
    hasMore: offset + page.length < total,
    lastUpdate: stats.lastDataUpdate,
    liveness: getSourceLiveness(),
    metrics: await getMetricsSummary(),
  };

  if (ctx.req.headers.get("accept")?.includes("application/json")) {
    return new Response(JSON.stringify(payload), {
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(
    `<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/png" href="data:image/png;base64,iVBORw0KGgo=">
  <style>
    :root {
        background-color: #181818;
        color: #ccc;
        font-family: Consolas, "Courier New", monospace;
    }
    .ansi-black {color: #000}
    .ansi-red {color: #cd3131}
    .ansi-green {color: #0dbc79}
    .ansi-yellow {color: #e5e510}
    .ansi-blue {color: #2472c8}
    .ansi-magenta {color: #bc3fbc}
    .ansi-cyan {color: #11a8cd}
    .ansi-white {color: #e5e5e5}
    .ansi-bright-black {color: #666}
    .ansi-bright-red {color: #f14c4c}
    .ansi-bright-green {color: #23d18b}
    .ansi-bright-yellow {color: #f5f543}
    .ansi-bright-blue {color: #3b8eea}
    .ansi-bright-magenta {color: #d670d6}
    .ansi-bright-cyan {color: #29b8db}
    .ansi-bright-white {color: #f5f543}
  </style>
</head>
<body>
  ${`<pre>${
      ansiToHTML(
        Deno.inspect(payload, {
          colors: true,
          depth: Infinity,
          compact: true,
          iterableLimit: Infinity,
        }),
      )
    }</pre>`}
<body>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
};
