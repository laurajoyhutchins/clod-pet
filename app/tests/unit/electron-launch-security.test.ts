import fs = require("fs");
import path = require("path");

describe("Electron launch security", () => {
  test("ordinary and development startup do not disable the Chromium sandbox", () => {
    const appRoot = path.resolve(__dirname, "../..");
    const launcher = fs.readFileSync(path.join(appRoot, "scripts", "start-electron.js"), "utf8");
    const packageJson = fs.readFileSync(path.join(appRoot, "package.json"), "utf8");

    expect(launcher).not.toContain("--no-sandbox");
    expect(packageJson).not.toContain("--no-sandbox");
  });
});
