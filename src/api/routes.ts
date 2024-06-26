import { getAlert } from "./routes/getAlert.ts";
import { Routes } from "./types.ts";
import { upsertAlert } from "./routes/upsertAlert.ts";
import { deleteAlert } from "./routes/deleteAlert.ts";
import { getHistory } from "./routes/getHistory.ts";
import { getAlerts } from "./routes/getAlerts.ts";

export const routes = ([
  ["get", "/favicon.ico", () => ""],
  ["post", "/alerts", upsertAlert],
  ["get", "/alerts/:channelId", getAlert],
  ["delete", "/alerts/:channelId", deleteAlert],
  ["get", "/history", getHistory],
  ["get", "/alerts", getAlerts],
] satisfies Routes).map(([method, route, handler]) =>
  [method, new URLPattern({ pathname: route }), handler] as const
);
