import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    rename: vi.fn(actual.rename),
  };
});

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  inspectSkill,
  installSkill,
  type SkillManagerContext,
} from "./manager.js";
import {
  MANIFEST_FILE_NAME,
  computeSkillContentDigest,
  getDigestHex,
} from "./manifest.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(tmpdir(), "dooray-skill-manager-"));
  roots.push(root);
  return root;
}

async function makePackage(
  root: string,
  version: string,
  name = "@bifos/dooray-cli",
): Promise<string> {
  const packageRoot = path.join(root, "pkg", version);
  await fs.mkdir(path.join(packageRoot, "skills", "dooray-cli"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(packageRoot, "package.json"),
    JSON.stringify({ name, version }),
  );
  await fs.writeFile(
    path.join(packageRoot, "skills", "dooray-cli", "SKILL.md"),
    "# dooray-cli\n",
  );
  return packageRoot;
}

async function makeContext(root: string): Promise<SkillManagerContext> {
  const packageRoot = await makePackage(root, "1.2.3");
  return {
    homeDir: path.join(root, "home"),
    dataRoot: path.join(root, "data"),
    packageRoot,
    currentVersion: "1.2.3",
  };
}

async function destinationOf(context: SkillManagerContext): Promise<string> {
  return path.join(context.homeDir, ".claude", "skills", "dooray-cli");
}

async function ensureDestinationParent(
  context: SkillManagerContext,
): Promise<string> {
  const destination = await destinationOf(context);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  return destination;
}

async function expectedStorePath(context: SkillManagerContext): Promise<string> {
  const digest = await computeSkillContentDigest(
    path.join(context.packageRoot, "skills", "dooray-cli"),
  );
  return path.join(
    context.dataRoot ?? context.homeDir,
    "skills",
    `${context.currentVersion}-${getDigestHex(digest)}`,
  );
}

describe("inspectSkill", () => {
  it("reports missing destination as managed missing", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);

    await expect(inspectSkill(context)).resolves.toMatchObject({
      status: "missing",
      managed: true,
      installedVersion: null,
      linkTarget: null,
    });
  });

  it("reports a direct link to the current package skill as outdated", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);
    const destination = await ensureDestinationParent(context);
    const source = path.join(context.packageRoot, "skills", "dooray-cli");
    await fs.symlink(source, destination);

    await expect(inspectSkill(context)).resolves.toMatchObject({
      status: "outdated",
      managed: true,
      installedVersion: "1.2.3",
      linkTarget: source,
    });
  });

  it("reports another @bifos/dooray-cli package link as outdated", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);
    const previousPackageRoot = await makePackage(root, "1.0.0");
    const destination = await ensureDestinationParent(context);
    await fs.symlink(
      path.join(previousPackageRoot, "skills", "dooray-cli"),
      destination,
    );

    await expect(inspectSkill(context)).resolves.toMatchObject({
      status: "outdated",
      managed: true,
      installedVersion: "1.0.0",
    });
  });

  it("reports a broken @bifos/dooray-cli package skill link as managed broken", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);
    const destination = await ensureDestinationParent(context);
    const target = path.join(
      root,
      "missing",
      "node_modules",
      "@bifos",
      "dooray-cli",
      "skills",
      "dooray-cli",
    );
    await fs.symlink(target, destination);

    await expect(inspectSkill(context)).resolves.toMatchObject({
      status: "broken",
      managed: true,
      linkTarget: target,
    });
  });

  it("reports an unknown broken link as unmanaged broken", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);
    const destination = await ensureDestinationParent(context);
    const target = path.join(root, "missing", "someone-else");
    await fs.symlink(target, destination);

    await expect(inspectSkill(context)).resolves.toMatchObject({
      status: "broken",
      managed: false,
      linkTarget: target,
    });
  });

  it("reports regular files and directories as unmanaged", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);
    const fileDestination = await ensureDestinationParent(context);
    await fs.writeFile(fileDestination, "local edit\n");

    await expect(inspectSkill(context)).resolves.toMatchObject({
      status: "unmanaged",
      managed: false,
    });

    const directoryContext = await makeContext(path.join(root, "dir-case"));
    const directoryDestination = await ensureDestinationParent(directoryContext);
    await fs.mkdir(directoryDestination);

    await expect(inspectSkill(directoryContext)).resolves.toMatchObject({
      status: "unmanaged",
      managed: false,
    });
  });

  it("reports a normal link outside the package as unmanaged", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);
    const destination = await ensureDestinationParent(context);
    const target = path.join(root, "external-skill");
    await fs.mkdir(target);
    await fs.symlink(target, destination);

    await expect(inspectSkill(context)).resolves.toMatchObject({
      status: "unmanaged",
      managed: false,
      linkTarget: target,
    });
  });

  it("reports a package-shaped link with invalid metadata as unmanaged", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);
    const destination = await ensureDestinationParent(context);
    const packageRoot = path.join(
      root,
      "node_modules",
      "@bifos",
      "dooray-cli",
    );
    const target = path.join(packageRoot, "skills", "dooray-cli");
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(packageRoot, "package.json"), "{}");
    await fs.symlink(target, destination);

    await expect(inspectSkill(context)).resolves.toMatchObject({
      status: "unmanaged",
      managed: false,
      linkTarget: target,
    });
  });
});

