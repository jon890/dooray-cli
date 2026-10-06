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
  vi.useRealTimers();
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

describe("Claude Code and Codex installation", () => {
  function codexDestination(context: SkillManagerContext): string {
    return path.join(context.homeDir, ".agents", "skills", "dooray-cli");
  }

  async function failCodexActivation(context: SkillManagerContext): Promise<void> {
    const actualFs = await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    );
    vi.mocked(fs.rename).mockImplementation(async (from, to) => {
      if (to === codexDestination(context) && String(from).includes(".tmp-")) {
        throw new Error("Codex activation failed");
      }
      return actualFs.rename(from, to);
    });
  }

  it("installs both agents with references in the same managed store", async () => {
    const context = await makeContext(await makeRoot());
    const source = path.join(context.packageRoot, "skills", "dooray-cli");
    await fs.mkdir(path.join(source, "references"));
    await fs.writeFile(path.join(source, "references", "common.md"), "usage\n");

    const result = await installSkill(context);
    const claude = await fs.readlink(await destinationOf(context));
    const codex = await fs.readlink(codexDestination(context));

    expect(codex).toBe(claude);
    await expect(fs.readFile(path.join(codex, "references", "common.md"), "utf8"))
      .resolves.toBe("usage\n");
    expect(result.current).toMatchObject({
      status: "current",
      agents: {
        claude: { status: "current", destination: await destinationOf(context) },
        codex: { status: "current", destination: codexDestination(context) },
      },
    });
    expect(result.backupPaths).toEqual({});
  });

  it("adds Codex to an existing Claude-only installation without rewriting Claude", async () => {
    const context = await makeContext(await makeRoot());
    await installSkill(context);
    await fs.rm(codexDestination(context));
    const before = await fs.lstat(await destinationOf(context));

    await expect(inspectSkill(context)).resolves.toMatchObject({
      status: "missing",
      agents: { claude: { status: "current" }, codex: { status: "missing" } },
    });
    const result = await installSkill(context);

    expect(result.changed).toBe(true);
    expect(result.current.status).toBe("current");
    expect((await fs.lstat(await destinationOf(context))).ino).toBe(before.ino);
    await expect(fs.readlink(codexDestination(context))).resolves.toBe(
      await fs.readlink(await destinationOf(context)),
    );
  });

  it("adds Claude to an existing Codex-only installation", async () => {
    const context = await makeContext(await makeRoot());
    await installSkill(context);
    await fs.rm(await destinationOf(context));

    await expect(installSkill(context)).resolves.toMatchObject({
      current: { status: "current" },
      changed: true,
    });
    await expect(fs.readlink(await destinationOf(context))).resolves.toBe(
      await fs.readlink(codexDestination(context)),
    );
  });

  it("updates both links after the CLI version and skill content change", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);
    await installSkill(context);
    const oldStore = await fs.readlink(codexDestination(context));
    const next = {
      ...context,
      currentVersion: "2.0.0",
      packageRoot: await makePackage(root, "2.0.0"),
    };
    await fs.writeFile(
      path.join(next.packageRoot, "skills", "dooray-cli", "SKILL.md"),
      "updated skill\n",
    );

    const result = await installSkill(next);
    const newStore = await fs.readlink(codexDestination(next));

    expect(result.previous.agents.codex.status).toBe("outdated");
    expect(result.current.agents.codex.installedVersion).toBe("2.0.0");
    expect(newStore).not.toBe(oldStore);
    await expect(fs.readlink(await destinationOf(next))).resolves.toBe(newStore);
    await expect(fs.readFile(path.join(newStore, "SKILL.md"), "utf8"))
      .resolves.toBe("updated skill\n");
    await expect(fs.readFile(path.join(oldStore, "SKILL.md"), "utf8"))
      .resolves.toBe("# dooray-cli\n");
  });

  it("recognizes an indirect Codex link to Claude and updates it without force", async () => {
    const context = await makeContext(await makeRoot());
    await installSkill(context);
    const codex = codexDestination(context);
    await fs.rm(codex);
    await fs.symlink(await destinationOf(context), codex);

    await expect(inspectSkill(context)).resolves.toMatchObject({
      status: "current",
      agents: { codex: { status: "current", managed: true } },
    });
    await fs.writeFile(
      path.join(context.packageRoot, "skills", "dooray-cli", "SKILL.md"),
      "updated skill\n",
    );
    await installSkill(context);
    await expect(fs.readlink(codex)).resolves.toBe(
      await fs.readlink(await destinationOf(context)),
    );
  });

  it("repairs a broken Codex link while preserving the current Claude link", async () => {
    const context = await makeContext(await makeRoot());
    await installSkill(context);
    const codex = codexDestination(context);
    await fs.rm(codex);
    await fs.symlink(path.join(context.dataRoot!, "skills", "missing"), codex);

    await expect(inspectSkill(context)).resolves.toMatchObject({
      status: "broken",
      agents: { claude: { status: "current" }, codex: { status: "broken" } },
    });
    await expect(installSkill(context)).resolves.toMatchObject({
      current: { status: "current" },
    });
  });

  it.each(["file", "directory", "link", "broken link"])(
    "protects an unmanaged Codex %s before installing Claude",
    async (kind) => {
      const root = await makeRoot();
      const context = await makeContext(root);
      const codex = codexDestination(context);
      await fs.mkdir(path.dirname(codex), { recursive: true });
      if (kind === "file") {
        await fs.writeFile(codex, "local edit\n");
      } else if (kind === "directory") {
        await fs.mkdir(codex);
        await fs.writeFile(path.join(codex, "SKILL.md"), "local edit\n");
      } else {
        const target = path.join(root, "external");
        if (kind === "link") await fs.mkdir(target);
        await fs.symlink(target, codex);
      }

      await expect(installSkill(context)).rejects.toMatchObject({
        exitCode: EXIT_PARAM_ERROR,
        message: expect.stringContaining("Codex"),
      });
      await expect(fs.lstat(await destinationOf(context))).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect((await fs.lstat(codex)).isSymbolicLink()).toBe(kind.includes("link"));
      if (kind === "file" || kind === "directory") {
        await expect(fs.readFile(kind === "file" ? codex : path.join(codex, "SKILL.md"), "utf8"))
          .resolves.toBe("local edit\n");
      }
    },
  );

  it("backs up user entries for both agents with force", async () => {
    const context = await makeContext(await makeRoot());
    const claude = await ensureDestinationParent(context);
    const codex = codexDestination(context);
    await fs.writeFile(claude, "Claude local edit\n");
    await fs.mkdir(codex, { recursive: true });
    await fs.writeFile(path.join(codex, "SKILL.md"), "Codex local edit\n");

    const result = await installSkill(context, { force: true });

    expect(result.current.status).toBe("current");
    expect(result.backupPath).toBe(result.backupPaths.claude);
    await expect(fs.readFile(result.backupPaths.claude!, "utf8"))
      .resolves.toBe("Claude local edit\n");
    await expect(fs.readFile(path.join(result.backupPaths.codex!, "SKILL.md"), "utf8"))
      .resolves.toBe("Codex local edit\n");
  });

  it("removes the new Claude link when first-time Codex activation fails", async () => {
    const context = await makeContext(await makeRoot());
    await failCodexActivation(context);

    await expect(installSkill(context)).rejects.toThrow("Codex activation failed");
    await expect(inspectSkill(context)).resolves.toMatchObject({
      agents: { claude: { status: "missing" }, codex: { status: "missing" } },
    });
    for (const destination of [await destinationOf(context), codexDestination(context)]) {
      expect(await fs.readdir(path.dirname(destination))).toEqual([]);
    }
  });

  it("restores both previous links when Codex activation fails during update", async () => {
    const context = await makeContext(await makeRoot());
    await installSkill(context);
    const oldStore = await fs.readlink(codexDestination(context));
    await fs.writeFile(
      path.join(context.packageRoot, "skills", "dooray-cli", "SKILL.md"),
      "updated skill\n",
    );
    await failCodexActivation(context);

    await expect(installSkill(context)).rejects.toThrow("Codex activation failed");
    await expect(fs.readlink(await destinationOf(context))).resolves.toBe(oldStore);
    await expect(fs.readlink(codexDestination(context))).resolves.toBe(oldStore);
    for (const destination of [await destinationOf(context), codexDestination(context)]) {
      expect(await fs.readdir(path.dirname(destination))).toEqual(["dooray-cli"]);
    }
  });

  it("restores both user entries when a forced Codex activation fails", async () => {
    const context = await makeContext(await makeRoot());
    const claude = await ensureDestinationParent(context);
    const codex = codexDestination(context);
    await fs.writeFile(claude, "Claude local edit\n");
    await fs.mkdir(codex, { recursive: true });
    await fs.writeFile(path.join(codex, "SKILL.md"), "Codex local edit\n");
    await failCodexActivation(context);

    await expect(installSkill(context, { force: true })).rejects.toThrow("Codex activation failed");
    await expect(fs.readFile(claude, "utf8")).resolves.toBe("Claude local edit\n");
    await expect(fs.readFile(path.join(codex, "SKILL.md"), "utf8"))
      .resolves.toBe("Codex local edit\n");
  });

  it("restores quarantined shared content if forced activation fails", async () => {
    const context = await makeContext(await makeRoot());
    await installSkill(context);
    const store = await fs.readlink(codexDestination(context));
    await fs.writeFile(path.join(store, "SKILL.md"), "local edit\n");
    await failCodexActivation(context);

    await expect(installSkill(context, { force: true })).rejects.toThrow("Codex activation failed");
    await expect(fs.readFile(path.join(store, "SKILL.md"), "utf8"))
      .resolves.toBe("local edit\n");
    await expect(inspectSkill(context)).resolves.toMatchObject({
      agents: { claude: { status: "modified" }, codex: { status: "modified" } },
    });
  });

  describe("shared skills parent directory", () => {
    async function shareSkillsDirectory(
      context: SkillManagerContext,
      alias: "claude" | "codex" = "codex",
    ): Promise<void> {
      const claude = path.dirname(await destinationOf(context));
      const codex = path.dirname(codexDestination(context));
      const realDirectory = alias === "codex" ? claude : codex;
      const aliasDirectory = alias === "codex" ? codex : claude;
      await fs.mkdir(realDirectory, { recursive: true });
      await fs.mkdir(path.dirname(aliasDirectory), { recursive: true });
      await fs.symlink(
        path.relative(path.dirname(aliasDirectory), realDirectory),
        aliasDirectory,
      );
    }

    function freezeTime(): void {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    }

    async function failSharedActivation(context: SkillManagerContext): Promise<void> {
      const actualFs = await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises",
      );
      const destination = await destinationOf(context);
      vi.mocked(fs.rename).mockImplementation(async (from, to) => {
        if (to === destination && String(from).includes(".tmp-")) {
          throw new Error("Shared activation failed");
        }
        return actualFs.rename(from, to);
      });
    }

    it.each(["claude", "codex"] as const)(
      "installs when the %s skills directory aliases the other agent's directory",
      async (alias) => {
        const context = await makeContext(await makeRoot());
        await shareSkillsDirectory(context, alias);
        freezeTime();

        const result = await installSkill(context);

        expect(result.current).toMatchObject({
          status: "current",
          agents: { claude: { status: "current" }, codex: { status: "current" } },
        });
        await expect(fs.readlink(codexDestination(context))).resolves.toBe(
          await fs.readlink(await destinationOf(context)),
        );
        expect(result.backupPaths).toEqual({});
        expect(await fs.readdir(path.dirname(await destinationOf(context))))
          .toEqual(["dooray-cli"]);
      },
    );

    it("updates a shared active link and keeps the previous store", async () => {
      const context = await makeContext(await makeRoot());
      await shareSkillsDirectory(context);
      freezeTime();
      await installSkill(context);
      const oldStore = await fs.readlink(await destinationOf(context));
      await fs.writeFile(
        path.join(context.packageRoot, "skills", "dooray-cli", "SKILL.md"),
        "updated skill\n",
      );

      const result = await installSkill(context);
      const newStore = await fs.readlink(codexDestination(context));

      expect(result.current.status).toBe("current");
      expect(newStore).not.toBe(oldStore);
      await expect(fs.readlink(await destinationOf(context))).resolves.toBe(newStore);
      await expect(fs.readFile(path.join(oldStore, "SKILL.md"), "utf8"))
        .resolves.toBe("# dooray-cli\n");
      expect(await fs.readdir(path.dirname(await destinationOf(context))))
        .toEqual(["dooray-cli"]);
    });

    it.each(["file", "directory"])(
      "preserves one shared user %s backup when both backup timestamps are identical",
      async (kind) => {
        const context = await makeContext(await makeRoot());
        await shareSkillsDirectory(context);
        const destination = await destinationOf(context);
        if (kind === "directory") await fs.mkdir(destination);
        await fs.writeFile(
          kind === "file" ? destination : path.join(destination, "SKILL.md"),
          "shared user content\n",
        );
        freezeTime();
        let now = Date.now();
        // 임시 링크 이름은 달라도 백업 시각이 같을 때의 덮어쓰기를 검증한다.
        vi.spyOn(Date, "now").mockImplementation(() => now++);

        const result = await installSkill(context, { force: true });
        const backup = result.backupPaths.claude!;

        expect(result.current.status).toBe("current");
        expect((await fs.lstat(backup)).isSymbolicLink()).toBe(false);
        await expect(fs.readFile(
          kind === "file" ? backup : path.join(backup, "SKILL.md"),
          "utf8",
        )).resolves.toBe("shared user content\n");
        expect(result.backupPath).toBe(backup);
        expect(result.backupPaths.codex).toBe(backup);
        expect(await fs.readdir(path.dirname(destination)))
          .toEqual(["dooray-cli", path.basename(backup)]);
      },
    );

    it("removes temporary links when a first shared activation fails", async () => {
      const context = await makeContext(await makeRoot());
      await shareSkillsDirectory(context);
      freezeTime();
      await failSharedActivation(context);

      await expect(installSkill(context)).rejects.toThrow("Shared activation failed");

      await expect(inspectSkill(context)).resolves.toMatchObject({
        agents: { claude: { status: "missing" }, codex: { status: "missing" } },
      });
      expect(await fs.readdir(path.dirname(await destinationOf(context)))).toEqual([]);
      await expect(fs.readlink(path.dirname(codexDestination(context))))
        .resolves.toBe("../.claude/skills");
    });

    it.each(["file", "directory"])(
      "restores a shared user %s when forced activation fails",
      async (kind) => {
        const context = await makeContext(await makeRoot());
        await shareSkillsDirectory(context);
        const destination = await destinationOf(context);
        if (kind === "directory") await fs.mkdir(destination);
        await fs.writeFile(
          kind === "file" ? destination : path.join(destination, "SKILL.md"),
          "shared user content\n",
        );
        freezeTime();
        await failSharedActivation(context);

        await expect(installSkill(context, { force: true }))
          .rejects.toThrow("Shared activation failed");

        for (const entry of [destination, codexDestination(context)]) {
          await expect(fs.readFile(
            kind === "file" ? entry : path.join(entry, "SKILL.md"),
            "utf8",
          )).resolves.toBe("shared user content\n");
        }
        expect(await fs.readdir(path.dirname(destination))).toEqual(["dooray-cli"]);
      },
    );

    it("restores a shared active link when installation verification fails", async () => {
      const context = await makeContext(await makeRoot());
      await shareSkillsDirectory(context);
      freezeTime();
      await installSkill(context);
      const destination = await destinationOf(context);
      const oldStore = await fs.readlink(destination);
      await fs.writeFile(
        path.join(context.packageRoot, "skills", "dooray-cli", "SKILL.md"),
        "updated skill\n",
      );
      const actualFs = await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises",
      );
      let modified = false;
      vi.mocked(fs.rename).mockImplementation(async (from, to) => {
        await actualFs.rename(from, to);
        if (!modified && to === destination && String(from).includes(".tmp-")) {
          modified = true;
          const store = await actualFs.readlink(destination);
          await actualFs.writeFile(path.join(store, "SKILL.md"), "invalid content\n");
        }
      });

      await expect(installSkill(context))
        .rejects.toThrow("스킬 설치 후 상태가 current가 아닙니다: modified");

      await expect(fs.readlink(destination)).resolves.toBe(oldStore);
      await expect(fs.readlink(codexDestination(context))).resolves.toBe(oldStore);
      await expect(fs.readFile(path.join(oldStore, "SKILL.md"), "utf8"))
        .resolves.toBe("# dooray-cli\n");
      expect(await fs.readdir(path.dirname(destination))).toEqual(["dooray-cli"]);
    });
  });
});
