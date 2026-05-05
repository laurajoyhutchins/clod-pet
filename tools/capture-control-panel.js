#!/usr/bin/env node
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const appDir = path.join(repoRoot, "app");
const tempDir = path.join(__dirname, "temp");

function parseArgs(argv) {
  const args = {
    out: path.join(tempDir, "control-panel-live.png"),
    delayMs: 750,
    postResizeDelayMs: 500,
    showAdvanced: false,
    showDiagnostics: false,
    activePets: 0,
    panelStyle: "windows-98",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out" && argv[i + 1]) {
      args.out = argv[++i];
    } else if (arg.startsWith("--out=")) {
      args.out = arg.slice("--out=".length);
    } else if (arg === "--delay" && argv[i + 1]) {
      args.delayMs = parseInt(argv[++i], 10);
    } else if (arg.startsWith("--delay=")) {
      args.delayMs = parseInt(arg.slice("--delay=".length), 10);
    } else if (arg === "--after-resize-delay" && argv[i + 1]) {
      args.postResizeDelayMs = parseInt(argv[++i], 10);
    } else if (arg.startsWith("--after-resize-delay=")) {
      args.postResizeDelayMs = parseInt(arg.slice("--after-resize-delay=".length), 10);
    } else if (arg === "--advanced") {
      args.showAdvanced = true;
    } else if (arg === "--diagnostics") {
      args.showDiagnostics = true;
    } else if (arg === "--active-pets" && argv[i + 1]) {
      args.activePets = parseInt(argv[++i], 10);
    } else if (arg.startsWith("--active-pets=")) {
      args.activePets = parseInt(arg.slice("--active-pets=".length), 10);
    } else if (arg === "--style" && argv[i + 1]) {
      args.panelStyle = argv[++i];
    } else if (arg.startsWith("--style=")) {
      args.panelStyle = arg.slice("--style=".length);
    }
  }

  if (!Number.isFinite(args.delayMs) || args.delayMs < 0) args.delayMs = 750;
  if (!Number.isFinite(args.postResizeDelayMs) || args.postResizeDelayMs < 0) args.postResizeDelayMs = 500;
  if (!Number.isFinite(args.activePets) || args.activePets < 0) args.activePets = 0;

  return args;
}

function resolveElectronLauncher() {
  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/c", path.join(appDir, "node_modules", ".bin", "electron.cmd")],
    };
  }

  return {
    command: path.join(appDir, "node_modules", ".bin", "electron"),
    args: [],
  };
}

if (!process.versions.electron) {
  const args = parseArgs(process.argv.slice(2));
  const launcher = resolveElectronLauncher();
  const env = {
    ...process.env,
    CAPTURE_CONTROL_PANEL_MOCK: JSON.stringify({
      showAdvanced: args.showAdvanced,
      showDiagnostics: args.showDiagnostics,
      activePets: args.activePets,
      panelStyle: args.panelStyle,
    }),
  };

  const result = spawnSync(
    launcher.command,
    [...launcher.args, "--no-sandbox", __filename, ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env,
    },
  );

  process.exit(result.status == null ? 1 : result.status);
}

const { app, BrowserWindow } = require("electron");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolvePanelHtml() {
  const distPath = path.join(appDir, "dist", "control-panel.html");
  if (fs.existsSync(distPath)) return distPath;
  throw new Error("Missing app/dist/control-panel.html. Run `npm run build:ts` in app first.");
}

function resolveOutputPath(out) {
  return path.isAbsolute(out) ? out : path.join(repoRoot, out);
}

function measureScript() {
  return `(() => {
    const panel = document.querySelector(".window");
    const titlebar = document.querySelector(".titlebar");
    const panelScroll = document.querySelector(".panel-scroll");
    const status = document.querySelector(".status");
    if (!panel) return null;
    const bodyStyle = getComputedStyle(document.body);
    const horizontalPadding = parseFloat(bodyStyle.paddingLeft) + parseFloat(bodyStyle.paddingRight);
    const verticalPadding = parseFloat(bodyStyle.paddingTop) + parseFloat(bodyStyle.paddingBottom);
    const panelStyle = getComputedStyle(panel);
    const panelHorizontalChrome =
      parseFloat(panelStyle.borderLeftWidth) +
      parseFloat(panelStyle.borderRightWidth) +
      parseFloat(panelStyle.paddingLeft) +
      parseFloat(panelStyle.paddingRight);
    const panelVerticalChrome =
      parseFloat(panelStyle.borderTopWidth) +
      parseFloat(panelStyle.borderBottomWidth) +
      parseFloat(panelStyle.paddingTop) +
      parseFloat(panelStyle.paddingBottom);
    const panelScrollStyle = panelScroll ? getComputedStyle(panelScroll) : null;
    const statusStyle = status ? getComputedStyle(status) : null;
    const measureScrollContentHeight = (container) => {
      const style = getComputedStyle(container);
      const children = Array.from(container.children);
      const childHeight = children.reduce((total, child) => total + child.getBoundingClientRect().height, 0);
      const gap = parseFloat(style.rowGap || style.gap || "0");
      return (
        parseFloat(style.paddingTop) +
        parseFloat(style.paddingBottom) +
        childHeight +
        Math.max(0, children.length - 1) * (Number.isFinite(gap) ? gap : 0)
      );
    };
    const contentWidth = Math.max(
      titlebar ? titlebar.scrollWidth : 0,
      panelScroll ? panelScroll.scrollWidth : 0,
      status ? status.scrollWidth : 0,
    );
    const contentHeight =
      (titlebar ? titlebar.getBoundingClientRect().height : 0) +
      (panelScrollStyle ? parseFloat(panelScrollStyle.marginTop) : 0) +
      (panelScroll ? measureScrollContentHeight(panelScroll) : 0) +
      (statusStyle ? parseFloat(statusStyle.marginTop) : 0) +
      (status ? status.getBoundingClientRect().height : 0);
    return {
      width: Math.max(320, Math.ceil(contentWidth + panelHorizontalChrome + horizontalPadding)),
      height: Math.max(260, Math.ceil(contentHeight + panelVerticalChrome + verticalPadding)),
      bodyWidth: document.body.scrollWidth,
      bodyHeight: document.body.scrollHeight,
      panelWidth: Math.ceil(contentWidth + panelHorizontalChrome),
      panelHeight: Math.ceil(contentHeight + panelVerticalChrome),
    };
  })();`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outPath = resolveOutputPath(args.out);
  const preloadPath = path.join(__dirname, "capture-control-panel-preload.js");
  const htmlPath = resolvePanelHtml();

  await app.whenReady();

  const win = new BrowserWindow({
    width: 420,
    height: 900,
    show: false,
    frame: false,
    roundedCorners: true,
    hasShadow: true,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await win.loadFile(htmlPath);
  await sleep(args.delayMs);

  const size = await win.webContents.executeJavaScript(measureScript());
  if (size && Number.isFinite(size.width) && Number.isFinite(size.height)) {
    win.setContentSize(size.width, size.height);
    await sleep(args.postResizeDelayMs);
  }

  const image = await win.webContents.capturePage();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, image.toPNG());

  console.log(JSON.stringify({
    outPath,
    contentSize: size ? { width: size.width, height: size.height } : null,
    bodySize: size ? { width: size.bodyWidth, height: size.bodyHeight } : null,
  }, null, 2));

  win.destroy();
  app.quit();
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
  app.quit();
});
