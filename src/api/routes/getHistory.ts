import { logBuffer } from "../../logger.ts";
import { Handler, SerializableResponse } from "../types.ts";

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

export const getHistory: Handler = () =>
  new Response(
    `
    <head>
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
            .controls {
                position: fixed;
                bottom: 8px;
                right: 8px;
            }
            .controls > button {
                cursor: pointer;
                background: none;
                color: inherit;
                border: none;
                padding: 0;
                font-family: inherit;
                font-size: inherit;
                opacity: 0.05;
                transition: opacity 125ms;
            }
            .controls > button.selected {opacity: 0.2}
            .controls:hover > button {opacity: 0.2}
            .controls:hover > button.selected {opacity: 0.4}
            .controls > button:hover {opacity: 1}
            .controls > button:hover.selected {opacity: 1}
            pre {
                // transition: transform 0.5s ease, opacity 0.5s ease, height 0.5s ease, margin-top 0.5s ease;
                transition: 0.5s ease;
                opacity: 1;
                transform-origin: top;
                transform: scaleY(1);
                height: auto;
            }
            pre.hidden {
                opacity: 0;
                transform: scaleY(0);
                height: 0;
                margin-top: 0;
                margin-bottom: 0;
            }
        </style>
    </head>
    <body>
        ${logBuffer.getHTMLHistory()}
        <div class="controls">
            <button>debug</button>
            <button class="selected">log</button>
            <button class="selected">warn</button>
            <button class="selected">error</button>
        </div>
        <script>
            Array.from(document.querySelectorAll(".controls > button"))
                .forEach(b => b.addEventListener("click", e => {
                    const visible = b.classList.toggle("selected");
                    for (const line of document.querySelectorAll(\`pre.\${b.textContent}\`)) {
                        const height = line.scrollHeight + "px";
                        line.style.height = height;
                        line.offsetHeight;
                        line.classList.toggle("hidden");
                        if (!visible) line.style.height = 0;
                    }
                }));
            window.addEventListener("load", () => scrollTo(0, document.body.scrollHeight));
        </script>
    <body>`,
    {
      headers: { "content-type": "text/html" },
    },
  );
