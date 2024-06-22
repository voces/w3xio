import { Alert, zAlert } from "../sources/kv.ts";

export const zAlertFromApi = zAlert.extend({
  rules: zAlert.shape.rules.transform((s) =>
    s.map((r) => {
      if (typeof r.value !== "string") return r;
      const [, pattern, flags] = r.value.match(/^\/(.*)\/(\w*)$/) ?? [];
      return {
        key: r.key,
        value: pattern ? new RegExp(pattern, flags || undefined) : r.value,
      };
    }) as Alert["rules"]
  ),
});

export const alertToApi = (alert: Alert) => ({
  ...alert,
  rules: alert.rules.map(({ key, value }) =>
    typeof value !== "string"
      ? { key, value: value.toString() }
      : { key, value }
  ),
});
