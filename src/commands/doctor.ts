import { Command } from "commander";
import chalk from "chalk";
import path from "path";
import fs from "fs/promises";
import { createSkillManagerContext } from "../skill/context.js";
import { inspectSkill, type SkillStatus } from "../skill/manager.js";
import { getConfig, getConfigOrThrow } from "../config/store.js";
import { getCacheStats } from "../cache/store.js";
import { DoorayApiClient } from "../api/client.js";
import { ensureMe } from "../resolvers/me.js";

function formatSkillStatus(status: SkillStatus): string {
  switch (status.status) {
    case "current":
      return chalk.green(`✅ 최신 (${status.currentVersion})`);
    case "missing":
      return chalk.red("❌ 미설치 — dooray skill install");
    case "outdated":
      return chalk.yellow(
        `⚠️ 오래됨 (${status.installedVersion ?? "unknown"} → ${status.currentVersion}) — dooray skill update`,
      );
    case "broken":
      return chalk.yellow("⚠️ 링크 깨짐 — dooray skill update");
    case "corrupt":
      return chalk.yellow("⚠️ 관리 저장소 정보 손상 — dooray skill update --force");
    case "unmanaged":
      return chalk.yellow(
        "⚠️ 관리되지 않는 항목 — dooray skill update --force",
      );
    case "modified":
      return chalk.yellow("⚠️ 수정됨 — dooray skill update --force");
  }
}

export const doctorCommand = new Command("doctor")
  .description("설정 및 환경 진단")
  .option("--json", "JSON 형식으로 출력")
  .action(async (opts: { json?: boolean }, command: Command) => {
    const config = await getConfig();
    const apiKeyOk = config.state === "ok" && !!config.config.apiKey;
    const baseUrlOk = config.state === "ok" && !!config.config.baseUrl;
    const json = opts.json || !!command.parent?.opts().json;
    if (json) {
      console.log(
        JSON.stringify(
          {
            configState: config.state,
            apiKeyOk,
            baseUrlOk,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(chalk.bold("\n🔍 Dooray CLI 진단\n"));

    // Config checks
    if (config.state === "invalid") {
      console.log(`  설정 파일: ${chalk.red("❌ 손상")}`);
      console.log(`  이유:      ${config.reason}`);
    } else if (config.state === "unreadable") {
      console.log(`  설정 파일: ${chalk.red("❌ 읽기 실패")}`);
      console.log(`  이유:      ${config.reason}`);
      console.log("  파일 권한을 확인하세요.");
    } else {
      console.log(`  API Key:  ${apiKeyOk ? chalk.green("✅ 설정됨") : chalk.red("❌ 미설정")}`);
      console.log(`  Base URL: ${baseUrlOk ? chalk.green(`✅ ${config.state === "ok" ? config.config.baseUrl : ""}`) : chalk.red("❌ 미설정")}`);
    }

    // API connection test
    if (apiKeyOk && baseUrlOk) {
      console.log(chalk.bold("\n🌐 API 연결 테스트\n"));
      try {
        const validConfig = await getConfigOrThrow();
        const client = new DoorayApiClient(
          validConfig.apiKey,
          validConfig.baseUrl,
        );
        await client.getProjects({ page: 0, size: 1 });
        const me = await ensureMe(client);
        console.log(`  연결:     ${chalk.green("✅ 성공")} (${me.name})`);
      } catch {
        console.log(`  연결:     ${chalk.red("❌ 실패 — API 키 또는 URL을 확인하세요")}`);
      }
    }

    // Cache checks
    const stats = await getCacheStats();

    console.log(chalk.bold("\n📦 캐시 상태\n"));
    console.log(`  내 정보:    ${stats.me ? chalk.green(`${stats.me.name} (${stats.me.id})`) : chalk.gray("없음")}`);
    console.log(`  프로젝트:   ${stats.projectCount}개`);
    console.log(`  멤버:       ${stats.memberProjectCount}개 프로젝트`);
    console.log(`  워크플로우: ${stats.workflowProjectCount}개 프로젝트`);
    console.log(`  Tag 캐시 (프로젝트 수): ${stats.tagProjectCount}`);
    console.log(`  Milestone 캐시 (프로젝트 수): ${stats.milestoneProjectCount}`);
    console.log(`  Member Group 캐시 (프로젝트 수): ${stats.memberGroupProjectCount}`);

    // Claude Code 스킬 검증
    const claudeDir = path.join(
      process.env.HOME ?? process.env.USERPROFILE ?? "",
      ".claude",
    );
    const claudeDirExists = await fs
      .access(claudeDir)
      .then(() => true)
      .catch(() => false);

    if (claudeDirExists) {
      console.log(chalk.bold("\n🔧 Claude Code 스킬\n"));
      const skillStatus = await inspectSkill(createSkillManagerContext());
      console.log(`  dooray-cli: ${formatSkillStatus(skillStatus)}`);
      console.log(`  설치 경로:   ${skillStatus.destination}`);
      console.log(`  링크 대상:   ${skillStatus.linkTarget ?? "-"}`);
    }

    // Summary
    console.log();
    if (apiKeyOk && baseUrlOk) {
      console.log(chalk.green("✓ 기본 설정이 완료되었습니다."));
    } else if (config.state === "invalid") {
      console.log(chalk.yellow("⚠ 설정 파일이 손상되었습니다."));
    } else if (config.state === "unreadable") {
      console.log(chalk.yellow("⚠ 설정 파일을 읽지 못했습니다."));
    } else {
      console.log(chalk.yellow("⚠ 설정이 필요합니다:"));
      console.log(chalk.yellow("  dooray setup"));
    }
    console.log();
  });
