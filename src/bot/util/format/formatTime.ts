import { formatList } from "./formatList.ts";

const units = ["minute", "hour"];

export const formatTime = (
  seconds: number,
  compact = false,
  showUnit?: "minute" | "hour",
): string => {
  const showUnitIndex = showUnit ? units.indexOf(showUnit) : -1;
  const parts: string[] = [];
  if (seconds >= 3600 || showUnitIndex >= 1) {
    const hours = Math.floor(seconds / 3600);
    seconds -= hours * 3600;
    parts.push(`${hours}${compact ? ":" : ` hour${hours === 1 ? "" : "s"}`}`);
  }
  if (seconds >= 60 || showUnitIndex >= 0) {
    const minutes = Math.floor(seconds / 60);
    seconds -= minutes * 60;
    parts.push(
      `${minutes}${compact ? ":" : ` minute${minutes === 1 ? "" : "s"}`}`,
    );
  }
  if (seconds > 0 || compact) {
    parts.push(
      compact
        ? seconds.toString().padStart(2, "0")
        : `${seconds} second${seconds === 1 ? "" : "s"}`,
    );
  }
  if (parts.length === 0) parts.push(seconds.toString());
  return compact ? parts.join("") : formatList(parts);
};
