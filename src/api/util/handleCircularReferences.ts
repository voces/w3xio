import { SerializableResponse } from "../types.ts";

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
