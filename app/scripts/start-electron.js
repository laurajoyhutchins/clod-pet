#!/usr/bin/env node

const { spawn } = require("child_process");
const electronPath = require("electron");

const env = { ...process.env };
const args = ["--no-sandbox"];

if (process.platform === "linux" && env.XDG_SESSION_TYPE === "wayland" && env.CLOD_PET_ALLOW_WAYLAND !== "1") {
  env.ELECTRON_OZONE_PLATFORM_HINT = "x11";
  args.push("--ozone-platform=x11");
}

args.push(".");
args.push(...process.argv.slice(2));

const child = spawn(electronPath, args, {
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (err) => {
  console.error(err);
  process.exit(1);
});
