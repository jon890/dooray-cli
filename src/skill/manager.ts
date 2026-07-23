import * as fs from "node:fs/promises";
import path from "node:path";
import {
  MANIFEST_FILE_NAME,
  collectSkillContentFiles,
  computeSkillContentDigest,
  createDooraySkillManifest,
  getDigestHex,
  readDooraySkillManifest,
  type DooraySkillManifest,
} from "./manifest.js";
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
  dataRoot?: string;
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

function getDataRoot(context: SkillManagerContext): string {
  return (
    context.dataRoot ??
    path.join(context.homeDir, ".local", "share", "dooray-cli")
  );
}

function getStoreRoot(context: SkillManagerContext): string {
  return path.join(getDataRoot(context), "skills");
}

function getStorePath(
  context: SkillManagerContext,
  contentDigest: `sha256:${string}`,
): string {
  return path.join(
    getStoreRoot(context),
    `${context.currentVersion}-${getDigestHex(contentDigest)}`,
  );
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

function isInsideStoreRoot(context: SkillManagerContext, target: string): boolean {
  const relative = path.relative(getStoreRoot(context), target);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function parseStoreBasename(
  basename: string,
): { packageVersion: string; contentDigest: `sha256:${string}` } | null {
  if (basename.length < 66 || basename[basename.length - 65] !== "-") {
    return null;
  }

  const packageVersion = basename.slice(0, -65);
  const digestHex = basename.slice(-64);
  if (!/^[0-9a-f]{64}$/.test(digestHex) || packageVersion.length === 0) {
    return null;
  }

  return {
    packageVersion,
    contentDigest: `sha256:${digestHex}`,
  };
}

async function writeManifest(
  storePath: string,
  manifest: DooraySkillManifest,
): Promise<void> {
  await fs.writeFile(
    path.join(storePath, MANIFEST_FILE_NAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

async function copySkillContentFiles(source: string, destination: string): Promise<void> {
  for (const relativePath of await collectSkillContentFiles(source)) {
    const sourcePath = path.join(source, relativePath);
    const destinationPath = path.join(destination, ...relativePath.split("/"));
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.copyFile(sourcePath, destinationPath);
  }
}

async function verifyStore(
  storePath: string,
  expectedManifest: DooraySkillManifest,
): Promise<"valid" | "modified" | "corrupt"> {
  const basename = parseStoreBasename(path.basename(storePath));
  if (
    basename == null ||
    basename.packageVersion !== expectedManifest.packageVersion ||
    basename.contentDigest !== expectedManifest.contentDigest
  ) {
    return "corrupt";
  }

  const manifest = await readDooraySkillManifest(
    path.join(storePath, MANIFEST_FILE_NAME),
  );
  if (
    manifest == null ||
    manifest.packageVersion !== expectedManifest.packageVersion ||
    manifest.contentDigest !== expectedManifest.contentDigest
  ) {
    return "corrupt";
  }

  const actualDigest = await computeSkillContentDigest(storePath).catch(() => null);
  if (actualDigest !== expectedManifest.contentDigest) {
    return "modified";
  }

  return "valid";
}

async function createStagedStore(
  context: SkillManagerContext,
  sourceDigest: `sha256:${string}`,
): Promise<string> {
  const storeRoot = getStoreRoot(context);
  const stagingPath = path.join(
    storeRoot,
    `.tmp-${process.pid}-${Date.now()}-${getDigestHex(sourceDigest)}`,
  );
  await fs.mkdir(stagingPath, { recursive: true });

  try {
    await copySkillContentFiles(getSource(context), stagingPath);
    const stagedDigest = await computeSkillContentDigest(stagingPath);
    if (stagedDigest !== sourceDigest) {
      throw new DoorayCliError(
        `스킬 staging 해시가 source 해시와 다릅니다: ${stagedDigest}`,
        1,
      );
    }
    await writeManifest(
      stagingPath,
      createDooraySkillManifest(context.currentVersion, sourceDigest),
    );
    return stagingPath;
  } catch (error) {
    await fs.rm(stagingPath, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function prepareStore(
  context: SkillManagerContext,
  options: { force?: boolean },
): Promise<string> {
  const sourceDigest = await computeSkillContentDigest(getSource(context));
  const expectedManifest = createDooraySkillManifest(
    context.currentVersion,
    sourceDigest,
  );
  const storeRoot = getStoreRoot(context);
  const storePath = getStorePath(context, sourceDigest);

  await fs.mkdir(storeRoot, { recursive: true });

  const existing = await fs
    .lstat(storePath)
    .then((stat) => stat)
    .catch((error: unknown) => {
      if (isNodeError(error, "ENOENT")) {
        return null;
      }
      throw error;
    });

  if (existing != null) {
    if (!existing.isDirectory()) {
      throw new DoorayCliError(
        `관리형 스킬 저장 경로가 디렉터리가 아닙니다: ${storePath}`,
        EXIT_PARAM_ERROR,
      );
    }

    const status = await verifyStore(storePath, expectedManifest);
    if (status === "valid") {
      return storePath;
    }

    if (options.force !== true) {
      throw new DoorayCliError(
        `관리형 스킬 저장소가 ${status} 상태입니다: ${storePath}`,
        EXIT_PARAM_ERROR,
      );
    }
  }

  const stagingPath = await createStagedStore(context, sourceDigest);
  let quarantinePath: string | null = null;

  try {
    if (existing != null) {
      quarantinePath = path.join(
        storeRoot,
        `.backup-${utcTimestamp()}-${path.basename(storePath)}`,
      );
      await fs.rename(storePath, quarantinePath);
    }

    await fs.rename(stagingPath, storePath);
    return storePath;
  } catch (error) {
    await fs.rm(stagingPath, { recursive: true, force: true }).catch(() => {});
    if (quarantinePath != null) {
      await fs.rename(quarantinePath, storePath).catch(() => {});
    }
    throw error;
  }
}

async function assertSourceAvailable(source: string): Promise<void> {
  const skillFile = path.join(source, "SKILL.md");

  try {
    const [sourceStat, skillFileStat] = await Promise.all([
      fs.stat(source),
      fs.stat(skillFile),
    ]);

    if (!sourceStat.isDirectory() || !skillFileStat.isFile()) {
      throw new Error("invalid source shape");
    }
  } catch (error) {
    const cause = error instanceof Error ? ` (${error.message})` : "";
    throw new DoorayCliError(
      `패키지 스킬 파일을 찾을 수 없습니다: ${skillFile}${cause}`,
      1,
    );
  }
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
      managed:
        isManagedSkillPath(absoluteTarget) ||
        isInsideStoreRoot(context, absoluteTarget),
    });
  }

  const sourceDigest = await computeSkillContentDigest(source).catch(() => null);

  if (isInsideStoreRoot(context, absoluteTarget)) {
    const manifest = await readDooraySkillManifest(
      path.join(absoluteTarget, MANIFEST_FILE_NAME),
    );
    if (manifest == null) {
      return statusOf(context, "corrupt", { linkTarget, managed: true });
    }

    const basename = parseStoreBasename(path.basename(absoluteTarget));
    if (
      basename == null ||
      basename.packageVersion !== manifest.packageVersion ||
      basename.contentDigest !== manifest.contentDigest
    ) {
      return statusOf(context, "corrupt", {
        installedVersion: manifest.packageVersion,
        linkTarget,
        managed: true,
      });
    }

    const actualDigest = await computeSkillContentDigest(absoluteTarget).catch(
      () => null,
    );
    if (actualDigest !== manifest.contentDigest) {
      return statusOf(context, "modified", {
        installedVersion: manifest.packageVersion,
        linkTarget,
        managed: true,
      });
    }

    if (
      manifest.packageVersion === context.currentVersion &&
      sourceDigest === manifest.contentDigest
    ) {
      return statusOf(context, "current", {
        installedVersion: manifest.packageVersion,
        linkTarget,
        managed: true,
      });
    }

    return statusOf(context, "outdated", {
      installedVersion: manifest.packageVersion,
      linkTarget,
      managed: true,
    });
  }

  if (await isSameEntry(absoluteTarget, source)) {
    return statusOf(context, "outdated", {
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
  await assertSourceAvailable(getSource(context));

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

  const storePath = await prepareStore(context, options);

  await fs.mkdir(path.dirname(previous.destination), { recursive: true });

  const tempPath = `${previous.destination}.tmp-${process.pid}-${Date.now()}`;
  let backupPath: string | null = null;

  try {
    await fs.symlink(storePath, tempPath);

    if (!previous.managed && options.force === true) {
      backupPath = `${previous.destination}.backup-${utcTimestamp()}`;
      await fs.rename(previous.destination, backupPath);
    }

    await renameWithRollback(tempPath, previous.destination, backupPath);
    const current = await inspectSkill(context);
    if (current.status !== "current") {
      let recovery = "백업 없음, 새 링크 상태를 유지했습니다";
      if (backupPath != null) {
        try {
          await fs.rename(backupPath, previous.destination);
          recovery = `백업 복구 완료: ${backupPath}`;
        } catch {
          recovery = `백업 복구 실패, 새 링크 유지 상태일 수 있음: ${previous.destination}`;
        }
      }
      throw new DoorayCliError(
        `Claude Code 스킬 설치 후 상태가 current가 아닙니다: ${current.status} (${recovery})`,
        1,
      );
    }

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
