export type SerializableResponse = string | number | boolean | null | {
  [key: string]: SerializableResponse;
} | SerializableResponse[];

export type Context = {
  req: Request;
  url: URL;
  route: URLPatternResult;
  body: SerializableResponse | undefined;
};

export type Handler = (
  context: Context,
) =>
  | SerializableResponse
  | Promise<SerializableResponse>
  | Response
  | Promise<Response>;

type Method = "post" | "get" | "delete" | "put";

export type Routes = [Method, string, Handler][];
