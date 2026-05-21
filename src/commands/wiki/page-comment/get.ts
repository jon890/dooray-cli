import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolveWikiPageInput } from "../../../resolvers/wiki-page-input.js";
import { formatWikiCommentDetail } from "../../../formatters/wiki-comment.js";
import type { OutputOptions } from "../../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import { parseWikiCommentArgs } from "./parse-args.js";

export const wikiPageCommentGetCommand = new Command("get")
  .description("단일 댓글 조회")
  .argument("[arg1]", "프로젝트 코드 / Dooray Wiki URL (모드별)")
  .argument("[arg2]", "위키 페이지 ID (모드별)")
  .argument("[arg3]", "댓글 ID (positional 3개 모드)")
  .option("--id <pageId>", "위키 페이지 ID (positional 대신)")
  .option("--url <url>", "Dooray Wiki URL (positional 대신)")
  .option("--project <code>", "프로젝트 코드 (--id 모드용)")
  .option("--comment-id <id>", "댓글 ID (arg3 대신)")
  .action(async (arg1, arg2, arg3, opts) => {
    const parsed = parseWikiCommentArgs(arg1, arg2, arg3, opts);

    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);
    const globalOpts = wikiPageCommentGetCommand.optsWithGlobals() as OutputOptions;

    const { wikiId, pageId } = await resolveWikiPageInput(client, {
      projectArg: parsed.projectArg,
      pageIdArg: parsed.pageIdArg,
      idOpt: parsed.idOpt,
      urlOpt: parsed.urlOpt,
      project: parsed.projectOpt,
    });

    startSpinner("댓글 조회 중...");
    try {
      const detail = await client.getWikiPageComment(wikiId, pageId, parsed.commentId);
      stopSpinner(true, "댓글 조회 완료");
      formatWikiCommentDetail(detail.result, globalOpts);
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
  });
