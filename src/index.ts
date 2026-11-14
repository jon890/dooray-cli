import { Command } from "commander";
import chalk from "chalk";
import { configCommand } from "./commands/config.js";
import { cacheCommand } from "./commands/cache.js";
import { doctorCommand } from "./commands/doctor.js";
import { setupCommand } from "./commands/setup.js";
import { skillCommand } from "./commands/skill.js";
import { memberCommand } from "./commands/member/index.js";
import { projectCommand } from "@/commands/project/index.js";
import { postCommand } from "@/commands/post/index.js";
import { wikiCommand } from "@/commands/wiki/index.js";
import { mailCommand } from "@/commands/mail/index.js";
import { messengerCommand } from "./commands/messenger/index.js";
import { streamCommand } from "./commands/stream/index.js";
import { calendarCommand } from "./commands/calendar/index.js";
import { feedbackCommand } from "@/commands/feedback/index.js";
import { DoorayCliError } from "./utils/errors.js";
import { sanitizeArgv } from "./utils/argv-sanitize.js";
import { attachUsageHint } from "./utils/unknown-option-hint.js";
import { setQuiet } from "./utils/spinner.js";
import { writeLastRun } from "./cache/last-run.js";
import { getConfig, readAuthModeFromFile } from "./config/store.js";
import { guardWebCommand } from "./commands/web-support.js";
import { CLI_VERSION } from "@/version.js";

const program = new Command();

program
  .name("dooray")
  .description("Dooray REST API CLI")
  .version(CLI_VERSION)
  .option("--json", "JSON 형식으로 출력")
  .option("--quiet", "ID만 출력")
  .option("--no-color", "색상 비활성화");

// --no-color 처리: chalk 비활성화. --json / --quiet 모드에서 spinner 비활성화
program.hook("preAction", async (_thisCommand, actionCommand) => {
  const opts = program.opts();
  if (opts.color === false || process.env.NO_COLOR) {
    chalk.level = 0;
  }
  if (opts.json || opts.quiet) {
    setQuiet(true);
  }
  await guardWebCommand(actionCommand, readAuthModeFromFile);
});

program.addCommand(setupCommand);
program.addCommand(skillCommand);
program.addCommand(configCommand);
program.addCommand(memberCommand);
program.addCommand(cacheCommand);
program.addCommand(doctorCommand);
program.addCommand(projectCommand);
program.addCommand(postCommand);
program.addCommand(wikiCommand);
program.addCommand(mailCommand);
program.addCommand(messengerCommand);
program.addCommand(streamCommand);
program.addCommand(calendarCommand);
program.addCommand(feedbackCommand);

// ADR-058: 등록이 끝난 뒤 명령 나무 전체에 오류 안내 후크를 건다.
attachUsageHint(program, "");

program.parseAsync().catch(async (err) => {
  const errorMessage = err instanceof Error ? err.message : String(err);
  const exitCode = err instanceof DoorayCliError ? err.exitCode : 1;

  // last-run 기록 (best-effort, opt-in, feedback 명령은 제외)
  try {
    const config = await getConfig();
    const sanitized = sanitizeArgv(process.argv.slice(2));
    const firstNonFlag = sanitized.find((a) => !a.startsWith("-"));
    const isFeedbackCommand = firstNonFlag === "feedback";
    // last-run 기록은 완성된 설정에서만 의미가 있어 ok 상태만 사용한다.
    if (
      config.state === "ok" &&
      config.config.trackLastRun &&
      !isFeedbackCommand
    ) {
      await writeLastRun({
        argv: ["dooray", ...sanitized],
        exitCode,
        errorMessage,
        timestamp: new Date().toISOString(),
      });
    }
  } catch {
    // last-run 기록 실패는 무시 — 원래 에러 마스킹 금지
  }

  process.stderr.write(chalk.red(`오류: ${errorMessage}`) + "\n");
  process.exit(exitCode);
});
