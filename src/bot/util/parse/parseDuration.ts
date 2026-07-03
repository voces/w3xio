const multiples = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
};

export const parseDuration = (duration: string) => {
  const parts = duration.match(/^([0-9.]+)([smhdw])/);
  if (!parts) return;

  const [, numberPart, unitPart] = parts;

  const number = parseFloat(numberPart);
  if (!Number.isFinite(number)) return;

  const multiple =
    unitPart in multiples ? multiples[unitPart as keyof typeof multiples] : 1;

  return number * multiple;
};
