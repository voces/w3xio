export const parseMode = (mode: string) =>
  /^(\d+v\d+|%)(-(sheep|wolf|%)|%)?|overall|%(sheep|wolf)$/.test(mode)
    ? mode
    : undefined;
