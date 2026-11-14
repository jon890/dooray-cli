/** 설치 대상별 링크·해시 상태를 읽고 전체 스킬 상태를 모은다. */
import * as fs from "node:fs/promises";
import path from "node:path";
import { MANIFEST_FILE_NAME, computeSkillContentDigest, readDooraySkillManifest } from "@/skill/manifest.js";
import { SKILL_AGENTS, type SkillManagerContext, type SkillAgent, type SkillStatus, type SkillStatusCode, type SkillsStatus } from "@/skill/types.js";
import { getSource, getDestination, getStoreRoot, isManagedSkillPath, isInsideStoreRoot, parseStoreBasename } from "@/skill/paths.js";
import { isNodeError, readPackageMetadata, resolveLinkTarget, isSameEntry } from "@/skill/entries.js";

const PACKAGE_NAME = "@bifos/dooray-cli";

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
