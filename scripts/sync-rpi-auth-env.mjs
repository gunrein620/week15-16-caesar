import fs from "node:fs";
import { spawnSync } from "node:child_process";

const localEnvPath = ".env";
const remoteAppDir = process.env.RPI_APP_DIR || "/home/user/apps/week15-16-caesar";
const remoteNode = process.env.RPI_NODE || "/home/user/.nvm/versions/node/v22.22.3/bin/node";
const port = process.env.PORT || "3400";

const requiredKeys = ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"];
const syncedKeys = ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "AUTH_URL", "NEXTAUTH_URL"];

function parseEnv(contents) {
  const env = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

if (!fs.existsSync(localEnvPath)) {
  throw new Error("Missing local .env");
}

const localEnv = parseEnv(fs.readFileSync(localEnvPath, "utf8"));
const missing = requiredKeys.filter((key) => !localEnv[key]);

if (missing.length) {
  throw new Error(`Missing required local env keys: ${missing.join(", ")}`);
}

const payload = Object.fromEntries(
  syncedKeys.filter((key) => key in localEnv).map((key) => [key, localEnv[key]]),
);

const remoteScript = `(${function syncRpiAuthEnv() {
  const fs = require("fs");
  const { spawn, spawnSync } = require("child_process");

  const appDir = process.env.APP_DIR;
  const nodeBin = process.env.NODE_BIN;
  const port = process.env.PORT || "3400";
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  const envPaths = [appDir + "/.env", appDir + "/.next/standalone/.env"];

  function updateEnvFile(filePath, values) {
    let contents = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
    if (contents && !contents.endsWith("\n")) contents += "\n";

    for (const [key, value] of Object.entries(values)) {
      const line = `${key}=${JSON.stringify(value)}`;
      const pattern = new RegExp(`^${key}=.*$`, "m");
      if (pattern.test(contents)) {
        contents = contents.replace(pattern, line);
      } else {
        contents += line + "\n";
      }
    }

    fs.writeFileSync(filePath, contents, { mode: 0o600 });
  }

  for (const envPath of envPaths) updateEnvFile(envPath, payload);

  const ss = spawnSync("ss", ["-ltnp"], { encoding: "utf8" });
  const match = ss.stdout.match(new RegExp(`:${port}\\s+.*pid=([0-9]+)`));
  if (match) {
    const pid = match[1];
    spawnSync("kill", [pid]);
    for (let i = 0; i < 20; i += 1) {
      const alive = spawnSync("kill", ["-0", pid]);
      if (alive.status !== 0) break;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
    const stillAlive = spawnSync("kill", ["-0", pid]);
    if (stillAlive.status === 0) spawnSync("kill", ["-9", pid]);
  }

  const env = { ...process.env };
  for (const line of fs.readFileSync(`${appDir}/.env`, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }

  env.PORT = env.PORT || port;
  env.HOSTNAME = env.HOSTNAME || "0.0.0.0";

  const out = fs.openSync(`${appDir}/logs/server.log`, "a");
  const child = spawn(nodeBin, ["server.js"], {
    cwd: `${appDir}/.next/standalone`,
    env,
    stdio: ["ignore", out, out],
    detached: true,
  });
  child.unref();
  fs.closeSync(out);

  console.log(`Synced ${Object.keys(payload).join(", ")} and restarted rpi auth server`);
}.toString()})();`;

const result = spawnSync(
  "ssh",
  [
    "rpi",
    `APP_DIR=${remoteAppDir} NODE_BIN=${remoteNode} PORT=${port} ${remoteNode} -e ${JSON.stringify(
      remoteScript,
    )}`,
  ],
  {
    input: JSON.stringify(payload),
    encoding: "utf8",
  },
);

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

process.stdout.write(result.stdout);
