import { gray, red, yellow } from "jsr:@std/fmt/colors";

const ansiToHTML = (text: string): string => {
  // deno-lint-ignore no-control-regex
  const ansiRegex = /\x1b\[(\d+;)*\d+m/g;
  const ansiToClassMap: { [key: string]: string } = {
    "30": "ansi-black",
    "31": "ansi-red",
    "32": "ansi-green",
    "33": "ansi-yellow",
    "34": "ansi-blue",
    "35": "ansi-magenta",
    "36": "ansi-cyan",
    "37": "ansi-white",
    "90": "ansi-bright-black",
    "91": "ansi-bright-red",
    "92": "ansi-bright-green",
    "93": "ansi-bright-yellow",
    "94": "ansi-bright-blue",
    "95": "ansi-bright-magenta",
    "96": "ansi-bright-cyan",
    "97": "ansi-bright-white",
  };

  return text.replace(ansiRegex, (match) => {
    const codes = match.slice(2, -1).split(";").map((code) =>
      ansiToClassMap[code] || ""
    );
    const classes = codes.filter(Boolean).join(" ");
    return classes ? `<span class="${classes}">` : "</span>";
  }) + "</span>".repeat((text.match(ansiRegex) || []).length);
};

class MemoryBuffer {
  private buffer: [string, string][];
  private maxSize: number;
  private currentIndex: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.buffer = new Array(maxSize);
    this.currentIndex = 0;
  }

  add(level: string, data: string) {
    this.buffer[this.currentIndex] = [level, data];
    this.currentIndex = (this.currentIndex + 1) % this.maxSize;
  }

  getHistory(): string {
    const start = this.currentIndex;
    const end = this.buffer.length;
    const recentEntries = this.buffer.slice(start, end).concat(
      this.buffer.slice(0, start),
    );

    return recentEntries.filter(Boolean).join("\n");
  }

  getHTMLHistory(): string {
    const start = this.currentIndex;
    const end = this.buffer.length;
    const recentEntries = this.buffer.slice(start, end).concat(
      this.buffer.slice(0, start),
    );
    return recentEntries
      .filter(Boolean)
      .map(([level, entry]) =>
        `<pre class="${
          [level, level === "debug" ? "hidden" : ""].filter(Boolean).join(" ")
        }">${ansiToHTML(entry)}</pre>`
      )
      .join("\n");
  }
}

export const logBuffer = new MemoryBuffer(10000);

const style = (args: unknown[]) =>
  args.map((v) =>
    typeof v === "string"
      ? v
      : Deno.inspect(v, { colors: true, depth: Infinity, compact: true })
        .slice(
          0,
          1000,
        )
  );

const originalConsoleLog = console.log;
console.log = (...args: unknown[]) => {
  const styled = style(args);
  logBuffer.add("log", `[log]   ${styled.join(" ")}`);
  originalConsoleLog.apply(console, styled);
};

const originalConsoleDebug = console.debug;
console.debug = (...args: unknown[]) => {
  const styled = style(args);
  logBuffer.add("debug", `${gray("[debug]")} ${styled.join(" ")}`);
  originalConsoleDebug.apply(console, styled);
};

const originalConsoleWarn = console.debug;
console.warn = (...args: unknown[]) => {
  const styled = style(args);
  logBuffer.add("warn", `${yellow("[warn]")}  ${styled.join(" ")}`);
  originalConsoleWarn.apply(console, styled);
};

const originalConsoleError = console.debug;
console.error = (...args: unknown[]) => {
  const styled = style(args);
  logBuffer.add("error", `${red("[error]")} ${styled.join(" ")}`);
  originalConsoleError.apply(console, styled);
};
