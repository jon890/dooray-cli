import { Command } from "commander";
import chalk from "chalk";
import { createSkillManagerContext } from "../skill/context.js";
import {
  inspectSkill,
  installSkill,
  type SkillInstallResult,
  type SkillStatus,
} from "../skill/manager.js";

interface OutputOptions {
  json?: boolean;
  quiet?: boolean;
}

function printStatus(status: SkillStatus, options: OutputOptions): void {
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
  console.log(`설치 버전: ${status.installedVersion ?? "-"}`);
  console.log(`링크 대상: ${status.linkTarget ?? "-"}`);
  console.log(`설치 경로: ${status.destination}`);
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
    console.log(chalk.green("✓ Claude Code 스킬 설치 완료"));
  } else {
    console.log(chalk.green("✓ Claude Code 스킬이 이미 최신입니다"));
  }

  console.log(`상태: ${result.current.status}`);
  console.log(`현재 버전: ${result.current.currentVersion}`);
  console.log(`설치 버전: ${result.current.installedVersion ?? "-"}`);
  console.log(`링크 대상: ${result.current.linkTarget ?? "-"}`);
  if (result.backupPath != null) {
    console.log(`백업 경로: ${result.backupPath}`);
  }
}

export const skillCommand = new Command("skill").description(
  "Claude Code 스킬 관리",
);

const skillStatusCommand = skillCommand
  .command("status")
  .description("Claude Code 스킬 설치 상태 조회")
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
    .option("--force", "관리되지 않은 기존 항목을 백업 후 교체")
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

addInstallCommand("install", "Claude Code 스킬 설치");
addInstallCommand("update", "Claude Code 스킬을 현재 CLI 버전으로 갱신");
