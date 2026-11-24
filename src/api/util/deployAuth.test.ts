import { assertEquals } from "@std/assert";
import { isDeployAuthorized } from "./deployAuth.ts";

const SECRET = "s3cret-token";

Deno.test("isDeployAuthorized: accepts the secret as a bearer token", () => {
  assertEquals(isDeployAuthorized(`Bearer ${SECRET}`, SECRET), true);
  assertEquals(isDeployAuthorized(`bearer  ${SECRET}`, SECRET), true);
});

Deno.test("isDeployAuthorized: rejects a missing or wrong token", () => {
  for (
    const header of [
      null,
      "",
      "Bearer",
      "Bearer ",
      SECRET,
      `Basic ${SECRET}`,
      `Bearer ${SECRET}x`,
      `Bearer ${SECRET.slice(1)}`,
      `Bearer ${SECRET} extra`,
    ]
  ) assertEquals(isDeployAuthorized(header, SECRET), false, String(header));
});
