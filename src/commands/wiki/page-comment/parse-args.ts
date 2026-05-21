import { DoorayCliError } from "../../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../../utils/exit-codes.js";

export interface WikiCommentArgs {
  projectArg?: string;
  pageIdArg?: string;
  commentId: string;
  idOpt?: string;
  urlOpt?: string;
  projectOpt?: string;
}

export function parseWikiCommentArgs(
  arg1: string | undefined,
  arg2: string | undefined,
  arg3: string | undefined,
  opts: { id?: string; url?: string; commentId?: string; project?: string },
): WikiCommentArgs {
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
