import {
  APIChannel,
  APIGuildMember,
  APIRole,
} from "discord-api-types/v10";
import { discord } from "../sources/discord.ts";

const id = Deno.env.get("BOT_ID") ?? "536245741182648360";

export const hasPermission = async (
  { userId = id, channelId, guildId, permission }: {
    userId?: string;
    channelId: string;
    guildId: string;
    permission: bigint;
  },
) => {
  const [channel, member, roles] = await Promise.all([
    discord.channels.get(channelId).catch(() => undefined) as Promise<
      APIChannel | undefined
    >,
    discord.guilds.getMember(guildId, userId).catch(() => undefined) as Promise<
      APIGuildMember | undefined
    >,
    discord.guilds.getRoles(guildId).catch(() => undefined) as Promise<
      APIRole[] | undefined
    >,
  ]);
  if (!channel || !member || !roles) return false;

  let permissions = roles.filter((r) =>
    r.id === guildId || r.id in member.roles
  ).reduce(
    (permissions, role) => permissions | BigInt(role.permissions),
    0n,
  );
  if (
    "permission_overwrites" in channel &&
    Array.isArray(channel.permission_overwrites)
  ) {
    const overwrites = channel
      .permission_overwrites.reduce((overwrites, overwrite) => {
        if (overwrite.id === guildId) {
          overwrites[0].allow |= BigInt(overwrite.allow);
          overwrites[0].deny |= BigInt(overwrite.deny);
        } else if (member.roles.includes(overwrite.id)) {
          overwrites[1].allow |= BigInt(overwrite.allow);
          overwrites[1].deny |= BigInt(overwrite.deny);
        } else if (overwrite.id === userId) {
          overwrites[2].allow |= BigInt(overwrite.allow);
          overwrites[2].deny |= BigInt(overwrite.deny);
        }
        return overwrites;
      }, [{ allow: 0n, deny: 0n }, { allow: 0n, deny: 0n }, {
        allow: 0n,
        deny: 0n,
      }]);
    for (const overwrite of overwrites) {
      permissions &= ~overwrite.deny;
      permissions |= overwrite.allow;
    }
  }
  return (permissions & permission) === permission;
};
