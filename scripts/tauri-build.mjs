import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const env = { ...process.env };
const localSigningKey = join(homedir(), ".tauri", "tflix-updater.key");

if (!env.TAURI_SIGNING_PRIVATE_KEY && existsSync(localSigningKey)) {
  env.TAURI_SIGNING_PRIVATE_KEY = localSigningKey;
}

const result = spawnSync(
  process.platform === "win32" ? "tauri.cmd" : "tauri",
  ["build", ...process.argv.slice(2)],
  {
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

if (result.error) {
  console.error(`Failed to start Tauri build: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
