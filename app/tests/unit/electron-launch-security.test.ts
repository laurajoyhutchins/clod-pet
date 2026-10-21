import fs = require("fs");
import path = require("path");

function readAppSource(relativePath: string) {
  const appRoot = path.resolve(__dirname, "../..");
  return fs.readFileSync(path.join(appRoot, relativePath), "utf8");
}

describe("Electron launch security", () => {
  test("ordinary and development startup do not disable the Chromium sandbox", () => {
    const launcher = readAppSource(path.join("scripts", "start-electron.js"));
    const packageJson = readAppSource("package.json");

    expect(launcher).not.toContain("--no-sandbox");
    expect(packageJson).not.toContain("--no-sandbox");
  });

  test.each([
    "src/main/main.ts",
    "src/main/window-manager.ts",
    "src/main/chat-manager.ts",
    "src/main/editor-window.ts",
  ])("%s uses the shared local-window security policy", (sourcePath) => {
    const source = readAppSource(sourcePath);

    expect(source).toContain("localWindowWebPreferences");
    expect(source).toContain("hardenLocalWindow");
  });

  test("the preload bridge does not expose renderer-controlled editor launch paths", () => {
    const preload = readAppSource("src/preload/preload.ts");
    const editorMain = readAppSource("src/main/editor-window.ts");

    expect(preload).not.toContain("show: (initialPath?: string)");
    expect(editorMain).not.toContain('ipcMain.handle("editor:show"');
  });

  test("control-panel mutations require the exact control-panel renderer", () => {
    const main = readAppSource("src/main/main.ts");
    const authorizationChecks = main.match(/assertControlPanelSender\(event\);/g) || [];

    expect(main).toContain("function assertControlPanelSender");
    expect(authorizationChecks).toHaveLength(14);
  });

  test("diagnostic events require an application-owned renderer", () => {
    const main = readAppSource("src/main/main.ts");
    const authorizationChecks = main.match(/assertAppRendererSender\(event\);/g) || [];

    expect(main).toContain("function assertAppRendererSender");
    expect(authorizationChecks).toHaveLength(2);
  });

  test("chat streaming requires the exact chat window renderer", () => {
    const main = readAppSource("src/main/main.ts");
    const chatManager = readAppSource("src/main/chat-manager.ts");

    expect(chatManager).toContain("ownsSender(sender: WebContents)");
    expect(main).toContain("if (!chatManager?.ownsSender(event.sender)) return;");
  });
});
