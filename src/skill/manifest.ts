import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import path from "node:path";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

export interface DooraySkillManifest {
  schemaVersion: 1;
  skillName: "dooray-cli";
  packageName: "@bifos/dooray-cli";
  packageVersion: string;
  contentDigest: `sha256:${string}`;
  installedAt: string;
  managedBy: "@bifos/dooray-cli";
}

export const MANIFEST_FILE_NAME = ".dooray-skill.json";
const DIGEST_PREFIX = "sha256:";
const HASH_HEADER = Buffer.from("dooray-skill-content-v1\0", "utf8");

function isUtcIsoTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return new Date(timestamp).toISOString() === value;
}

export function isDooraySkillManifest(
  value: unknown,
): value is DooraySkillManifest {
  const installedAt =
    value != null &&
    typeof value === "object" &&
    "installedAt" in value &&
    typeof value.installedAt === "string"
      ? value.installedAt
      : null;

  return (
    value != null &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 1 &&
    "skillName" in value &&
    value.skillName === "dooray-cli" &&
    "packageName" in value &&
    value.packageName === "@bifos/dooray-cli" &&
    "packageVersion" in value &&
    typeof value.packageVersion === "string" &&
    value.packageVersion.length > 0 &&
    "contentDigest" in value &&
    typeof value.contentDigest === "string" &&
    /^sha256:[0-9a-f]{64}$/.test(value.contentDigest) &&
    installedAt != null &&
    isUtcIsoTimestamp(installedAt) &&
    "managedBy" in value &&
    value.managedBy === "@bifos/dooray-cli"
  );
}

export async function readDooraySkillManifest(
  manifestPath: string,
): Promise<DooraySkillManifest | null> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    return isDooraySkillManifest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function createDooraySkillManifest(
  packageVersion: string,
  contentDigest: `sha256:${string}`,
  installedAt = new Date().toISOString(),
): DooraySkillManifest {
  return {
    schemaVersion: 1,
    skillName: "dooray-cli",
    packageName: "@bifos/dooray-cli",
    packageVersion,
    contentDigest,
    installedAt,
    managedBy: "@bifos/dooray-cli",
  };
}

export function getDigestHex(contentDigest: `sha256:${string}`): string {
  return contentDigest.slice(DIGEST_PREFIX.length);
}

function compareCodePoint(left: string, right: string): number {
  const leftPoints = Array.from(left);
  const rightPoints = Array.from(right);
  const length = Math.min(leftPoints.length, rightPoints.length);

  for (let index = 0; index < length; index += 1) {
    const leftCodePoint = leftPoints[index].codePointAt(0) ?? 0;
    const rightCodePoint = rightPoints[index].codePointAt(0) ?? 0;
    if (leftCodePoint !== rightCodePoint) {
      return leftCodePoint - rightCodePoint;
    }
  }

  return leftPoints.length - rightPoints.length;
}

async function assertRegularFile(filePath: string): Promise<void> {
  const stat = await fs.lstat(filePath);
  if (!stat.isFile()) {
    throw new DoorayCliError(
      `스킬 콘텐츠는 정규 파일만 포함할 수 있습니다: ${filePath}`,
      EXIT_PARAM_ERROR,
    );
  }
}

async function collectReferenceFiles(
  root: string,
  current: string,
  files: string[],
): Promise<void> {
  const currentStat = await fs.lstat(current).catch((error: unknown) => {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: unknown }).code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  });
  if (currentStat == null) {
    return;
  }
  if (!currentStat.isDirectory()) {
    throw new DoorayCliError(
      `스킬 references는 디렉터리여야 합니다: ${current}`,
      EXIT_PARAM_ERROR,
    );
  }

  let entries;
  entries = await fs.readdir(current, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await collectReferenceFiles(root, entryPath, files);
      continue;
    }
    await assertRegularFile(entryPath);
    files.push(path.relative(root, entryPath).split(path.sep).join("/"));
  }
}

export async function collectSkillContentFiles(
  skillDir: string,
): Promise<string[]> {
  const files: string[] = [];
  const skillFile = path.join(skillDir, "SKILL.md");

  await assertRegularFile(skillFile);
  files.push("SKILL.md");
  await collectReferenceFiles(skillDir, path.join(skillDir, "references"), files);

  return files
    .filter((file) => file !== MANIFEST_FILE_NAME)
    .sort(compareCodePoint);
}

function writeUInt64BE(value: number): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(value));
  return buffer;
}

export async function computeSkillContentDigest(
  skillDir: string,
): Promise<`sha256:${string}`> {
  const hash = createHash("sha256");
  hash.update(HASH_HEADER);

  for (const relativePath of await collectSkillContentFiles(skillDir)) {
    const relativePathBuffer = Buffer.from(relativePath, "utf8");
    const content = await fs.readFile(path.join(skillDir, relativePath));

    hash.update(Buffer.from([0x01]));
    hash.update(writeUInt64BE(Buffer.byteLength(relativePath, "utf8")));
    hash.update(relativePathBuffer);
    hash.update(writeUInt64BE(content.length));
    hash.update(content);
  }

  return `sha256:${hash.digest("hex")}`;
}
