import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    rename: vi.fn(actual.rename),
  };
});

import * as fs from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  inspectSkill,
  installSkill,
  type SkillManagerContext,
} from "./manager.js";
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
  const root = await mkdtemp(path.join(tmpdir(), "dooray-skill-manager-"));
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

  it("reports a link to the current package skill as current", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);
    const destination = await ensureDestinationParent(context);
    const source = path.join(context.packageRoot, "skills", "dooray-cli");
    await fs.symlink(source, destination);

    await expect(inspectSkill(context)).resolves.toMatchObject({
      status: "current",
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

  it("reports a package-shaped link with invalid metadata as corrupt", async () => {
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
      status: "corrupt",
      managed: true,
      installedVersion: null,
      linkTarget: target,
    });
  });
});

describe("installSkill", () => {
  it("installs a missing destination with an atomic replacement link", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);

    const result = await installSkill(context);

    expect(result).toMatchObject({
      changed: true,
      backupPath: null,
      previous: { status: "missing" },
      current: { status: "current" },
    });
  });

  it("does not change an already current link", async () => {
    const root = await makeRoot();
    const context = await makeContext(root);
    const destination = await ensureDestinationParent(context);
    await fs.symlink(
      path.join(context.packageRoot, "skills", "dooray-cli"),
      destination,
    );

    const result = await installSkill(context);

    expect(result).toMatchObject({
      changed: false,
      backupPath: null,
      previous: { status: "current" },
      current: { status: "current" },
    });
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

  it("updates managed corrupt links", async () => {
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

    await expect(installSkill(context)).resolves.toMatchObject({
      changed: true,
      previous: { status: "corrupt", managed: true },
      current: { status: "current" },
      backupPath: null,
    });
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
