import fs = require("fs");
import path = require("path");

function uniquePaths(paths: Array<string | undefined | null>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of paths) {
    if (!candidate) continue;
    const normalized = path.resolve(candidate);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function candidateRoots() {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  return uniquePaths([
    process.env.CLOD_PET_INSTALL_ROOT,
    process.env.CLOD_PET_APP_ROOT,
    resourcesPath,
    resourcesPath ? path.join(resourcesPath, "app.asar.unpacked") : undefined,
    path.resolve(__dirname, "..", ".."),
    path.resolve(__dirname, "..", "..", ".."),
    process.cwd(),
    path.resolve(__dirname, "..", "..", "..", ".."),
    path.dirname(process.execPath),
  ]);
}

function resolveAssetDir(assetName: string) {
  const roots = candidateRoots();
  for (const root of roots) {
    const direct = path.join(root, assetName);
    if (fs.existsSync(direct)) return direct;

    const resourcesVariant = path.join(root, "resources", assetName);
    if (fs.existsSync(resourcesVariant)) return resourcesVariant;
  }

  return path.join(roots[0] || process.cwd(), assetName);
}

export function getBackendDir() {
  return resolveAssetDir("backend");
}

export function getPetsDir() {
  const envPetsDir = process.env.PETS_DIR;
  if (envPetsDir) {
    const resolved = path.resolve(envPetsDir);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }
  return resolveAssetDir("pets");
}
