import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolvePostInput } from "../../../resolvers/post-input.js";
import { buildMemberNameMap } from "../../../resolvers/member.js";
import { enrichCommentCreators } from "../../../utils/comment-enrich.js";
import { formatCommentDetail } from "../../../formatters/comment.js";
import type { OutputOptions } from "../../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import { DoorayCliError } from "../../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../../utils/exit-codes.js";

export interface GetArgs {
  projectArg?: string;
  postNumberArg?: string;
  commentId: string;
  idOpt?: string;
  urlOpt?: string;
}

/**
 * argv 분기 결정 순수 함수 — action 분리로 단위 테스트 가능
 */
export function parseGetArgs(
  arg1: string | undefined,
  arg2: string | undefined,
  arg3: string | undefined,
  opts: { id?: string; url?: string; commentId?: string },
): GetArgs {
  const hasPositional = arg1 !== undefined || arg2 !== undefined || arg3 !== undefined;
  const hasIdUrl = !!(opts.id || opts.url);

  // 충돌 검증: positional + --id/--url 동시 입력
  if (hasPositional && hasIdUrl) {
    throw new DoorayCliError(
      "positional 인자와 --id/--url 옵션은 동시에 사용할 수 없습니다.",
      EXIT_PARAM_ERROR,
    );
  }

  if (hasIdUrl) {
    // --id/--url 모드: --comment-id 필수
    if (!opts.commentId) {
      throw new DoorayCliError(
        "--id/--url 모드에서는 --comment-id 옵션이 필요합니다.",
        EXIT_PARAM_ERROR,
      );
    }
    return { commentId: opts.commentId, idOpt: opts.id, urlOpt: opts.url };
  }

  if (arg3) {
    // positional 3개 모드: project + post-number + comment-id
    return {
      projectArg: arg1,
      postNumberArg: arg2,
      commentId: opts.commentId ?? arg3,
    };
  }

  // --comment-id + 2 positional (project + post-number)
  if (arg1 && arg2 && opts.commentId) {
    return {
      projectArg: arg1,
      postNumberArg: arg2,
      commentId: opts.commentId,
    };
  }

  throw new DoorayCliError(
    "<comment-id>가 필요합니다. positional 3번째 또는 --comment-id 옵션을 사용하세요.",
    EXIT_PARAM_ERROR,
  );
}

export const commentGetCommand = new Command("get")
  .description("단일 댓글 본문 + 메타 + attachments 조회")
  .argument("[arg1]", "프로젝트 코드 / Dooray URL (모드별)")
  .argument("[arg2]", "업무 번호 (모드별)")
  .argument("[arg3]", "댓글 ID (positional 3개 모드)")
  .option("--id <postId>", "Dooray post ID (positional 대신)")
  .option("--url <url>", "Dooray 업무 URL (positional 대신)")
  .option("--comment-id <id>", "댓글 ID (arg3 대신)")
  .action(async (arg1, arg2, arg3, opts) => {
    const parsed = parseGetArgs(arg1, arg2, arg3, opts);

    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);
    const globalOpts = commentGetCommand.optsWithGlobals() as OutputOptions;

    startSpinner("댓글 조회 중...");
    const { projectId, postId } = await resolvePostInput(client, {
      projectArg: parsed.projectArg,
      postNumberArg: parsed.postNumberArg,
      idOpt: parsed.idOpt,
      urlOpt: parsed.urlOpt,
    });

    const detail = await client.getPostComment(projectId, postId, parsed.commentId);
    let comment = detail.result;
    stopSpinner(true, "댓글 조회 완료");

    if (!globalOpts.json) {
      // table/quiet 모드만 enrich — --json 은 raw 유지 (comment list 와 동일 정책)
      const nameMap = await buildMemberNameMap(client, projectId);
      comment = enrichCommentCreators([comment], nameMap)[0]!;
    }

    formatCommentDetail(comment, globalOpts);
  });
