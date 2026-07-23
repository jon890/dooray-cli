import * as fs from "node:fs/promises";
import path from "node:path";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

export type SkillStatusCode =
  | "missing"
  | "current"
  | "outdated"
  | "broken"
  | "unmanaged"
  | "modified"
  | "corrupt";

export interface SkillManagerContext {
  homeDir: string;
  packageRoot: string;
  currentVersion: string;
}

export interface SkillStatus {
  schemaVersion: 1;
  status: SkillStatusCode;
  destination: string;
  source: string;
  currentVersion: string;
  installedVersion: string | null;
  linkTarget: string | null;
  managed: boolean;
}

export interface SkillInstallResult {
  previous: SkillStatus;
  current: SkillStatus;
  changed: boolean;
  backupPath: string | null;
}

interface PackageMetadata {
  name: string;
  version: string;
}

const PACKAGE_NAME = "@bifos/dooray-cli";
const SKILL_RELATIVE_PATH = path.join("skills", "dooray-cli");

function getSource(context: SkillManagerContext): string {
  return path.join(context.packageRoot, SKILL_RELATIVE_PATH);
}

function getDestination(context: SkillManagerContext): string {
  return path.join(context.homeDir, ".claude", "skills", "dooray-cli");
}

function statusOf(
  context: SkillManagerContext,
  status: SkillStatusCode,
  overrides: Partial<
    Pick<SkillStatus, "installedVersion" | "linkTarget" | "managed">
  > = {},
): SkillStatus {
  return {
    schemaVersion: 1,
    status,
    destination: getDestination(context),
    source: getSource(context),
    currentVersion: context.currentVersion,
    installedVersion: overrides.installedVersion ?? null,
    linkTarget: overrides.linkTarget ?? null,
    managed: overrides.managed ?? false,
  };
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code: unknown }).code === code
  );
}

function isPackageMetadata(value: unknown): value is PackageMetadata {
  return (
    value != null &&
    typeof value === "object" &&
    "name" in value &&
    "version" in value &&
    typeof value.name === "string" &&
    typeof value.version === "string"
  );
}

async function readPackageMetadata(
  skillPath: string,
): Promise<PackageMetadata | null> {
  const packageJsonPath = path.join(skillPath, "..", "..", "package.json");

  try {
    const parsed: unknown = JSON.parse(
      await fs.readFile(packageJsonPath, "utf8"),
    );
    if (!isPackageMetadata(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function resolveLinkTarget(destination: string, linkTarget: string): string {
  return path.resolve(path.dirname(destination), linkTarget);
}

async function isSameEntry(left: string, right: string): Promise<boolean> {
  try {
    const [leftRealPath, rightRealPath] = await Promise.all([
      fs.realpath(left),
      fs.realpath(right),
    ]);
    return leftRealPath === rightRealPath;
  } catch {
    return path.resolve(left) === path.resolve(right);
  }
}

function isManagedSkillPath(candidate: string): boolean {
  const parts = path.normalize(candidate).split(path.sep).filter(Boolean);
  const suffix = ["@bifos", "dooray-cli", "skills", "dooray-cli"];

  if (parts.length < suffix.length) {
    return false;
  }

  return suffix.every(
    (part, index) => parts[parts.length - suffix.length + index] === part,
  );
}

function utcTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function renameWithRollback(
  from: string,
  to: string,
  backupPath: string | null,
): Promise<void> {
  try {
    await fs.rename(from, to);
  } catch (error) {
    if (backupPath != null) {
      await fs.rename(backupPath, to).catch(() => {});
    }
    throw error;
  }
}

export async function inspectSkill(
  context: SkillManagerContext,
): Promise<SkillStatus> {
  const destination = getDestination(context);
  const source = getSource(context);

  let stat;
  try {
    stat = await fs.lstat(destination);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return statusOf(context, "missing", { managed: true });
    }
    throw error;
  }

  if (!stat.isSymbolicLink()) {
    return statusOf(context, "unmanaged");
  }

  const linkTarget = await fs.readlink(destination);
  const absoluteTarget = resolveLinkTarget(destination, linkTarget);

  try {
    await fs.stat(absoluteTarget);
  } catch (error) {
    if (!isNodeError(error, "ENOENT")) {
      throw error;
    }
    return statusOf(context, "broken", {
      linkTarget,
      managed: isManagedSkillPath(absoluteTarget),
    });
  }

  if (await isSameEntry(absoluteTarget, source)) {
    return statusOf(context, "current", {
      installedVersion: context.currentVersion,
      linkTarget,
      managed: true,
    });
  }

  const packageMetadata = await readPackageMetadata(absoluteTarget);
  if (packageMetadata == null) {
    if (isManagedSkillPath(absoluteTarget)) {
      return statusOf(context, "corrupt", {
        linkTarget,
        managed: true,
      });
    }
    return statusOf(context, "unmanaged", { linkTarget });
  }

  if (packageMetadata.name !== PACKAGE_NAME) {
    return statusOf(context, "unmanaged", {
      installedVersion: packageMetadata.version,
      linkTarget,
    });
  }

  return statusOf(context, "outdated", {
    installedVersion: packageMetadata.version,
    linkTarget,
    managed: true,
  });
}

export async function installSkill(
  context: SkillManagerContext,
  options: { force?: boolean } = {},
): Promise<SkillInstallResult> {
  const previous = await inspectSkill(context);

  if (previous.status === "current") {
    return {
      previous,
      current: previous,
      changed: false,
      backupPath: null,
    };
  }

  if (!previous.managed && options.force !== true) {
    throw new DoorayCliError(
      `Claude Code 스킬 경로가 dooray-cli에서 관리한 항목이 아닙니다: ${previous.destination}`,
      EXIT_PARAM_ERROR,
    );
  }

  await fs.mkdir(path.dirname(previous.destination), { recursive: true });

  const tempPath = `${previous.destination}.tmp-${process.pid}-${Date.now()}`;
  let backupPath: string | null = null;

  try {
    await fs.symlink(previous.source, tempPath);

    if (!previous.managed && options.force === true) {
      backupPath = `${previous.destination}.backup-${utcTimestamp()}`;
      await fs.rename(previous.destination, backupPath);
    }

    await renameWithRollback(tempPath, previous.destination, backupPath);
    const current = await inspectSkill(context);

    return {
      previous,
      current,
      changed: true,
      backupPath,
    };
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}
