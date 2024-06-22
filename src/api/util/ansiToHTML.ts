export const ansiToHTML = (text: string): string => {
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
