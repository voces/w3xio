import { assertEquals } from "@std/assert";
import { formatList } from "./formatList.ts";

Deno.test("empty", () => assertEquals(formatList([]), ""));

Deno.test("one", () => assertEquals(formatList(["foo"]), "foo"));

Deno.test("two", () => assertEquals(formatList(["foo", "bar"]), "foo and bar"));

Deno.test("three", () =>
  assertEquals(formatList(["foo", "bar", "baz"]), "foo, bar, and baz"));
