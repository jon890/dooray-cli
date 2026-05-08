import { DoorayApiClient } from "../api/client.js";
import { resolvePostInput } from "./post-input.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

export interface CommentFileSecondaryLabel {
  /** positional 위치 설명 — 예: "4번째" */
  positional: string;
  /** 옵션 이름 — 예: "--file", "--file-id" */
  option: string;
  /** 식별자 표기 — 예: "<path>", "<fileId>" */
  identifier: string;
}

export interface CommentFileInputArgs {
  // positional 4 인자 원본 (action 의 arg1~arg4)
  arg1?: string;
  arg2?: string;
  arg3?: string;
  arg4?: string;
  // 옵션
  idOpt?: string;
  urlOpt?: string;
  commentIdOpt?: string;
  // secondary positional 의 옵션 폴백 (file path / fileId 중 명령마다 다름)
  secondaryOpt?: string;
  // secondary 인자가 필수인지 (list = false, upload/download/delete = true)
  requireSecondary: boolean;
  // 누락 시 에러 메시지에 들어갈 caller-specific 라벨 (requireSecondary=true 일 때 필수)
  secondaryLabel?: CommentFileSecondaryLabel;
}

export interface CommentFilePositionalResult {
  projectArg?: string;
  postNumberArg?: string;
  commentId: string;
  secondary?: string;
}

export interface CommentFileInputResult {
  projectId: string;
  postId: string;
  commentId: string;
  secondary?: string;
}

/** 분기 로직 pure 헬퍼 — client 호출 없이 단위 테스트 가능. */
export function parseCommentFilePositional(
  args: CommentFileInputArgs,
): CommentFilePositionalResult {
  const isOptionMode = !!(args.idOpt || args.urlOpt);

  let projectArg: string | undefined;
  let postNumberArg: string | undefined;
  let commentId: string | undefined = args.commentIdOpt;
  let secondary: string | undefined = args.secondaryOpt;

  if (isOptionMode) {
    // 옵션 모드: positional 은 (commentId, secondary) 순으로 폴백
    if (!commentId) commentId = args.arg1;
    if (!secondary) secondary = args.arg2;
    if (args.arg3 || args.arg4) {
      throw new DoorayCliError(
        "--id/--url 모드에서는 추가 positional 인자가 허용되지 않습니다.",
        EXIT_PARAM_ERROR,
      );
    }
  } else {
    // positional 모드: <project> <post-number> <comment-id> [<secondary>]
    projectArg = args.arg1;
    postNumberArg = args.arg2;
    if (!commentId) commentId = args.arg3;
    if (!secondary) secondary = args.arg4;
  }

  if (!commentId) {
    throw new DoorayCliError(
      "<comment-id> 가 필요합니다. positional 3번째 또는 --comment-id 옵션을 사용하세요.",
      EXIT_PARAM_ERROR,
    );
  }
  if (args.requireSecondary && !secondary) {
    const label = args.secondaryLabel;
    const msg = label
      ? `${label.identifier} 가 필요합니다. positional ${label.positional} 또는 ${label.option} 옵션을 사용하세요.`
      : "secondary positional 이 필요합니다.";
    throw new DoorayCliError(msg, EXIT_PARAM_ERROR);
  }

  return { projectArg, postNumberArg, commentId, secondary };
}

export async function resolveCommentFileInput(
  client: DoorayApiClient,
  args: CommentFileInputArgs,
): Promise<CommentFileInputResult> {
  const { projectArg, postNumberArg, commentId, secondary } =
    parseCommentFilePositional(args);

  const { projectId, postId } = await resolvePostInput(client, {
    projectArg,
    postNumberArg,
    idOpt: args.idOpt,
    urlOpt: args.urlOpt,
  });

  return { projectId, postId, commentId, secondary };
}
