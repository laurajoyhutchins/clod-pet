import fs = require("fs");
import path = require("path");

jest.mock("fs", () => ({
  existsSync: jest.fn(),
}));

import { getBackendDir, getPetsDir } from "../../src/main/project-paths";

describe("project-paths", () => {
  const repoRoot = path.resolve(process.cwd(), "..");

  beforeEach(() => {
    (fs.existsSync as jest.Mock).mockImplementation((candidate: string) => {
      return candidate === path.join(repoRoot, "backend") || candidate === path.join(repoRoot, "pets");
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("resolves backend directory from the repository root", () => {
    expect(getBackendDir()).toBe(path.join(repoRoot, "backend"));
  });

  test("resolves pets directory from the repository root", () => {
    expect(getPetsDir()).toBe(path.join(repoRoot, "pets"));
  });

  test("prefers an install root over the repository root when provided", () => {
    const installRoot = path.join(repoRoot, "app", "dist");
    const originalInstallRoot = process.env.CLOD_PET_INSTALL_ROOT;
    process.env.CLOD_PET_INSTALL_ROOT = installRoot;

    (fs.existsSync as jest.Mock).mockImplementation((candidate: string) => {
      return candidate === path.join(installRoot, "backend")
        || candidate === path.join(installRoot, "pets")
        || candidate === path.join(repoRoot, "backend")
        || candidate === path.join(repoRoot, "pets");
    });

    try {
      expect(getBackendDir()).toBe(path.join(installRoot, "backend"));
      expect(getPetsDir()).toBe(path.join(installRoot, "pets"));
    } finally {
      process.env.CLOD_PET_INSTALL_ROOT = originalInstallRoot;
    }
  });
});
