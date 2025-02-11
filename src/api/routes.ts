import { getAlert } from "./routes/getAlert.ts";
import { Routes } from "./types.ts";
import { upsertAlert } from "./routes/upsertAlert.ts";
import { deleteAlert } from "./routes/deleteAlert.ts";
import { getHistory } from "./routes/getHistory.ts";
import { getAlerts } from "./routes/getAlerts.ts";
import { getStatus } from "./routes/getStatus.ts";
import { getLobbies } from "./routes/getLobbies.ts";

export const routes = ([
  ["get", "/favicon.ico", () => ""],
  ["post", "/alerts", upsertAlert],
  ["get", "/alerts/:channelId", getAlert],
  ["delete", "/alerts/:channelId", deleteAlert],
  ["get", "/history", getHistory],
  ["get", "/alerts", getAlerts],
  ["get", "/status", getStatus],
  ["get", "/lobbies", getLobbies],
] satisfies Routes).map(([method, route, handler]) =>
  [method, new URLPattern({ pathname: route }), handler] as const
);
