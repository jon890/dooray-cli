import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolveWikiPageInput } from "../../../resolvers/wiki-page-input.js";
import { formatWikiCommentList } from "../../../formatters/wiki-comment.js";
import type { OutputOptions } from "../../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";

export const wikiPageCommentListCommand = new Command("list")
  .description("위키 페이지 댓글 목록 조회 (최신순)")
  .argument("[project]", "프로젝트 코드 (또는 첫 인자에 Dooray Wiki URL)")
  .argument("[page-id]", "위키 페이지 ID")
  .option("--id <pageId>", "위키 페이지 ID (--project 동반)")
  .option("--url <url>", "Dooray Wiki URL")
  .option("--project <code>", "프로젝트 코드 (--id 모드용)")
  .option("--size <n>", "페이지 크기 (기본 20, 최대 100)", (v) => parseInt(v, 10))
  .option("--page <n>", "페이지 번호 (0부터)", (v) => parseInt(v, 10))
  .option("--latest <n>", "최신 N개만 (size 대신 사용)", (v) => parseInt(v, 10))
  .action(async (project, pageIdArg, opts) => {
    const globalOpts = wikiPageCommentListCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    const { wikiId, pageId } = await resolveWikiPageInput(client, {
      projectArg: project,
      pageIdArg,
      idOpt: opts.id,
      urlOpt: opts.url,
      project: opts.project,
    });

    const size = opts.latest ?? opts.size ?? 20;
    const page = opts.page ?? 0;

    startSpinner("댓글 목록 조회 중...");
    try {
      const res = await client.getWikiPageComments(wikiId, pageId, { size, page });
      stopSpinner(true, `댓글 ${res.result.length}건 (총 ${res.totalCount})`);
      formatWikiCommentList(res.result, { globalOpts, totalCount: res.totalCount });
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
  });
