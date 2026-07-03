import { assertEquals } from "@std/assert";
import { formatTime } from "./formatTime.ts";

Deno.test("zero", () => assertEquals(formatTime(0), "0"));

Deno.test("1", () => assertEquals(formatTime(1), "1 second"));

Deno.test("30", () => assertEquals(formatTime(30), "30 seconds"));

Deno.test("60", () => assertEquals(formatTime(60), "1 minute"));

Deno.test("61", () => assertEquals(formatTime(61), "1 minute and 1 second"));

Deno.test("62", () => assertEquals(formatTime(62), "1 minute and 2 seconds"));

Deno.test("120", () => assertEquals(formatTime(120), "2 minutes"));

Deno.test("121", () => assertEquals(formatTime(121), "2 minutes and 1 second"));

Deno.test("122", () =>
  assertEquals(formatTime(122), "2 minutes and 2 seconds"));

Deno.test("3600", () => assertEquals(formatTime(3600), "1 hour"));

Deno.test("3601", () => assertEquals(formatTime(3601), "1 hour and 1 second"));

Deno.test("3660", () => assertEquals(formatTime(3660), "1 hour and 1 minute"));

Deno.test("3661", () =>
  assertEquals(formatTime(3661), "1 hour, 1 minute, and 1 second"));

Deno.test("7322", () =>
  assertEquals(formatTime(7322), "2 hours, 2 minutes, and 2 seconds"));
