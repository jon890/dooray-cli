import { Command } from "commander";
import chalk from "chalk";
import { clearMailCredentials } from "../../config/store.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

export async function authorizeMailLogout(
  skipConfirmation: boolean,
  isTTY: boolean,
  confirmRemoval: () => Promise<boolean>,
): Promise<boolean> {
  if (skipConfirmation) return true;
  if (!isTTY) {
    throw new DoorayCliError(
      "non-TTY 환경에서는 확인 없이 메일 인증정보를 제거할 수 없습니다. --yes(-y) 플래그로 다시 실행하세요.",
      EXIT_PARAM_ERROR,
    );
  }
  return confirmRemoval();
}

export const mailLogoutCommand = new Command("logout")
  .description("저장된 메일 인증정보 제거")
  .option("-y, --yes", "확인 없이 인증정보 제거 (자동화용)")
  .action(async (opts) => {
    const confirmed = await authorizeMailLogout(
      !!opts.yes,
      !!process.stdin.isTTY,
      async () => {
        const { confirm } = await import("@inquirer/prompts");
        return confirm({
          message: "저장된 IMAP 사용자명과 앱 비밀번호를 제거할까요?",
          default: false,
        });
      },
    );
    if (!confirmed) {
      process.stdout.write("취소되었습니다.\n");
      return;
    }

    const removed = await clearMailCredentials();
    process.stdout.write(
      removed
        ? chalk.green("✓ 메일 인증정보를 제거했습니다.\n")
        : "저장된 메일 인증정보가 없습니다.\n",
    );
  });
