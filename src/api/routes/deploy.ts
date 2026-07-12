import { messageAdmin } from "../../sources/discord.ts";
import { APIError } from "../ErrorCode.ts";
import { Handler } from "../types.ts";

const DEPLOY_SECRET = Deno.env.get("DEPLOY_SECRET");

// Each deployable app co-hosted on this box: where its checkout lives, the
// systemd unit to restart, how to fetch and which ref to move to for a given
// `version`, and an optional build to run before the restart. New apps are added
// here; the POST /deploy contract (token auth + `{ version }` body) is unchanged.
type App = {
  dir: string;
  service: string;
  fetch: string[];
  // The git ref to check out for the requested version.
  target: (version: string) => string;
  // Run in the checkout before the restart (e.g. bundle a client). Optional.
  build?: string[];
};

const APPS: Record<string, App> = {
  "emoji-sheep-tag": {
    dir: Deno.env.get("EMOJI_SHEEP_TAG_DIR") ?? "/home/verit/emoji-sheep-tag",
    service: "emojist",
    // Deploys a tag its release workflow pushed.
    fetch: ["git", "fetch", "--tags"],
    target: (version) => version,
  },
  "blocktol": {
    dir: Deno.env.get("BLOCKTOL_DIR") ?? "/home/verit/blocktol",
    service: "blocktol",
    // Deploys the prod branch tip; `version` is the merged commit SHA. The client
    // bundle is gitignored, so rebuild it before restart.
    fetch: ["git", "fetch", "origin", "prod"],
    target: (version) => version,
    build: ["deno", "task", "build"],
  },
};

const run = async (cmd: string[], cwd?: string) => {
  const proc = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const { code, stdout, stderr } = await proc.output();
  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
};

export const deploy: Handler = async (ctx) => {
  if (!DEPLOY_SECRET) {
    throw new APIError("config_error", "DEPLOY_SECRET not configured", {
      status: 500,
    });
  }

  const auth = ctx.req.headers.get("authorization") ??
    ctx.url.searchParams.get("token");
  if (auth !== DEPLOY_SECRET) {
    throw new APIError("unauthorized", "Invalid deploy token", { status: 401 });
  }

  const payload = ctx.body as { version?: string; app?: string } | undefined;
  const version = payload?.version;
  if (!version || typeof version !== "string") {
    throw new APIError("bad_request", "Missing or invalid 'version' field", {
      status: 400,
    });
  }

  // Default to emoji-sheep-tag so its existing `{ version }`-only webhook keeps
  // working unchanged.
  const appName = payload?.app ?? "emoji-sheep-tag";
  const app = APPS[appName];
  if (!app) {
    throw new APIError("bad_request", `Unknown app '${appName}'`, {
      status: 400,
    });
  }

  // Report a failed stage to the admin channel and return the error to raise.
  const fail = (stage: string, detail: string) => {
    messageAdmin(
      `Deploy failed: ${appName} ${stage} for ${version}\n\`\`\`\n${detail}\n\`\`\``,
    );
    return new APIError("deploy_failed", `${stage}: ${detail}`, {
      status: 500,
    });
  };

  const fetch = await run(app.fetch, app.dir);
  if (fetch.code !== 0) throw fail("git fetch failed", fetch.stderr);

  const checkout = await run(["git", "checkout", app.target(version)], app.dir);
  if (checkout.code !== 0) throw fail("git checkout failed", checkout.stderr);

  if (app.build) {
    const build = await run(app.build, app.dir);
    if (build.code !== 0) throw fail("build failed", build.stderr);
  }

  const restart = await run(["sudo", "systemctl", "restart", app.service]);
  if (restart.code !== 0) {
    throw fail("systemctl restart failed", restart.stderr);
  }

  // Poll for the service to become active (or fail)
  let serviceStatus = "";
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const result = await run(["systemctl", "is-active", app.service]);
    serviceStatus = result.stdout.trim();
    if (serviceStatus === "active") break;
    if (serviceStatus === "failed") break;
  }

  if (serviceStatus !== "active") {
    const logs = await run([
      "journalctl",
      "-u",
      app.service,
      "--no-pager",
      "-n",
      "20",
    ]);
    messageAdmin(
      `Deploy of ${appName} ${version} failed: service not active (${serviceStatus})\n\`\`\`\n${logs.stdout}\n\`\`\``,
    );
    throw new APIError(
      "deploy_failed",
      `Service not active after restart: ${serviceStatus}`,
      { status: 500 },
    );
  }

  messageAdmin(`Deployed ${appName} ${version}`);
  return { ok: true, app: appName, version };
};
