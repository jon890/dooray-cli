import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { createClient } from "../../../api/dooray-client.js";
import {
  resolveWikiPageInput,
  WIKI_PAGE_ID_OPTION_DESC,
  WIKI_PAGE_PROJECT_OPTION_DESC,
} from "../../../resolvers/wiki-page-input.js";
import { formatWikiCommentDetail } from "../../../formatters/wiki-comment.js";
import type { OutputOptions } from "../../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";

export const wikiPageCommentLatestCommand = new Command("latest")
  .description("최신 댓글 1건 조회 (= comment list --latest 1)")
  .argument("[project]", "프로젝트 코드 (또는 첫 인자에 Dooray Wiki URL)")
  .argument("[page-id]", "위키 페이지 ID")
  .option("--id <pageId>", WIKI_PAGE_ID_OPTION_DESC)
  .option("--url <url>", "Dooray Wiki URL")
  .option("--project <code>", WIKI_PAGE_PROJECT_OPTION_DESC)
  .action(async (project, pageIdArg, opts) => {
    const globalOpts = wikiPageCommentLatestCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = createClient(config);

    const { wikiId, pageId } = await resolveWikiPageInput(client, {
      projectArg: project,
      pageIdArg,
      idOpt: opts.id,
      urlOpt: opts.url,
      project: opts.project,
    });

    startSpinner("최신 댓글 조회 중...");
    try {
      const res = await client.getWikiPageComments(wikiId, pageId, { size: 1, page: 0 });
      stopSpinner(true, res.result.length > 0 ? "최신 댓글" : "댓글 없음");
      if (res.result.length === 0) {
        process.stdout.write("댓글이 없습니다.\n");
        return;
      }
      formatWikiCommentDetail(res.result[0]!, globalOpts);
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
  });
