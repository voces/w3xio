const listFormatter = new Intl.ListFormat("en", {
  style: "long",
  type: "conjunction",
});

export const formatList = (items: string[]): string =>
  listFormatter.format(items);
