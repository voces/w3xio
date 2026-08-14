/**
 * Colour pips for lobby rosters.
 *
 * Discord can't tint text, so each Warcraft player colour gets a solid-colour
 * emoji of its own. They live on the bot's *application* rather than in a
 * guild: application emoji need no guild membership and no Use External Emoji
 * permission, so they render in every server we post to, including DMs.
 *
 * The squares are minted here from the palette the feed itself reports, so
 * there is nothing to design, host, or keep in sync with anybody else's server.
 * Provisioning is idempotent — we list what the application already has and
 * create only what's missing — and entirely optional: if any of it fails the
 * roster simply renders without pips.
 */

import { APIEmoji } from "discord-api-types/v10";
import { discord } from "./discord.ts";
import { solidSquare } from "./png.ts";

/** Warcraft III's 24 player colours, as the wc3stats feed reports them. */
const PALETTE: Record<string, string> = {
  red: "#FF0303",
  blue: "#0042FF",
  teal: "#1CE6B9",
  purple: "#540081",
  yellow: "#FFFC01",
  orange: "#FE8A0E",
  green: "#20C000",
  pink: "#E55BB0",
  gray: "#959697",
  light_blue: "#7EBFF1",
  dark_green: "#106246",
  brown: "#4E2A04",
  maroon: "#9B0000",
  navy: "#0000C3",
  turquoise: "#00EAFF",
  violet: "#BE00FE",
  wheat: "#EBCD87",
  peach: "#F8A48B",
  mint: "#BFFF80",
  lavender: "#DCB9EB",
  coal: "#282828",
  snow: "#EBF0FF",
  emerald: "#00781E",
  peanut: "#A46F33",
};

// Prefixed so these stay recognisable among whatever else the application owns.
const emojiName = (color: string) => `w3_${color}`;

const pips = new Map<string, string>();

/** The pip for a slot colour, ready to prefix a name, or "" if we have none. */
export const pip = (color: string | undefined): string => {
  const emoji = color ? pips.get(color) : undefined;
  return emoji ? `${emoji} ` : "";
};

/**
 * Makes sure the application owns a square for every colour, and remembers the
 * ids. Safe to call on every boot: existing emoji are reused, and anything that
 * goes wrong only costs us the pips.
 */
export const provisionPips = async (): Promise<void> => {
  const application = await discord.applications.getCurrent();
  const route = `/applications/${application.id}/emojis` as const;
  const { items } = await discord.rest.get(route) as { items: APIEmoji[] };
  const existing = new Map(items.map((emoji) => [emoji.name, emoji.id]));

  let created = 0;
  for (const [color, hex] of Object.entries(PALETTE)) {
    const name = emojiName(color);
    try {
      let id = existing.get(name);
      if (!id) {
        const emoji = await discord.rest.post(route, {
          body: { name, image: await solidSquare(hex) },
        }) as APIEmoji;
        id = emoji.id;
        created++;
      }
      if (id) pips.set(color, `<:${name}:${id}>`);
    } catch (err) {
      console.error(new Date(), `Failed to provision ${name} pip:`, err);
    }
  }

  console.log(
    new Date(),
    `Lobby colour pips ready: ${pips.size}/${Object.keys(PALETTE).length}`,
    created ? `(${created} newly uploaded)` : "(all already uploaded)",
  );
};
