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
});
