import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolveWikiPageInput } from "../../../resolvers/wiki-page-input.js";
import { formatWikiCommentDetail } from "../../../formatters/wiki-comment.js";
import type { OutputOptions } from "../../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import { DoorayCliError } from "../../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../../utils/exit-codes.js";

export interface GetWikiCommentArgs {
  projectArg?: string;
  pageIdArg?: string;
  commentId: string;
  idOpt?: string;
  urlOpt?: string;
  projectOpt?: string;
}

export function parseGetArgs(
  arg1: string | undefined,
  arg2: string | undefined,
  arg3: string | undefined,
  opts: { id?: string; url?: string; commentId?: string; project?: string },
): GetWikiCommentArgs {
  const hasPositional = arg1 !== undefined || arg2 !== undefined || arg3 !== undefined;
  const hasIdUrl = !!(opts.id || opts.url);

  if (hasPositional && hasIdUrl) {
    throw new DoorayCliError(
      "positional 인자와 --id/--url 옵션은 동시에 사용할 수 없습니다.",
      EXIT_PARAM_ERROR,
    );
  }

  if (hasIdUrl) {
    if (!opts.commentId) {
      throw new DoorayCliError(
        "--id/--url 모드에서는 --comment-id 옵션이 필요합니다.",
        EXIT_PARAM_ERROR,
      );
    }
    return {
      commentId: opts.commentId,
      idOpt: opts.id,
      urlOpt: opts.url,
      projectOpt: opts.project,
    };
  }

  if (arg3) {
    if (opts.commentId) {
      throw new DoorayCliError(
        "positional 댓글 ID 와 --comment-id 옵션은 동시에 사용할 수 없습니다.",
        EXIT_PARAM_ERROR,
      );
    }
    return {
      projectArg: arg1,
      pageIdArg: arg2,
      commentId: arg3,
    };
  }

  if (arg1 && arg2 && opts.commentId) {
    return {
      projectArg: arg1,
      pageIdArg: arg2,
      commentId: opts.commentId,
    };
  }

  throw new DoorayCliError(
    "<comment-id>가 필요합니다. positional 3번째 또는 --comment-id 옵션을 사용하세요.",
    EXIT_PARAM_ERROR,
  );
}

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
    const parsed = parseGetArgs(arg1, arg2, arg3, opts);

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
