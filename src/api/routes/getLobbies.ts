import { getCachedLobbies, process, stats } from "../../liveLobbies.ts";
import { Handler } from "../types.ts";
import { ansiToHTML } from "../util/ansiToHTML.ts";

export const getLobbies: Handler = (ctx) => {
  const allLobbies = getCachedLobbies();

  if (ctx.req.headers.get("accept")?.includes("application/json")) {
    const limit = Math.min(
      Number(ctx.url.searchParams.get("limit")) || 100,
      1000,
    );
    const offset = Math.max(
      Number(ctx.url.searchParams.get("offset")) || 0,
      0,
    );

    const filterKeys = ["map", "host", "name", "server"] as const;
    type FilterKey = typeof filterKeys[number];
    const rules: { key: FilterKey; value: string | RegExp }[] = [];
    for (const key of filterKeys) {
      const raw = ctx.url.searchParams.get(key);
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
    const alive = ctx.url.searchParams.get("alive") === "1";
    const tracked = ctx.url.searchParams.get("tracked") === "1";
    const hasFilters = rules.length > 0 || alive || tracked;

    const need = offset + limit + 1;
    let collected: typeof allLobbies;
    if (!hasFilters) {
      collected = allLobbies.slice(0, need);
    } else {
      collected = [];
      for (const l of allLobbies) {
        if (
          process(rules, l) &&
          (!alive || !l.deadAt) &&
          (!tracked || l.messages.length)
        ) {
          collected.push(l);
          if (collected.length >= need) break;
        }
      }
    }

    const page = collected.slice(offset, offset + limit);
    return new Response(
      JSON.stringify({
        lobbies: page,
        total: allLobbies.length,
        hasMore: collected.length > offset + limit,
        lastUpdate: stats.lastDataUpdate,
      }),
      {
        headers: { "content-type": "application/json" },
      },
    );
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
          Deno.inspect(allLobbies, {
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
