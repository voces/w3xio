import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Whether an `Authorization` header carries the deploy secret, as
 * `Bearer <secret>`. Only a header is accepted: a token in the URL ends up in
 * nginx's access log.
 */
export const isDeployAuthorized = (
  header: string | null,
  secret: string,
): boolean => {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return !!match && timingSafeEqual(digest(match[1]), digest(secret));
};
