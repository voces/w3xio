import { messageAdmin } from "../../sources/discord.ts";
import { APIError } from "../ErrorCode.ts";
import { Handler } from "../types.ts";

const DEPLOY_SECRET = Deno.env.get("DEPLOY_SECRET");
const REPO_DIR = Deno.env.get("EMOJI_SHEEP_TAG_DIR") ??
  "/home/verit/emoji-sheep-tag";
const SERVICE_NAME = "emojist";

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

  const version = (ctx.body as { version?: string } | undefined)?.version;
  if (!version || typeof version !== "string") {
    throw new APIError("bad_request", "Missing or invalid 'version' field", {
      status: 400,
    });
  }

  // Fetch tags and checkout the version
  const fetch = await run(["git", "fetch", "--tags"], REPO_DIR);
  if (fetch.code !== 0) {
    const msg =
      `Deploy failed: git fetch failed for ${version}\n\`\`\`\n${fetch.stderr}\n\`\`\``;
    messageAdmin(msg);
    throw new APIError("deploy_failed", `git fetch failed: ${fetch.stderr}`, {
      status: 500,
    });
  }

  const checkout = await run(["git", "checkout", version], REPO_DIR);
  if (checkout.code !== 0) {
    const msg =
      `Deploy failed: git checkout ${version} failed\n\`\`\`\n${checkout.stderr}\n\`\`\``;
    messageAdmin(msg);
    throw new APIError(
      "deploy_failed",
      `git checkout failed: ${checkout.stderr}`,
      { status: 500 },
    );
  }

  // Restart the service
  const restart = await run(["sudo", "systemctl", "restart", SERVICE_NAME]);
  if (restart.code !== 0) {
    const msg =
      `Deploy failed: systemctl restart ${SERVICE_NAME} failed for ${version}\n\`\`\`\n${restart.stderr}\n\`\`\``;
    messageAdmin(msg);
    throw new APIError(
      "deploy_failed",
      `systemctl restart failed: ${restart.stderr}`,
      { status: 500 },
    );
  }

  // Poll for the service to become active (or fail)
  let serviceStatus = "";
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const result = await run(["systemctl", "is-active", SERVICE_NAME]);
    serviceStatus = result.stdout.trim();
    if (serviceStatus === "active") break;
    if (serviceStatus === "failed") break;
  }

  if (serviceStatus !== "active") {
    const logs = await run([
      "journalctl",
      "-u",
      SERVICE_NAME,
      "--no-pager",
      "-n",
      "20",
    ]);
    const msg =
      `Deploy of ${version} failed: service not active (${serviceStatus})\n\`\`\`\n${logs.stdout}\n\`\`\``;
    messageAdmin(msg);
    throw new APIError(
      "deploy_failed",
      `Service not active after restart: ${serviceStatus}`,
      { status: 500 },
    );
  }

  messageAdmin(`Deployed emoji-sheep-tag ${version}`);
  return { ok: true, version };
};
