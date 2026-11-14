import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { createClient } from "../../../api/dooray-client.js";
import {
  resolveWikiPageInput,
  WIKI_PAGE_ID_OPTION_DESC,
  WIKI_PAGE_PROJECT_OPTION_DESC,
} from "../../../resolvers/wiki-page-input.js";
import { openInEditor } from "../../../editor/index.js";
import { readBodyInputOrNull } from "@/body/body-input.js";
import type { OutputOptions } from "../../../formatters/table.js";
import { printJson, printQuiet } from "../../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import { DoorayCliError } from "../../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../../utils/exit-codes.js";

export const wikiPageCommentAddCommand = new Command("add")
  .description("위키 페이지 댓글 추가 (--body 없으면 $EDITOR)")
  .argument("[project]", "프로젝트 코드 (또는 첫 인자에 Dooray Wiki URL)")
  .argument("[page-id]", "위키 페이지 ID")
  .option("--id <pageId>", WIKI_PAGE_ID_OPTION_DESC)
  .option("--url <url>", "Dooray Wiki URL")
  .option("--project <code>", WIKI_PAGE_PROJECT_OPTION_DESC)
  .option("--body <text>", "댓글 본문 (- 입력 시 stdin에서 읽기)")
  .option("--body-file <path>", "본문 파일 경로 (- 입력 시 stdin에서 읽기)")
  .action(async (project, pageIdArg, opts) => {
    if ((opts.id || opts.url) && (project || pageIdArg)) {
      throw new DoorayCliError(
        "positional 인자와 --id/--url 옵션은 동시에 사용할 수 없습니다.",
        EXIT_PARAM_ERROR,
      );
    }

    const globalOpts = wikiPageCommentAddCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = createClient(config);

    const { wikiId, pageId } = await resolveWikiPageInput(client, {
      projectArg: project,
      pageIdArg,
      idOpt: opts.id,
      urlOpt: opts.url,
      project: opts.project,
    });

    let bodyContent = await readBodyInputOrNull(opts);
    if (bodyContent == null) {
      bodyContent = await openInEditor("");
      if (!bodyContent.trim()) {
        process.stdout.write("빈 댓글은 작성할 수 없습니다.\n");
        return;
      }
    }

    startSpinner("댓글 추가 중...");
    try {
      const res = await client.addWikiPageComment(wikiId, pageId, {
        body: { content: bodyContent },
      });
      stopSpinner(true, `댓글 추가 완료 (id: ${res.result.id})`);
      if (globalOpts.json) {
        printJson({ id: res.result.id });
      } else if (globalOpts.quiet) {
        printQuiet([res.result.id]);
      } else {
        process.stdout.write(`댓글이 추가되었습니다: ${res.result.id}\n`);
      }
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
  });
