import { Command } from "commander";
import chalk from "chalk";
import { CACHE_DIR, clearCache } from "../cache/store.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_IO_ERROR } from "../utils/exit-codes.js";

/**
 * 캐시를 지우고 지운 것이 있었는지 돌려준다.
 *
 * 삭제 실패는 에러로 노출한다. `cache clear` 는 사용자가 명시적으로 요청한 작업이라
 * 지우지 못했는데 성공 메시지를 내면 잘못된 캐시가 남은 것을 모르게 된다 (ADR-042).
 * `services/config.ts` 의 무효화는 부수 작업이라 경고만 내는 것과 갈린다.
 */
async function clearOrThrow(): Promise<boolean> {
  try {
    return await clearCache();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new DoorayCliError(
      `캐시를 삭제하지 못했습니다: ${msg}\n경로: ${CACHE_DIR}`,
      EXIT_IO_ERROR,
    );
  }
}

function fail(err: unknown): never {
  if (err instanceof DoorayCliError) {
    console.error(chalk.red(err.message));
    process.exit(err.exitCode);
  }
  throw err;
}

export const cacheCommand = new Command("cache")
  .description("캐시 관리");

cacheCommand
  .command("clear")
  .description("캐시 전체 삭제")
  .action(async () => {
    try {
      const cleared = await clearOrThrow();
      // 지울 것이 없었던 경우는 실패가 아니다. 사용자가 원한 상태가 이미 이뤄져 있다.
      console.log(
        cleared
          ? chalk.green("✓ 캐시가 삭제되었습니다.")
          : chalk.gray("지울 캐시가 없습니다."),
      );
    } catch (err) {
      fail(err);
    }
  });

cacheCommand
  .command("refresh")
  .description("캐시 갱신 (API 클라이언트 연동 후 지원 예정)")
  .action(async () => {
    try {
      const cleared = await clearOrThrow();
      console.log(
        chalk.yellow(
          cleared
            ? "캐시를 삭제했습니다. API 클라이언트 연동 후 자동 갱신이 지원됩니다."
            : "지울 캐시가 없습니다. API 클라이언트 연동 후 자동 갱신이 지원됩니다.",
        ),
      );
    } catch (err) {
      fail(err);
    }
  });
