"use strict";

const { cpSync, existsSync, mkdirSync, rmSync } = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const rootDir = path.join(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const repoRoot = path.join(rootDir, "..");

function run(command) {
  execSync(command, { cwd: rootDir, stdio: "inherit" });
}

function copyIfExists(source, destination) {
  if (!existsSync(source)) return;
  mkdirSync(path.dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true });
}

function copyStaticFiles() {
  const htmlFiles = ["index.html", "chat.html", "control-panel.html", "pet.html", "editor.html"];
  for (const file of htmlFiles) {
    cpSync(path.join(rootDir, "public", file), path.join(distDir, file));
  }

  const cssFiles = ["control-panel-windows.css", "control-panel-mac.css", "editor.css"];
  for (const file of cssFiles) {
    cpSync(path.join(rootDir, "public", file), path.join(distDir, file));
  }

  const assetsDir = path.join(rootDir, "assets");
  if (existsSync(assetsDir)) {
    cpSync(assetsDir, path.join(distDir, "assets"), { recursive: true });
  }

  copyIfExists(path.join(repoRoot, "backend", "bin"), path.join(distDir, "backend", "bin"));
  copyIfExists(path.join(repoRoot, "pets"), path.join(distDir, "pets"));
}

function main() {
  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });
  run("tsc -p tsconfig.json");
  run("tsc -p tsconfig.editor.json");
  run("tsc -p tsconfig.browser.json");
  copyStaticFiles();
}

main();
