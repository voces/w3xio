import { db } from "../../sources/kv.ts";
import { Handler } from "../types.ts";
import { ansiToHTML } from "../util/ansiToHTML.ts";

export const getLobbies: Handler = async () =>
  new Response(
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
  ${await db.lobbies.getMany().then((v) =>
      `<pre>${
        ansiToHTML(
          Deno.inspect(v.result.map((r) => r.value), {
            colors: true,
            depth: Infinity,
            compact: true,
            iterableLimit: Infinity,
          }),
        )
      }</pre>`
    )}
<body>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
