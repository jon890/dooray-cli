import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolveWikiPageInput } from "../../resolvers/wiki-page-input.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import {
  authorizeDeletion,
  promptDeletion,
} from "../../utils/delete-confirmation.js";
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
    const confirmed = await authorizeDeletion(
      !!opts.yes,
      !!process.stdin.isTTY,
      () =>
        promptDeletion(
          "위키 페이지를 삭제할까요? 하위 페이지가 있으면 삭제한 페이지의 부모 아래로 재부착됩니다.",
        ),
    );
    if (!confirmed) {
      process.stderr.write("취소되었습니다.\n");
      return;
    }

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
