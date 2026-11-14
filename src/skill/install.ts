/** 번들 스킬 확인과 설치 링크 교체·백업·실패 시 복원. */
import * as fs from "node:fs/promises";
import path from "node:path";
import { SKILL_AGENTS, SKILL_AGENT_NAMES, type SkillManagerContext, type SkillAgent, type SkillStatus, type SkillInstallResult } from "@/skill/types.js";
import { getSource } from "@/skill/paths.js";
import { utcTimestamp } from "@/skill/entries.js";
import { inspectSkill } from "@/skill/inspect.js";
import { prepareStore } from "@/skill/store.js";
import { DoorayCliError } from "@/utils/errors.js";
import { EXIT_PARAM_ERROR } from "@/utils/exit-codes.js";

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
