import fs = require("fs");
import path = require("path");

function candidateRepoRoots() {
  return [
    path.resolve(__dirname, "..", ".."),
    path.resolve(__dirname, "..", "..", ".."),
  ];
}

function resolveRepoRoot() {
  for (const root of candidateRepoRoots()) {
    if (fs.existsSync(path.join(root, "backend")) || fs.existsSync(path.join(root, "pets"))) {
      return root;
    }
  }

  return candidateRepoRoots()[0];
}

export function getBackendDir() {
  return path.join(resolveRepoRoot(), "backend");
}

export function getPetsDir() {
  return path.join(resolveRepoRoot(), "pets");
}
