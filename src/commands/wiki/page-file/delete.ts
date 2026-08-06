import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolveWikiPageInput } from "../../../resolvers/wiki-page-input.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import { DoorayCliError } from "../../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../../utils/exit-codes.js";
import {
  authorizeDeletion,
  promptDeletion,
} from "../../../utils/delete-confirmation.js";
import type { OutputOptions } from "../../../formatters/table.js";
import { emitDeleteResult } from "../../../formatters/file-output.js";

export const wikiPageFileDeleteCommand = new Command("delete")
  .description("위키 페이지 첨부파일 삭제")
  .argument("[arg1]", "프로젝트 코드, Dooray Wiki URL, 또는 (`--id`/`--url` 모드일 때) 파일 ID")
  .argument("[arg2]", "page-id 또는 (`--id`/`--url` 모드일 때) 파일 ID")
  .argument("[arg3]", "파일 ID (positional 3개 모드)")
  .option("--id <pageId>", "위키 페이지 ID")
  .option("--url <url>", "Dooray Wiki URL")
  .option("--project <code>", "프로젝트 코드 (--id 모드에서 wikiId 해석용)")
  .option("--file-id <fileId>", "파일 ID (positional 대체)")
  .option("-y, --yes", "확인 없이 삭제 (자동화용)")
  .action(async (arg1, arg2, arg3, opts) => {
    const confirmed = await authorizeDeletion(
      !!opts.yes,
      !!process.stdin.isTTY,
      () => promptDeletion("위키 페이지의 첨부 파일을 영구 삭제할까요?"),
    );
    if (!confirmed) {
      process.stderr.write("취소되었습니다.\n");
      return;
    }

    const globalOpts = wikiPageFileDeleteCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    let projectArg: string | undefined;
    let pageIdArg: string | undefined;
    let fileId: string | undefined = opts.fileId;

    if (opts.id || opts.url) {
      if (arg2 || arg3) {
        throw new DoorayCliError(
          "--id/--url 모드에서는 파일 ID 외 추가 positional 인자를 받지 않습니다. --file-id 옵션 사용을 권장합니다.",
          EXIT_PARAM_ERROR,
        );
      }
      fileId = fileId ?? arg1;
    } else if (arg3) {
      projectArg = arg1;
      pageIdArg = arg2;
      fileId = fileId ?? arg3;
    } else if (arg1 && !arg2) {
      projectArg = arg1;
      if (!fileId) {
        throw new DoorayCliError(
          "URL/--id 모드에서는 --file-id 옵션이 필요합니다.",
          EXIT_PARAM_ERROR,
        );
      }
    } else {
      projectArg = arg1;
      pageIdArg = arg2;
      if (!fileId) {
        throw new DoorayCliError(
          "<file-id>가 필요합니다. positional 3번째 또는 --file-id 옵션을 사용하세요.",
          EXIT_PARAM_ERROR,
        );
      }
    }

    if (!fileId) {
      throw new DoorayCliError("파일 ID가 필요합니다.", EXIT_PARAM_ERROR);
    }

    // resolveWikiPageInput 을 startSpinner 보다 먼저 호출 (1-1 회피)
    const { wikiId, pageId } = await resolveWikiPageInput(client, {
      projectArg,
      pageIdArg,
      idOpt: opts.id,
      urlOpt: opts.url,
      project: opts.project,
    });

    startSpinner("파일 삭제 중...");
    try {
      await client.deleteWikiPageFile(wikiId, pageId, fileId);
      stopSpinner(true, "삭제 완료");

      // ADR-031: --json / --quiet / plain 3 모드 분기
      emitDeleteResult(globalOpts, { id: fileId });
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
  });
