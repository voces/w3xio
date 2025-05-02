import { ZodType } from "npm:zod";

export const zodFetch = async <T>(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1] & { schema: ZodType<T> },
) => {
  const result = await fetch(input, init);
  const json: unknown = await result.json();
  try {
    return init.schema.parse(json);
  } catch (err) {
    console.debug(json);
    throw err;
  }
};
