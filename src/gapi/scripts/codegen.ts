import { codegen } from "npm:@graphql-codegen/core";
import { buildSchema, GraphQLSchema, parse, printSchema } from "npm:graphql";
import * as typescriptPlugin from "npm:@graphql-codegen/typescript";
import * as typescriptResolversPlugin from "npm:@graphql-codegen/typescript-resolvers";

const schema: GraphQLSchema = buildSchema(
  await Deno.readTextFile("./src/gapi/schema.gql"),
);
const outputFile = "./src/gapi/schema.ts";
const config: Parameters<typeof codegen>[0] = {
  documents: [],
  config: {
    immutableTypes: true,
    enumsAsTypes: true,
    avoidOptionals: true,
    arrayInputCoercion: true, // IDK
    customResolverFn:
      "(args: TArgs, context: TContext, info: GraphQLResolveInfo) => Promise<TResult> | TResult",
  },
  filename: outputFile,
  schema: parse(printSchema(schema)),
  plugins: [{ typescript: {} }, { typescriptResolvers: {} }],
  pluginMap: {
    typescript: typescriptPlugin,
    typescriptResolvers: typescriptResolversPlugin,
  },
};

const output = await codegen(config);
await Deno.writeTextFile(
  outputFile,
  output.replace("from 'graphql'", "from 'npm:graphql'"),
);
