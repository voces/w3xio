import SqlString from "sqlstring";

/**
 * Thin client for the external elo database, exposed via the wc3lobbylist SQL
 * proxy at https://w3x.io/sql. The stats slash commands (max/top/rounds/summary)
 * farm out to this proxy; w3xio keeps calling it directly.
 */
const query = <T = unknown>(query: string): Promise<T> =>
  fetch("https://w3x.io/sql", {
    headers: {
      "x-dbproxy-user": "elopublic",
      "x-dbproxy-password": Deno.env.get("SQL_PASSWORD")!,
      "x-dbproxy-database": "elo",
    },
    method: "POST",
    body: query,
  })
    .then((r) => r.json())
    .then((data) => {
      if (
        data && typeof data === "object" && "code" in data &&
        data.code === -1 &&
        "message" in data && typeof data.message === "string"
      ) {
        throw data;
      }
      return data;
    });

export const format = (strings: TemplateStringsArray, ...values: unknown[]) =>
  SqlString.format(strings.join("?"), values);

export const iformat = (strings: TemplateStringsArray, ...values: unknown[]) =>
  SqlString.raw(SqlString.format(strings.join("?"), values));

export const raw = (sql: string) => SqlString.raw(sql);

export const sql = <T = unknown>(
  strings: TemplateStringsArray,
  ...values: unknown[]
) => query<T>(SqlString.format(strings.join("?"), values));
