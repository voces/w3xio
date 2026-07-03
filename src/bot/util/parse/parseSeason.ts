export const parseSeason = (season: string | undefined) =>
  season ? (/^20[1-2]\dQ[1-4]$/.test(season) ? season : undefined) : undefined;
