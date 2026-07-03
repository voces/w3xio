// https://gist.github.com/karol-majewski/b234a4aceb8884ccc1acf25a2e1ed16e#file-fromentries-with-literal-types-ts

import { APIApplicationCommandInteractionDataOption } from "discord-api-types/v10";

type Option<K extends PropertyKey, V> = { name: K; value: V; type: number };

type UnionToIntersection<Union> = (
  Union extends unknown ? (argument: Union) => void : never
) extends (argument: infer Intersection) => void ? Intersection
  : never;

type FromEntries<
  T extends Option<K, V>,
  K extends PropertyKey,
  V extends unknown,
> = UnionToIntersection<
  T extends { name: infer Key; value: infer Value; type: number }
    ? Key extends PropertyKey ? Record<Key, Value | undefined>
    : never
    : never
>;

export const optionArrayToObject = (
  options: APIApplicationCommandInteractionDataOption[],
) => {
  const optMap: Record<string, string | number | boolean | undefined> = {};
  for (const option of options) {
    if ("value" in option) optMap[option.name] = option.value;
    else {
      console.warn("Ignoring advanced option", option);
    }
  }
  return optMap;
};
