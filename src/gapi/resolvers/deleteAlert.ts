import { MutationResolvers } from "../schema.ts";
import { db } from "../../sources/kv.ts";

export const deleteAlert: MutationResolvers["deleteAlert"] = async (
  { channelId },
) => {
  const existing = await db.alerts.find(channelId);
  if (!existing) return false;

  await db.alerts.delete(channelId);
  return true;
};
