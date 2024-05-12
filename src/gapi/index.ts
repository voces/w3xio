import "jsr:@std/dotenv/load";
import "./util/watchSchema.ts";
import {
  buildSchema,
  DocumentNode,
  graphql,
  GraphQLResolveInfo,
  GraphQLSchema,
  parse,
} from "npm:graphql";
import { Resolvers } from "./schema.ts";
import { STATUS_CODE } from "jsr:@std/http/status";
import { z } from "npm:zod";
import { Kind } from "npm:graphql";
import { gray, setColorEnabled, yellow } from "jsr:@std/fmt/colors";
import { exists } from "jsr:@std/fs";
import { upsertAlert } from "./resolvers/upsertAlert.ts";
import { getAlert } from "./resolvers/getAlert.ts";
import { deleteAlert } from "./resolvers/deleteAlert.ts";

if (!Deno.stdout.isTerminal()) setColorEnabled(false);

let schemaContent: string;
let schema: GraphQLSchema;
try {
  schemaContent = await Deno.readTextFile("./src/gapi/schema.gql");
  schema = buildSchema(schemaContent);
  Deno.writeTextFile("/tmp/discord-bot-schema.gql", schemaContent);
} catch (err) {
  if (!await exists("/tmp/discord-bot-schema.gql")) throw err;
  console.error(err);
  console.log("Using cached schema");
  schemaContent = await Deno.readTextFile("/tmp/discord-bot-schema.gql");
  schema = buildSchema(schemaContent);
}

const resolvers:
  & Pick<Resolvers<GraphQLResolveInfo>, "Query" | "Mutation">
  & Partial<Omit<Resolvers<GraphQLResolveInfo>, "Query" | "Mutation">> = {
    Query: {
      alert: getAlert,
    },
    Mutation: {
      alert: upsertAlert,
      deleteAlert,
    },
  };

const zGqlRequest = z.object({
  query: z.string(),
  variables: z.record(z.string(), z.unknown()).optional(),
});

Deno.serve({ port: 3020 }, async (req) => {
  const start = performance.now();
  if (req.headers.get("authorization") !== (Deno.env.get("API_SECRET") ?? "")) {
    console.log("actual", req.headers.get("authorization"));
    console.log("expected", Deno.env.get("API_SECRET") ?? "");
    return Response.json({ errors: [{ message: "unauthorized" }] }, {
      status: STATUS_CODE.Unauthorized,
    });
  }

  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname === "/schema") {
    console.log("schema", schemaContent);
    return new Response(schemaContent);
  }

  if (req.method !== "POST") {
    return Response.json({ errors: [{ message: "invalid method" }] }, {
      status: STATUS_CODE.MethodNotAllowed,
    });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ errors: [{ message: "invalid json" }] });
  }

  const parsed = zGqlRequest.safeParse(json);
  if (!parsed.data) {
    return Response.json({
      errors: parsed.error.issues.map((i) => ({
        message: `${i.path.join(".")}: ${i.message}`,
        info: i,
      })),
    }, { status: STATUS_CODE.BadRequest });
  }

  let doc: DocumentNode;
  try {
    doc = parse(parsed.data.query);
  } catch (err) {
    return Response.json({ errors: [err] }, {
      status: STATUS_CODE.BadRequest,
    });
  }
  const first = doc.definitions[0];
  if (first?.kind !== Kind.OPERATION_DEFINITION) {
    return Response.json({
      errors: [{
        message:
          "Expected first definition in query to be an operation definition",
      }],
    }, { status: STATUS_CODE.BadRequest });
  }

  if (url.pathname !== "/graphql") {
    return Response.json({
      errors: [{ message: "Expected pathname to be '/graphql'" }],
    }, { status: STATUS_CODE.NotFound });
  }

  const result = await graphql({
    schema,
    source: parsed.data.query,
    variableValues: parsed.data.variables,
    contextValue: {},
    rootValue: resolvers[first.operation === "mutation" ? "Mutation" : "Query"],
  });

  console.log(
    new Date(),
    yellow(`${(performance.now() - start).toFixed(3)}ms`),
    first.operation,
    first.name ?? gray("<anonymous>"),
    Deno.inspect(JSON.parse(JSON.stringify(result)), {
      colors: true,
      depth: Infinity,
    }),
  );

  return Response.json(result);
});