describe("installSkill", () => {
  it("installs a missing destination with an atomic replacement link", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);

    const result = await installSkill(context);
    const destination = await destinationOf(context);
    const linkTarget = await fs.readlink(destination);

    expect(result).toMatchObject({
      changed: true,
      backupPath: null,
      previous: { status: "missing" },
      current: { status: "current" },
    });
    expect(linkTarget).toContain(path.join(root, "data", "skills"));
  });

  it("uses homeDir/.local/share/dooray-cli when dataRoot is omitted", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);
    delete context.dataRoot;

    await installSkill(context);

    await expect(fs.readlink(await destinationOf(context))).resolves.toContain(
      path.join(root, "home", ".local", "share", "dooray-cli", "skills"),
    );
  });

  it("does not change an already current managed store link", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);
    await installSkill(context);
    const destination = await destinationOf(context);
    const previousTarget = await fs.readlink(destination);

    const result = await installSkill(context);

    expect(result).toMatchObject({
      changed: false,
      backupPath: null,
      previous: { status: "current" },
      current: { status: "current" },
    });
    await expect(fs.readlink(destination)).resolves.toBe(previousTarget);
  });

  it("reuses the same canonical store for the same version and digest", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);

    await installSkill(context);
    const storePath = await expectedStorePath(context);
    const before = await fs.stat(storePath);
    await installSkill(context);
    const after = await fs.stat(storePath);

    expect(after.ino).toBe(before.ino);
    await expect(fs.readlink(await destinationOf(context))).resolves.toBe(
      storePath,
    );
  });

  it("writes manifest after staging copy and classifies invalid store manifest as corrupt", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);

    await installSkill(context);
    const storePath = await expectedStorePath(context);
    const manifestPath = path.join(storePath, MANIFEST_FILE_NAME);

    await expect(fs.readFile(manifestPath, "utf8")).resolves.toMatch(
      /"contentDigest"/,
    );
    await expect(inspectSkill(context)).resolves.toMatchObject({
      status: "current",
      managed: true,
    });

    await fs.writeFile(manifestPath, "{");
    await expect(inspectSkill(context)).resolves.toMatchObject({
      status: "corrupt",
      managed: true,
    });

    await fs.writeFile(manifestPath, JSON.stringify({ schemaVersion: 1 }));
    await expect(inspectSkill(context)).resolves.toMatchObject({
      status: "corrupt",
      managed: true,
    });

    await fs.writeFile(
      manifestPath,
      JSON.stringify({ contentDigest: "sha256:NO" }),
    );
    await expect(inspectSkill(context)).resolves.toMatchObject({
      status: "corrupt",
      managed: true,
    });

    await fs.writeFile(
      manifestPath,
      JSON.stringify({
        schemaVersion: 1,
        skillName: "dooray-cli",
        packageName: "@bifos/dooray-cli",
        packageVersion: "1.2.3",
        contentDigest: await computeSkillContentDigest(storePath),
        installedAt: "2026-07-23",
        managedBy: "@bifos/dooray-cli",
      }),
    );
    await expect(inspectSkill(context)).resolves.toMatchObject({
      status: "corrupt",
      managed: true,
    });

    await fs.writeFile(
      manifestPath,
      JSON.stringify({
        schemaVersion: 1,
        skillName: "dooray-cli",
        packageName: "@bifos/dooray-cli",
        packageVersion: "1.2.3",
        contentDigest: await computeSkillContentDigest(storePath),
        installedAt: "2026-99-99T00:00:00.000Z",
        managedBy: "@bifos/dooray-cli",
      }),
    );
    await expect(inspectSkill(context)).resolves.toMatchObject({
      status: "corrupt",
      managed: true,
    });
  });

  it("repairs a missing managed-store target without force", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);

    await installSkill(context);
    const destination = await destinationOf(context);
    const storePath = await expectedStorePath(context);
    await fs.rm(storePath, { recursive: true, force: true });

    await expect(inspectSkill(context)).resolves.toMatchObject({
      status: "broken",
      managed: true,
    });
    await expect(installSkill(context)).resolves.toMatchObject({
      previous: { status: "broken", managed: true },
      current: { status: "current" },
    });
    await expect(fs.readlink(destination)).resolves.toBe(storePath);
  });

  it("preserves active link when canonical store collision is modified", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);
    const previousPackageRoot = await makePackage(root, "1.0.0");
    const destination = await ensureDestinationParent(context);
    const previousTarget = path.join(
      previousPackageRoot,
      "skills",
      "dooray-cli",
    );
    await fs.symlink(previousTarget, destination);

    await installSkill(context);
    const storePath = await expectedStorePath(context);
    await fs.writeFile(path.join(storePath, "SKILL.md"), "modified\n");
    await fs.rm(destination, { force: true });
    await fs.symlink(previousTarget, destination);

    await expect(installSkill(context)).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
    } satisfies Partial<DoorayCliError>);
    await expect(fs.readlink(destination)).resolves.toBe(previousTarget);
  });

  it("quarantines a modified canonical store with force", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);

    await installSkill(context);
    const storePath = await expectedStorePath(context);
    await fs.writeFile(path.join(storePath, "SKILL.md"), "modified\n");

    await expect(installSkill(context, { force: true })).resolves.toMatchObject({
      current: { status: "current" },
    });

    const backups = (await fs.readdir(path.join(context.dataRoot ?? "", "skills")))
      .filter((entry) => entry.startsWith(".backup-"));
    expect(backups).toHaveLength(1);
    await expect(fs.readFile(path.join(storePath, "SKILL.md"), "utf8"))
      .resolves.toBe("# dooray-cli\n");
  });

  it("refuses a modified active managed store unless force is set", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);

    await installSkill(context);
    const destination = await destinationOf(context);
    const storePath = await expectedStorePath(context);
    await fs.writeFile(path.join(storePath, "SKILL.md"), "modified\n");

    await expect(inspectSkill(context)).resolves.toMatchObject({
      status: "modified",
      managed: true,
    });
    await expect(installSkill(context)).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
    } satisfies Partial<DoorayCliError>);
    await expect(fs.readlink(destination)).resolves.toBe(storePath);
  });

  it("refuses a corrupt active managed store unless force is set", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);

    await installSkill(context);
    const destination = await destinationOf(context);
    const storePath = await expectedStorePath(context);
    await fs.writeFile(path.join(storePath, MANIFEST_FILE_NAME), "{");

    await expect(inspectSkill(context)).resolves.toMatchObject({
      status: "corrupt",
      managed: true,
    });
    await expect(installSkill(context)).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
    } satisfies Partial<DoorayCliError>);
    await expect(fs.readlink(destination)).resolves.toBe(storePath);
  });

  it("recovers a corrupt active managed store with force", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);

    await installSkill(context);
    const storePath = await expectedStorePath(context);
    await fs.writeFile(path.join(storePath, MANIFEST_FILE_NAME), "{");

    await expect(installSkill(context, { force: true })).resolves.toMatchObject({
      previous: { status: "corrupt", managed: true },
      current: { status: "current", managed: true },
    });
    await expect(inspectSkill(context)).resolves.toMatchObject({
      status: "current",
      managed: true,
    });
  });

  it("restores quarantined store when force replacement fails", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);

    await installSkill(context);
    const destination = await destinationOf(context);
    const activeTarget = await fs.readlink(destination);
    const storePath = await expectedStorePath(context);
    await fs.writeFile(path.join(storePath, "SKILL.md"), "modified\n");

    const actualFs =
      await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises",
      );
    vi.mocked(fs.rename)
      .mockImplementationOnce(actualFs.rename)
      .mockRejectedValueOnce(new Error("store rename failed"))
      .mockImplementationOnce(actualFs.rename);

    await expect(installSkill(context, { force: true })).rejects.toThrow(
      "store rename failed",
    );
    await expect(fs.readlink(destination)).resolves.toBe(activeTarget);
    await expect(fs.readFile(path.join(storePath, "SKILL.md"), "utf8"))
      .resolves.toBe("modified\n");
  });

  it("updates managed outdated and broken links without deleting user files", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);
    const previousPackageRoot = await makePackage(root, "1.0.0");
    const destination = await ensureDestinationParent(context);
    await fs.symlink(
      path.join(previousPackageRoot, "skills", "dooray-cli"),
      destination,
    );

    await expect(installSkill(context)).resolves.toMatchObject({
      changed: true,
      previous: { status: "outdated" },
      current: { status: "current" },
      backupPath: null,
    });

    await fs.rm(destination, { force: true });
    await fs.symlink(
      path.join(
        root,
        "missing",
        "node_modules",
        "@bifos",
        "dooray-cli",
        "skills",
        "dooray-cli",
      ),
      destination,
    );

    await expect(installSkill(context)).resolves.toMatchObject({
      changed: true,
      previous: { status: "broken", managed: true },
      current: { status: "current" },
      backupPath: null,
    });
  });

  it("refuses package-shaped links with invalid metadata unless force is set", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);
    const destination = await ensureDestinationParent(context);
    const packageRoot = path.join(
      root,
      "node_modules",
      "@bifos",
      "dooray-cli",
    );
    const target = path.join(packageRoot, "skills", "dooray-cli");
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(packageRoot, "package.json"), "{}");
    await fs.symlink(target, destination);

    await expect(installSkill(context)).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
    } satisfies Partial<DoorayCliError>);
    await expect(fs.readlink(destination)).resolves.toBe(target);

    await expect(installSkill(context, { force: true })).resolves.toMatchObject({
      changed: true,
      previous: { status: "unmanaged", managed: false },
      current: { status: "current" },
      backupPath: expect.stringContaining(".backup-"),
    });
  });

  it("keeps the active link in dataRoot store through source changes and updates", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);
    const sourceSkill = path.join(context.packageRoot, "skills", "dooray-cli");

    const installResult = await installSkill(context);
    const destination = await destinationOf(context);
    const firstStorePath = await fs.readlink(destination);

    expect(installResult).toMatchObject({
      previous: { status: "missing" },
      current: { status: "current", managed: true },
    });
    expect(firstStorePath).toContain(path.join(root, "data", "skills"));
    await expect(inspectSkill(context)).resolves.toMatchObject({
      status: "current",
      managed: true,
    });

    await fs.writeFile(
      path.join(sourceSkill, "SKILL.md"),
      "# dooray-cli\nupdated\n",
    );

    await expect(inspectSkill(context)).resolves.toMatchObject({
      status: "outdated",
      managed: true,
    });

    const updateResult = await installSkill(context);
    const secondStorePath = await fs.readlink(destination);

    expect(updateResult).toMatchObject({
      previous: { status: "outdated", managed: true },
      current: { status: "current", managed: true },
      backupPath: null,
    });
    expect(secondStorePath).toContain(path.join(root, "data", "skills"));
    expect(secondStorePath).not.toBe(firstStorePath);
    await expect(fs.readFile(path.join(secondStorePath, "SKILL.md"), "utf8"))
      .resolves.toBe("# dooray-cli\nupdated\n");
  });

  it("fails before touching an existing managed link when package source is missing", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);
    const previousPackageRoot = await makePackage(root, "1.0.0");
    const destination = await ensureDestinationParent(context);
    const previousTarget = path.join(
      previousPackageRoot,
      "skills",
      "dooray-cli",
    );
    await fs.symlink(previousTarget, destination);
    await fs.rm(path.join(context.packageRoot, "skills", "dooray-cli"), {
      recursive: true,
      force: true,
    });

    let caughtError: unknown;
    try {
      await installSkill(context);
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toMatchObject({
      name: "DoorayCliError",
      exitCode: 1,
    } satisfies Partial<DoorayCliError>);
    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).message).toMatch(/ENOENT/);

    await expect(fs.readlink(destination)).resolves.toBe(previousTarget);
  });

  it("refuses unmanaged entries unless force is set", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);
    const destination = await ensureDestinationParent(context);
    await fs.writeFile(destination, "local edit\n");

    await expect(installSkill(context)).rejects.toMatchObject({
      name: "DoorayCliError",
      exitCode: EXIT_PARAM_ERROR,
    } satisfies Partial<DoorayCliError>);
  });

  it("backs up unmanaged entries when force is set", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);
    const destination = await ensureDestinationParent(context);
    await fs.writeFile(destination, "local edit\n");

    const result = await installSkill(context, { force: true });

    expect(result.backupPath).toMatch(/\.backup-/);
    expect(result).toMatchObject({
      changed: true,
      previous: { status: "unmanaged", managed: false },
      current: { status: "current", managed: true },
    });
    await expect(fs.readFile(result.backupPath ?? "", "utf8")).resolves.toBe(
      "local edit\n",
    );
  });

  it("restores a force backup when active link replacement fails", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);
    const destination = await ensureDestinationParent(context);
    await fs.writeFile(destination, "local edit\n");

    const actualFs =
      await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises",
      );

    vi.mocked(fs.rename)
      .mockImplementationOnce(actualFs.rename)
      .mockImplementationOnce(actualFs.rename)
      .mockRejectedValueOnce(new Error("rename failed"))
      .mockImplementationOnce(actualFs.rename);

    await expect(installSkill(context, { force: true })).rejects.toThrow(
      "rename failed",
    );

    await expect(fs.readFile(destination, "utf8")).resolves.toBe("local edit\n");
    await expect(inspectSkill(context)).resolves.toMatchObject({
      status: "unmanaged",
      managed: false,
    });
  });
});
