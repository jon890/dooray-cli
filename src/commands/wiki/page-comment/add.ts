import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolveWikiPageInput } from "../../../resolvers/wiki-page-input.js";
import { openInEditor } from "../../../editor/index.js";
import { readBodyInputOrNull } from "../../../utils/body-input.js";
import type { OutputOptions } from "../../../formatters/table.js";
import { printJson, printQuiet } from "../../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";

export const wikiPageCommentAddCommand = new Command("add")
  .description("위키 페이지 댓글 추가 (--body 없으면 $EDITOR)")
  .argument("[project]", "프로젝트 코드 (또는 첫 인자에 Dooray Wiki URL)")
  .argument("[page-id]", "위키 페이지 ID")
  .option("--id <pageId>", "위키 페이지 ID (--project 동반)")
  .option("--url <url>", "Dooray Wiki URL")
  .option("--project <code>", "프로젝트 코드 (--id 모드용)")
  .option("--body <text>", "댓글 본문 (- 입력 시 stdin에서 읽기)")
  .option("--body-file <path>", "본문 파일 경로 (- 입력 시 stdin에서 읽기)")
  .action(async (project, pageIdArg, opts) => {
    const globalOpts = wikiPageCommentAddCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    let bodyContent = await readBodyInputOrNull(opts);
    if (bodyContent == null) {
      bodyContent = await openInEditor("");
      if (!bodyContent.trim()) {
        process.stdout.write("빈 댓글은 작성할 수 없습니다.\n");
        return;
      }
    }

    const { wikiId, pageId } = await resolveWikiPageInput(client, {
      projectArg: project,
      pageIdArg,
      idOpt: opts.id,
      urlOpt: opts.url,
      project: opts.project,
    });

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
