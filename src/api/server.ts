import { yellow } from "jsr:@std/fmt/colors";
import { STATUS_CODE } from "jsr:@std/http/status";
import { format } from "jsr:@std/fmt/bytes";
import { APIError } from "./ErrorCode.ts";
import { ZodError } from "npm:zod";
import { routes } from "./routes.ts";
import { SerializableResponse } from "./types.ts";

const handle = async (req: Request) => {
  const url = new URL(req.url);
  const reqMethod = req.method.toLowerCase();

  for (const [method, pattern, handler] of routes) {
    if (reqMethod !== method) continue;
    const result = pattern.exec(url);
    if (result) {
      let body: SerializableResponse = null;
      try {
        body = await req.json();
      } catch {
        /* ignore */
      }
      return handler({ req, url, route: result, body });
    }
  }

  throw new APIError("missing_route", `Unknown route '${url.pathname}'`);
};

const getResponse = async (result: unknown) => {
  if (!result || typeof result !== "object") return result;
  if (!(result instanceof Response)) return result;
  const contentType = result.headers.get("content-type");
  if (contentType?.startsWith("application/json")) {
    try {
      return await result.clone().json();
    } catch {
      // do nothing
    }
  }
  return `${contentType} ${yellow(format((await result.clone().blob()).size))}`;
};

Deno.serve({ port: 3020 }, async (req) => {
  const start = performance.now();

  if (req.headers.get("authorization") !== (Deno.env.get("API_SECRET") ?? "")) {
    return Response.json(
      { errors: [{ message: "unauthorized" }] },
      { status: STATUS_CODE.Unauthorized },
    );
  }

  let status: number = STATUS_CODE.OK;
  const result = await handle(req).catch((error: unknown) => {
    if (error && typeof error === "object") {
      if ("status" in error && typeof error.status === "number") {
        status = error.status;
      } else if (error instanceof APIError || error instanceof ZodError) {
        status = STATUS_CODE.BadRequest;
      } else status = STATUS_CODE.InternalServerError;
    }

    if (error instanceof ZodError) return { errors: error.issues };

    return { errors: [error] };
  });

  getResponse(result);

  console.log(
    new Date(),
    yellow(`${(performance.now() - start).toFixed(3)}ms`),
    req.url,
    "→",
    await getResponse(result),
  );

  try {
    if (result && typeof result === "object" && result instanceof Response) {
      return result;
    }
    if (typeof result === "string") return new Response(result, { status });
    return Response.json(result, { status });
  } catch (err) {
    console.error(err);
    return Response.json({ error: { code: "invalid_server_response" } }, {
      status: 500,
    });
  }
});
