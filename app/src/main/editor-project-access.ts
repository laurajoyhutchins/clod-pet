import fs = require("fs");
import fsp = require("fs/promises");
import path = require("path");

export interface EditorProjectGrant {
  root: string;
  documentPath: string;
}

const ERROR_APPROVAL_REQUIRED = "editor project approval required";
const ERROR_OUTSIDE_PROJECT = "editor path is outside approved project";
const ERROR_RECENT_NOT_APPROVED = "recent editor document is not approved";
const ERROR_PATH_UNAVAILABLE = "editor path is not available";
const ERROR_ASSET_RELATIVE = "editor asset path must be relative to the approved project";
const ERROR_ASSET_UNAVAILABLE = "editor asset is not available";

function comparisonPath(value: string) {
  const normalized = path.normalize(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function samePath(left: string, right: string) {
  return comparisonPath(left) === comparisonPath(right);
}

function pathWithin(candidate: string, root: string) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function isPortableAbsolute(value: string) {
  return path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value);
}

function hasParentTraversal(value: string) {
  return value.split(/[\\/]+/).some((part) => part === "..");
}

function requireInputPath(value: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(ERROR_PATH_UNAVAILABLE);
  }
  return path.resolve(value);
}

async function canonicalExistingDirectory(directoryPath: string) {
  try {
    const canonical = await fsp.realpath(directoryPath);
    const stat = await fsp.stat(canonical);
    if (!stat.isDirectory()) throw new Error(ERROR_PATH_UNAVAILABLE);
    return canonical;
  } catch {
    throw new Error(ERROR_PATH_UNAVAILABLE);
  }
}

async function canonicalPotentialPath(filePath: string) {
  try {
    return await fsp.realpath(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") {
      throw new Error(ERROR_PATH_UNAVAILABLE);
    }
    const parent = await canonicalExistingDirectory(path.dirname(filePath));
    return path.join(parent, path.basename(filePath));
  }
}

async function documentCandidate(inputPath: string) {
  const absolute = requireInputPath(inputPath);
  const stat = await fsp.stat(absolute).catch(() => null);
  if (stat?.isDirectory()) {
    return path.join(absolute, "animations.json");
  }
  if (path.extname(absolute).toLowerCase() === ".json") {
    return absolute;
  }
  return path.join(path.dirname(absolute), "animations.json");
}

export default class EditorProjectAccess {
  private grant: EditorProjectGrant | null = null;

  current(): EditorProjectGrant | null {
    return this.grant ? { ...this.grant } : null;
  }

  clear() {
    this.grant = null;
  }

  activate(grant: EditorProjectGrant) {
    this.grant = { root: grant.root, documentPath: grant.documentPath };
  }

  async approveSelection(inputPath: string): Promise<EditorProjectGrant> {
    const candidate = await documentCandidate(inputPath);
    const root = await canonicalExistingDirectory(path.dirname(candidate));
    const documentPath = await canonicalPotentialPath(candidate);
    this.assertWithin(documentPath, root);
    const grant = { root, documentPath };
    this.activate(grant);
    return { ...grant };
  }

  async approveRecent(inputPath: string, allowedPaths: string[]): Promise<EditorProjectGrant> {
    const requested = requireInputPath(inputPath);
    const approved = allowedPaths.some((allowedPath) => samePath(path.resolve(allowedPath), requested));
    if (!approved) {
      throw new Error(ERROR_RECENT_NOT_APPROVED);
    }
    return this.approveSelection(requested);
  }

  async prepareSaveTarget(inputPath: string): Promise<EditorProjectGrant> {
    const absolute = requireInputPath(inputPath);
    if (path.extname(absolute).toLowerCase() !== ".json") {
      throw new Error(ERROR_PATH_UNAVAILABLE);
    }
    const root = await canonicalExistingDirectory(path.dirname(absolute));
    const documentPath = await canonicalPotentialPath(absolute);
    this.assertWithin(documentPath, root);
    return { root, documentPath };
  }

  async requireDocument(inputPath: string): Promise<string> {
    const grant = this.requireGrant();
    const candidate = await documentCandidate(inputPath);
    const resolved = await canonicalPotentialPath(candidate);
    this.assertWithin(resolved, grant.root);
    if (!samePath(resolved, grant.documentPath)) {
      throw new Error(ERROR_OUTSIDE_PROJECT);
    }
    return resolved;
  }

  isCurrentDocument(inputPath: string) {
    if (!this.grant || typeof inputPath !== "string" || inputPath.trim() === "") return false;
    return samePath(path.resolve(inputPath), this.grant.documentPath);
  }

  async resolveAsset(reference: string, grant: EditorProjectGrant = this.requireGrant()): Promise<string> {
    if (typeof reference !== "string" || reference.trim() === "" || isPortableAbsolute(reference) || hasParentTraversal(reference)) {
      throw new Error(ERROR_ASSET_RELATIVE);
    }

    const candidate = path.resolve(grant.root, reference);
    this.assertWithin(candidate, grant.root);
    try {
      const canonical = await fsp.realpath(candidate);
      this.assertWithin(canonical, grant.root);
      const stat = await fsp.stat(canonical);
      if (!stat.isFile()) throw new Error(ERROR_ASSET_UNAVAILABLE);
      return canonical;
    } catch (error) {
      if (error instanceof Error && error.message === ERROR_OUTSIDE_PROJECT) throw error;
      throw new Error(ERROR_ASSET_UNAVAILABLE);
    }
  }

  async requireVisiblePath(inputPath: string): Promise<string> {
    const grant = this.requireGrant();
    const absolute = requireInputPath(inputPath);
    try {
      const canonical = await fsp.realpath(absolute);
      this.assertWithin(canonical, grant.root);
      return canonical;
    } catch (error) {
      if (error instanceof Error && error.message === ERROR_OUTSIDE_PROJECT) throw error;
      throw new Error(ERROR_PATH_UNAVAILABLE);
    }
  }

  async requireWritablePath(targetPath: string, grant: EditorProjectGrant = this.requireGrant()): Promise<string> {
    const absolute = requireInputPath(targetPath);
    this.assertWithin(absolute, grant.root);
    const canonical = await canonicalPotentialPath(absolute);
    this.assertWithin(canonical, grant.root);
    return canonical;
  }

  private requireGrant() {
    if (!this.grant) {
      throw new Error(ERROR_APPROVAL_REQUIRED);
    }
    return this.grant;
  }

  private assertWithin(candidate: string, root: string) {
    if (!pathWithin(comparisonPath(candidate), comparisonPath(root))) {
      throw new Error(ERROR_OUTSIDE_PROJECT);
    }
  }
}
