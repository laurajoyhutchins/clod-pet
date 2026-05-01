"use strict";

const { cpSync, existsSync, rmSync } = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const rootDir = path.join(__dirname, "..");
const distDir = path.join(rootDir, "dist");

function run(command) {
  execSync(command, { cwd: rootDir, stdio: "inherit" });
}

function copyStaticFiles() {
  const htmlFiles = ["index.html", "chat.html", "control-panel.html", "pet.html"];
  for (const file of htmlFiles) {
    cpSync(path.join(rootDir, file), path.join(distDir, file));
  }

  const assetsDir = path.join(rootDir, "assets");
  if (existsSync(assetsDir)) {
    cpSync(assetsDir, path.join(distDir, "assets"), { recursive: true });
  }
}

function main() {
  rmSync(distDir, { recursive: true, force: true });
  run("tsc -p tsconfig.json");
  run("tsc -p tsconfig.browser.json");
  copyStaticFiles();
}

main();
