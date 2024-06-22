import { db } from "../../sources/kv.ts";
import { Handler, SerializableResponse } from "../types.ts";
import { ansiToHTML } from "../util/ansiToHTML.ts";

export const handleCircularReferences = <T>(input: T): SerializableResponse => {
  const seen = new WeakMap<object, string>();

  function deepCopy(obj: unknown, path: string): SerializableResponse {
    if (obj === null || typeof obj !== "object") return obj as string; // literal

    if (seen.has(obj)) return `[Circular ${seen.get(obj)}]`;

    if ("toJSON" in obj && typeof obj.toJSON === "function") {
      obj = obj.toJSON();
    }
    if (obj === null || typeof obj !== "object") return obj as string; // literal

    // deno-lint-ignore no-explicit-any
    const copy: any = Array.isArray(obj) ? [] : {};
    seen.set(obj, path || "root");

    for (const key in obj) {
      // deno-lint-ignore no-prototype-builtins
      if (obj.hasOwnProperty(key)) {
        const newPath = Array.isArray(obj)
          ? `${path}[${key}]`
          : `${path}.${key}`;
        copy[key] = deepCopy(obj[key as keyof typeof obj], newPath);
      }
    }

    return copy;
  }

  return deepCopy(input, "");
};

export const getAlerts: Handler = async () =>
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
    pre {
        margin: 0.5em 0px;
        white-space: pre-wrap;
        margin-left: 8ch;
        text-indent: -8ch;
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
  ${await db.alerts.getMany().then((v) =>
      `<pre>${
        ansiToHTML(
          Deno.inspect(v.result, {
            colors: true,
            depth: Infinity,
            compact: true,
          }),
        )
      }</pre>`
    )}
<body>`,
    { headers: { "content-type": "text/html" } },
  );
