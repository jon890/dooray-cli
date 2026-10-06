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

export const SKILL_AGENTS = ["claude", "codex"] as const;
export type SkillAgent = (typeof SKILL_AGENTS)[number];

export const SKILL_AGENT_NAMES: Record<SkillAgent, string> = {
  claude: "Claude Code",
  codex: "Codex",
};

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

export interface SkillsStatus extends SkillStatus {
  agents: Record<SkillAgent, SkillStatus>;
}

export interface SkillInstallResult {
  previous: SkillsStatus;
  current: SkillsStatus;
  changed: boolean;
  backupPath: string | null;
  backupPaths: Partial<Record<SkillAgent, string>>;
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

function getDestination(context: SkillManagerContext, agent: SkillAgent): string {
  const directory = agent === "claude" ? ".claude" : ".agents";
  return path.join(context.homeDir, directory, "skills", "dooray-cli");
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
  agent: SkillAgent,
  status: SkillStatusCode,
  overrides: Partial<
    Pick<SkillStatus, "installedVersion" | "linkTarget" | "managed">
  > = {},
): SkillStatus {
  return {
    schemaVersion: 1,
    status,
    destination: getDestination(context, agent),
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

function isInsideStoreRoot(
  context: SkillManagerContext,
  target: string,
  storeRoot = getStoreRoot(context),
): boolean {
  const relative = path.relative(storeRoot, target);
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
): Promise<{ storePath: string; quarantinePath: string | null }> {
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
      return { storePath, quarantinePath: null };
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
    return { storePath, quarantinePath };
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

async function inspectAgentSkill(
  context: SkillManagerContext,
  agent: SkillAgent,
): Promise<SkillStatus> {
  const destination = getDestination(context, agent);
  const source = getSource(context);

  let stat;
  try {
    stat = await fs.lstat(destination);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return statusOf(context, agent, "missing", { managed: true });
    }
    throw error;
  }

  if (!stat.isSymbolicLink()) {
    return statusOf(context, agent, "unmanaged");
  }

  const linkTarget = await fs.readlink(destination);
  const absoluteTarget = resolveLinkTarget(destination, linkTarget);

  try {
    await fs.stat(absoluteTarget);
  } catch (error) {
    if (!isNodeError(error, "ENOENT")) {
      throw error;
    }
    return statusOf(context, agent, "broken", {
      linkTarget,
      managed:
        isManagedSkillPath(absoluteTarget) ||
        isInsideStoreRoot(context, absoluteTarget),
    });
  }

  // 수동으로 Codex 경로를 Claude Code 링크에 연결한 설치도 판별한다.
  const resolvedTarget = await fs.realpath(absoluteTarget);
  const resolvedStoreRoot = await fs.realpath(getStoreRoot(context)).catch(
    () => getStoreRoot(context),
  );
  const sourceDigest = await computeSkillContentDigest(source).catch(() => null);

  if (isInsideStoreRoot(context, resolvedTarget, resolvedStoreRoot)) {
    const manifest = await readDooraySkillManifest(
      path.join(resolvedTarget, MANIFEST_FILE_NAME),
    );
    if (manifest == null) {
      return statusOf(context, agent, "corrupt", { linkTarget, managed: true });
    }

    const basename = parseStoreBasename(path.basename(resolvedTarget));
    if (
      basename == null ||
      basename.packageVersion !== manifest.packageVersion ||
      basename.contentDigest !== manifest.contentDigest
    ) {
      return statusOf(context, agent, "corrupt", {
        installedVersion: manifest.packageVersion,
        linkTarget,
        managed: true,
      });
    }

    const actualDigest = await computeSkillContentDigest(resolvedTarget).catch(
      () => null,
    );
    if (actualDigest !== manifest.contentDigest) {
      return statusOf(context, agent, "modified", {
        installedVersion: manifest.packageVersion,
        linkTarget,
        managed: true,
      });
    }

    if (
      manifest.packageVersion === context.currentVersion &&
      sourceDigest === manifest.contentDigest
    ) {
      return statusOf(context, agent, "current", {
        installedVersion: manifest.packageVersion,
        linkTarget,
        managed: true,
      });
    }

    return statusOf(context, agent, "outdated", {
      installedVersion: manifest.packageVersion,
      linkTarget,
      managed: true,
    });
  }

  if (await isSameEntry(resolvedTarget, source)) {
    return statusOf(context, agent, "outdated", {
      installedVersion: context.currentVersion,
      linkTarget,
      managed: true,
    });
  }

  const packageMetadata = await readPackageMetadata(resolvedTarget);
  if (packageMetadata == null) {
    return statusOf(context, agent, "unmanaged", { linkTarget });
  }

  if (packageMetadata.name !== PACKAGE_NAME) {
    return statusOf(context, agent, "unmanaged", {
      installedVersion: packageMetadata.version,
      linkTarget,
    });
  }

  return statusOf(context, agent, "outdated", {
    installedVersion: packageMetadata.version,
    linkTarget,
    managed: true,
  });
}

export async function inspectSkill(
  context: SkillManagerContext,
): Promise<SkillsStatus> {
  const [claude, codex] = await Promise.all(
    SKILL_AGENTS.map((agent) => inspectAgentSkill(context, agent)),
  );
  const agents = { claude, codex };
  // 보호가 필요한 상태를 먼저 알리고, 둘 다 최신일 때만 current를 반환한다.
  const priority: SkillStatusCode[] = [
    "corrupt", "modified", "unmanaged", "broken", "outdated", "missing", "current",
  ];
  const status = priority.find((candidate) =>
    SKILL_AGENTS.some((agent) => agents[agent].status === candidate),
  )!;

  // 기존 JSON 필드는 Claude Code의 상세 정보로 유지한다.
  return { ...claude, status, agents };
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
      backupPaths: {},
    };
  }

  // 한쪽의 사용자 파일 때문에 실패할 때 다른 쪽도 변경하지 않는다.
  for (const agent of SKILL_AGENTS) {
    const target = previous.agents[agent];
    if (
      (target.status === "modified" || target.status === "corrupt") &&
      options.force !== true
    ) {
      throw new DoorayCliError(
        `${SKILL_AGENT_NAMES[agent]} 스킬 관리 저장소가 ${target.status} 상태입니다. 내용을 확인한 뒤 dooray skill update --force로 복구하세요: ${target.destination}`,
        EXIT_PARAM_ERROR,
      );
    }
    if (!target.managed && options.force !== true) {
      throw new DoorayCliError(
        `${SKILL_AGENT_NAMES[agent]} 스킬 경로가 dooray-cli에서 관리한 항목이 아닙니다: ${target.destination}`,
        EXIT_PARAM_ERROR,
      );
    }
  }

  const { storePath, quarantinePath } = await prepareStore(context, options);
  const backupPaths: Partial<Record<SkillAgent, string>> = {};
  const transitions: {
    agents: SkillAgent[];
    resolvedDestination: string;
    previous: SkillStatus;
    tempPath: string;
    backupPath: string | null;
    activated: boolean;
  }[] = [];

  try {
    for (const agent of SKILL_AGENTS) {
      const target = previous.agents[agent];
      if (target.status === "current") continue;
      const directory = path.dirname(target.destination);
      await fs.mkdir(directory, { recursive: true });
      // 서로 다른 설치 항목도 최종 링크 대상을 공유하므로 부모 경로와 이름으로 비교한다.
      const resolvedDestination = path.join(
        await fs.realpath(directory),
        path.basename(target.destination),
      );
      const sharedTransition = transitions.find(
        (transition) => transition.resolvedDestination === resolvedDestination,
      );
      if (sharedTransition != null) {
        sharedTransition.agents.push(agent);
        continue;
      }
      const tempPath = `${target.destination}.tmp-${process.pid}-${Date.now()}`;
      transitions.push({
        agents: [agent],
        resolvedDestination,
        previous: target,
        tempPath,
        backupPath: null,
        activated: false,
      });
      await fs.symlink(storePath, tempPath);
    }

    for (const transition of transitions) {
      const target = transition.previous;
      if (!target.managed) {
        const backupPath = `${target.destination}.backup-${utcTimestamp()}`;
        await fs.rename(target.destination, backupPath);
        transition.backupPath = backupPath;
        for (const agent of transition.agents) {
          backupPaths[agent] = backupPath;
        }
      }
      await fs.rename(transition.tempPath, target.destination);
      transition.activated = true;
    }

    const current = await inspectSkill(context);
    if (current.status !== "current") {
      throw new DoorayCliError(
        `스킬 설치 후 상태가 current가 아닙니다: ${current.status}`,
        1,
      );
    }

    return {
      previous,
      current,
      changed: true,
      backupPath: backupPaths.claude ?? null,
      backupPaths,
    };
  } catch (error) {
    for (const transition of [...transitions].reverse()) {
      const target = transition.previous;
      const backupPath = transition.backupPath;
      if (backupPath != null) {
        if (transition.activated) {
          await fs.rm(target.destination, { force: true }).catch(() => {});
        }
        await fs.rename(backupPath, target.destination).catch(() => {});
      } else if (transition.activated) {
        if (target.linkTarget == null) {
          await fs.rm(target.destination, { force: true }).catch(() => {});
        } else {
          await fs.symlink(target.linkTarget, transition.tempPath).catch(() => {});
          await fs.rename(transition.tempPath, target.destination).catch(() => {});
        }
      }
      await fs.rm(transition.tempPath, { force: true }).catch(() => {});
    }
    if (quarantinePath != null) {
      await fs.rm(storePath, { recursive: true, force: true }).catch(() => {});
      await fs.rename(quarantinePath, storePath).catch(() => {});
    }
    throw error;
  }
}
