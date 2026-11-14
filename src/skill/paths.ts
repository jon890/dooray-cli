/** 번들·설치 대상·관리 저장소 경로와 저장소 이름 규칙. */
import path from "node:path";
import { getDigestHex } from "@/skill/manifest.js";
import type { SkillManagerContext, SkillAgent } from "@/skill/types.js";

const SKILL_RELATIVE_PATH = path.join("skills", "dooray-cli");

export function getSource(context: SkillManagerContext): string {
  return path.join(context.packageRoot, SKILL_RELATIVE_PATH);
}

export function getDestination(context: SkillManagerContext, agent: SkillAgent): string {
  const directory = agent === "claude" ? ".claude" : ".agents";
  return path.join(context.homeDir, directory, "skills", "dooray-cli");
}

function getDataRoot(context: SkillManagerContext): string {
  return (
    context.dataRoot ??
    path.join(context.homeDir, ".local", "share", "dooray-cli")
  );
}

export function getStoreRoot(context: SkillManagerContext): string {
  return path.join(getDataRoot(context), "skills");
}

export function getStorePath(
  context: SkillManagerContext,
  contentDigest: `sha256:${string}`,
): string {
  return path.join(
    getStoreRoot(context),
    `${context.currentVersion}-${getDigestHex(contentDigest)}`,
  );
}

export function isManagedSkillPath(candidate: string): boolean {
  const parts = path.normalize(candidate).split(path.sep).filter(Boolean);
  const suffix = ["@bifos", "dooray-cli", "skills", "dooray-cli"];

  if (parts.length < suffix.length) {
    return false;
  }

  return suffix.every(
    (part, index) => parts[parts.length - suffix.length + index] === part,
  );
}

export function isInsideStoreRoot(
  context: SkillManagerContext,
  target: string,
  storeRoot = getStoreRoot(context),
): boolean {
  const relative = path.relative(storeRoot, target);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function parseStoreBasename(
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
