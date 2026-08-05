import fs = require("fs/promises");
import os = require("os");
import path = require("path");
import EditorProjectAccess from "../../src/main/editor-project-access";

async function makeProject(name: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `clod-pet-${name}-`));
  const documentPath = path.join(root, "animations.json");
  const spritePath = path.join(root, "spritesheet.png");
  await fs.writeFile(documentPath, "{}\n", "utf8");
  await fs.writeFile(spritePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return { root, documentPath, spritePath };
}

describe("EditorProjectAccess", () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  test("requires an explicit project grant", async () => {
    const project = await makeProject("unapproved");
    cleanup.push(project.root);
    const access = new EditorProjectAccess();

    await expect(access.requireDocument(project.documentPath)).rejects.toThrow("editor project approval required");
  });

  test("approves one selected project and resolves only project-local assets", async () => {
    const project = await makeProject("approved");
    cleanup.push(project.root);
    const access = new EditorProjectAccess();

    const grant = await access.approveSelection(project.root);

    expect(grant.documentPath).toBe(project.documentPath);
    await expect(access.requireDocument(project.documentPath)).resolves.toBe(project.documentPath);
    await expect(access.resolveAsset("spritesheet.png")).resolves.toBe(project.spritePath);
  });

  test.each([
    ["parent traversal", path.join("..", "outside.png")],
    ["Windows absolute path", "C:\\Users\\Example\\outside.png"],
    ["UNC path", "\\\\server\\share\\outside.png"],
    ["POSIX absolute path", "/tmp/outside.png"],
  ])("rejects %s asset references without echoing the path", async (_label, reference) => {
    const project = await makeProject("unsafe-reference");
    cleanup.push(project.root);
    const access = new EditorProjectAccess();
    await access.approveSelection(project.root);

    const error = await access.resolveAsset(reference).catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(/relative|approved project/);
    expect(error.message).not.toContain(project.root);
    expect(error.message).not.toContain(reference);
  });

  test("rejects a linked asset that canonically escapes the project", async () => {
    const project = await makeProject("linked-asset");
    const outside = await makeProject("outside-asset");
    cleanup.push(project.root, outside.root);
    const linkedAsset = path.join(project.root, "linked.png");
    try {
      await fs.symlink(outside.spritePath, linkedAsset, "file");
    } catch (error) {
      return;
    }
    const access = new EditorProjectAccess();
    await access.approveSelection(project.root);

    await expect(access.resolveAsset("linked.png")).rejects.toThrow("editor path is outside approved project");
  });

  test("replacing the active project invalidates the previous project", async () => {
    const first = await makeProject("first");
    const second = await makeProject("second");
    cleanup.push(first.root, second.root);
    const access = new EditorProjectAccess();
    await access.approveSelection(first.documentPath);

    await access.approveSelection(second.documentPath);

    await expect(access.requireDocument(first.documentPath)).rejects.toThrow("editor path is outside approved project");
    await expect(access.requireDocument(second.documentPath)).resolves.toBe(second.documentPath);
  });

  test("clearing the grant rejects stale renderer paths", async () => {
    const project = await makeProject("stale");
    cleanup.push(project.root);
    const access = new EditorProjectAccess();
    await access.approveSelection(project.documentPath);

    access.clear();

    await expect(access.requireDocument(project.documentPath)).rejects.toThrow("editor project approval required");
  });

  test("recent documents can activate only an exact main-process record", async () => {
    const project = await makeProject("recent");
    const other = await makeProject("not-recent");
    cleanup.push(project.root, other.root);
    const access = new EditorProjectAccess();

    await expect(access.approveRecent(other.documentPath, [project.documentPath])).rejects.toThrow("recent editor document is not approved");
    await expect(access.approveRecent(project.documentPath, [project.documentPath])).resolves.toEqual(
      expect.objectContaining({ documentPath: project.documentPath }),
    );
  });

  test("save-as prepares a target without switching authority until activation", async () => {
    const source = await makeProject("save-source");
    const target = await makeProject("save-target");
    cleanup.push(source.root, target.root);
    const access = new EditorProjectAccess();
    await access.approveSelection(source.documentPath);

    const targetGrant = await access.prepareSaveTarget(target.documentPath);

    await expect(access.requireDocument(source.documentPath)).resolves.toBe(source.documentPath);
    await expect(access.requireDocument(target.documentPath)).rejects.toThrow("editor path is outside approved project");

    access.activate(targetGrant);

    await expect(access.requireDocument(source.documentPath)).rejects.toThrow("editor path is outside approved project");
    await expect(access.requireDocument(target.documentPath)).resolves.toBe(target.documentPath);
  });

  test("show-in-folder remains inside the active project", async () => {
    const project = await makeProject("visible");
    const outside = await makeProject("outside-visible");
    cleanup.push(project.root, outside.root);
    const access = new EditorProjectAccess();
    await access.approveSelection(project.documentPath);

    await expect(access.requireVisiblePath(project.documentPath)).resolves.toBe(project.documentPath);
    await expect(access.requireVisiblePath(outside.documentPath)).rejects.toThrow("editor path is outside approved project");
  });
});
