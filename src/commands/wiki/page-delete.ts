import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolveWikiPageInput } from "../../resolvers/wiki-page-input.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import type { OutputOptions } from "../../formatters/table.js";
import { emitDeleteResult } from "../../formatters/file-output.js";

export const wikiPageDeleteCommand = new Command("delete")
  .description("위키 페이지 삭제 (비공식 endpoint)")
  .argument("[arg1]", "프로젝트 코드, Dooray Wiki URL, 또는 (`--id`/`--url` 모드일 때) 미사용")
  .argument("[arg2]", "page-id (positional 2개 모드)")
  .option("--id <pageId>", "위키 페이지 ID")
  .option("--url <url>", "Dooray Wiki URL")
  .option("--project <code>", "프로젝트 코드 (--id 모드에서 wikiId 해석용)")
  .option("-y, --yes", "확인 없이 삭제 (자동화용)")
  .action(async (arg1, arg2, opts) => {
    const globalOpts = wikiPageDeleteCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    // resolveWikiPageInput 을 confirm/spinner 보다 먼저 호출 (validation-before-spinner)
    const { wikiId, pageId } = await resolveWikiPageInput(client, {
      projectArg: arg1,
      pageIdArg: arg2,
      idOpt: opts.id,
      urlOpt: opts.url,
      project: opts.project,
    });

    if (!opts.yes) {
      if (!process.stdin.isTTY) {
        throw new DoorayCliError(
          "non-TTY 환경에서는 확인 없이 삭제할 수 없습니다. --yes(-y) 플래그로 다시 실행하세요.",
          EXIT_PARAM_ERROR,
        );
      }
      const { confirm } = await import("@inquirer/prompts");
      const ok = await confirm({
        message: `페이지(${pageId})를 삭제할까요? 하위 페이지가 있으면 상위 페이지로 재부착됩니다.`,
        default: false,
      });
      if (!ok) {
        // 취소는 삭제 미수행 — 머신 모드(--json/--quiet)에는 성공 출력을 내지 않는다 (파싱 오염 방지).
        if (!globalOpts.json && !globalOpts.quiet) {
          process.stdout.write("취소되었습니다.\n");
        }
        return;
      }
    }

    startSpinner("페이지 삭제 중...");
    try {
      await client.deleteWikiPage(wikiId, pageId);
      stopSpinner(true, "삭제 완료");

      emitDeleteResult(globalOpts, {
        id: pageId,
        jsonKey: "pageId",
        message: `페이지(${pageId})가 삭제되었습니다.`,
      });
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
  });
