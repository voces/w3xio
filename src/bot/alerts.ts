import { z } from "zod";
import { APIError } from "../api/ErrorCode.ts";
import {
  deleteAlert as deleteAlertCore,
  getAlert as getAlertCore,
  upsertAlert as upsertAlertCore,
} from "../sources/alerts.ts";

/**
 * Bot-facing wrappers around the core alert operations. Previously the Discord
 * bot reached these over HTTP (`fetch(${W3XIO}/alerts)`); now that the bot lives
 * inside w3xio it calls the shared core directly. The `{ errors }` shape is
 * preserved so the ported command/modal handlers work unchanged.
 */

export const zAlertKey = z.union([
  z.literal("map"),
  z.literal("host"),
  z.literal("name"),
  z.literal("server"),
]);

type ErrorResult = { errors: { code: string; message?: string }[] };

const toErrorResult = (err: unknown): ErrorResult => {
  if (err instanceof APIError) {
    return { errors: [{ code: err.code, message: err.message }] };
  }
  console.error(err);
  return {
    errors: [{
      code: "internal_error",
      message: err instanceof Error ? err.message : String(err),
    }],
  };
};

export const upsertAlert = upsertAlertCore;

export const getAlert = (channelId: string) =>
  getAlertCore(channelId).catch(toErrorResult);

export const deleteAlert = (channelId: string) =>
  deleteAlertCore(channelId).catch(toErrorResult);
