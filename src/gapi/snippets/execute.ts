import { parse, parseValue, visit } from "npm:graphql";
import { print } from "npm:graphql";

const content = await Deno.readTextFile(
  `./src/gapi/snippets/${Deno.args[0]}.gql`,
);

const overrides = Object.fromEntries(
  Deno.args.slice(1).map((pair) => {
    const [k, ...v] = pair.split("=");
    return [k, v.join("=")];
  }),
);

const original = parse(content);
const query = Deno.args.length === 1 ? original : visit(original, {
  Argument(node) {
    if (!(node.name.value in overrides)) return;
    return {
      ...node,
      value: parseValue(overrides[node.name.value]),
    };
  },
});

console.log(
  Deno.inspect(
    await fetch("http://localhost:3020/graphql", {
      method: "post",
      headers: { authorization: Deno.env.get("API_SECRET") ?? "" },
      body: JSON.stringify({ query: print(query) }),
    }).then((r) => r.json()),
    { colors: true, depth: Infinity },
  ),
);
