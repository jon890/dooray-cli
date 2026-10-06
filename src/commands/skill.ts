import { Command } from "commander";
import chalk from "chalk";
import { createSkillManagerContext } from "../skill/context.js";
import {
  inspectSkill,
  installSkill,
  SKILL_AGENTS,
  SKILL_AGENT_NAMES,
  type SkillInstallResult,
  type SkillStatus,
  type SkillsStatus,
} from "../skill/manager.js";

interface OutputOptions {
  json?: boolean;
  quiet?: boolean;
}

function statusHint(status: SkillStatus): string {
  switch (status.status) {
    case "current":
      return "조치 없음";
    case "missing":
      return "dooray skill install";
    case "outdated":
    case "broken":
      return "dooray skill update";
    case "modified":
    case "corrupt":
    case "unmanaged":
      return "내용 확인 후 dooray skill update --force";
  }
}

function printAgentStatuses(status: SkillsStatus): void {
  for (const agent of SKILL_AGENTS) {
    const target = status.agents[agent];
    console.log(`\n${SKILL_AGENT_NAMES[agent]}`);
    console.log(`설치 상태: ${target.status}`);
    console.log(`설치 버전: ${target.installedVersion ?? "-"}`);
    console.log(`설치 경로: ${target.destination}`);
    console.log(`링크 대상: ${target.linkTarget ?? "-"}`);
    console.log(`복구 방법: ${statusHint(target)}`);
  }
}

function printStatus(status: SkillsStatus, options: OutputOptions): void {
  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  if (options.quiet) {
    console.log(status.status);
    return;
  }

  console.log(`상태: ${status.status}`);
  console.log(`현재 버전: ${status.currentVersion}`);
  printAgentStatuses(status);
}

function printInstallResult(
  result: SkillInstallResult,
  options: OutputOptions,
): void {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (options.quiet) {
    console.log(result.current.status);
    return;
  }

  if (result.changed) {
    console.log(chalk.green("✓ Claude Code·Codex 스킬 설치 완료"));
  } else {
    console.log(chalk.green("✓ Claude Code·Codex 스킬이 이미 최신입니다"));
  }

  console.log(`상태: ${result.current.status}`);
  console.log(`현재 버전: ${result.current.currentVersion}`);
  printAgentStatuses(result.current);
  for (const agent of SKILL_AGENTS) {
    if (result.backupPaths[agent] != null) {
      console.log(`${SKILL_AGENT_NAMES[agent]} 백업 경로: ${result.backupPaths[agent]}`);
    }
  }
}

export const skillCommand = new Command("skill").description(
  "Claude Code·Codex 스킬 관리",
);

const skillStatusCommand = skillCommand
  .command("status")
  .description("Claude Code·Codex 스킬 설치 상태 조회")
  .option("--json", "JSON 형식으로 출력")
  .option("--quiet", "상태 토큰만 출력")
  .action(async () => {
    const options = skillStatusCommand.optsWithGlobals() as OutputOptions;
    const status = await inspectSkill(createSkillManagerContext());
    printStatus(status, options);
  });

function addInstallCommand(name: "install" | "update", description: string): void {
  const command = skillCommand
    .command(name)
    .description(description)
    .option("--force", "기존 항목 또는 손상된 관리 저장소를 백업 후 교체")
    .option("--json", "JSON 형식으로 출력")
    .option("--quiet", "상태 토큰만 출력")
    .action(async () => {
      const options = command.optsWithGlobals() as OutputOptions & {
        force?: boolean;
      };
      const result = await installSkill(createSkillManagerContext(), {
        force: options.force,
      });
      printInstallResult(result, options);
    });
}

addInstallCommand("install", "Claude Code·Codex 스킬 설치");
addInstallCommand("update", "Claude Code·Codex 스킬을 현재 CLI 버전으로 갱신");
