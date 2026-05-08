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

/** delete / download 명령이 공용으로 쓰는 fileId 라벨 (PR #47 review 4번 — 중복 리터럴 제거) */
export const FILE_ID_SECONDARY_LABEL: CommentFileSecondaryLabel = {
  positional: "4번째",
  option: "--file-id",
  identifier: "<fileId>",
};

interface CommentFileInputBaseArgs {
  arg1?: string;
  arg2?: string;
  arg3?: string;
  arg4?: string;
  idOpt?: string;
  urlOpt?: string;
  commentIdOpt?: string;
  /** secondary positional 의 옵션 폴백 (file path / fileId 중 명령마다 다름) */
  secondaryOpt?: string;
}

/**
 * 호출자별 secondary 필수 여부에 따라 secondaryLabel 강제. discriminated union 으로
 * `requireSecondary: true` 시 라벨 누락을 컴파일 타임에 차단 (PR #47 review 1번).
 */
export type CommentFileInputArgs =
  | (CommentFileInputBaseArgs & { requireSecondary: false })
  | (CommentFileInputBaseArgs & {
      requireSecondary: true;
      secondaryLabel: CommentFileSecondaryLabel;
    });

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

/**
 * `requireSecondary: true` 호출은 `secondary: string` 으로 좁혀서
 * 호출부 non-null 단언(`!`)을 제거 (PR #47 review 2번).
 */
export type CommentFilePositionalRequiredResult = CommentFilePositionalResult & {
  secondary: string;
};
export type CommentFileInputRequiredResult = CommentFileInputResult & {
  secondary: string;
};

function assertNonEmpty(value: string, fieldName: string): void {
  if (value.trim() === "") {
    throw new DoorayCliError(
      `${fieldName} 가 비어 있습니다.`,
      EXIT_PARAM_ERROR,
    );
  }
}

function parseImpl(args: CommentFileInputArgs): CommentFilePositionalResult {
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
  assertNonEmpty(commentId, "<comment-id>");

  if (args.requireSecondary) {
    if (!secondary) {
      const { identifier, positional, option } = args.secondaryLabel;
      throw new DoorayCliError(
        `${identifier} 가 필요합니다. positional ${positional} 또는 ${option} 옵션을 사용하세요.`,
        EXIT_PARAM_ERROR,
      );
    }
    assertNonEmpty(secondary, args.secondaryLabel.identifier);
  } else if (secondary !== undefined) {
    assertNonEmpty(secondary, "<secondary>");
  }

  return { projectArg, postNumberArg, commentId, secondary };
}

/** 분기 로직 pure 헬퍼 — client 호출 없이 단위 테스트 가능. */
export function parseCommentFilePositional(
  args: CommentFileInputBaseArgs & {
    requireSecondary: true;
    secondaryLabel: CommentFileSecondaryLabel;
  },
): CommentFilePositionalRequiredResult;
export function parseCommentFilePositional(
  args: CommentFileInputBaseArgs & { requireSecondary: false },
): CommentFilePositionalResult;
export function parseCommentFilePositional(
  args: CommentFileInputArgs,
): CommentFilePositionalResult {
  return parseImpl(args);
}

export function resolveCommentFileInput(
  client: DoorayApiClient,
  args: CommentFileInputBaseArgs & {
    requireSecondary: true;
    secondaryLabel: CommentFileSecondaryLabel;
  },
): Promise<CommentFileInputRequiredResult>;
export function resolveCommentFileInput(
  client: DoorayApiClient,
  args: CommentFileInputBaseArgs & { requireSecondary: false },
): Promise<CommentFileInputResult>;
export async function resolveCommentFileInput(
  client: DoorayApiClient,
  args: CommentFileInputArgs,
): Promise<CommentFileInputResult> {
  const { projectArg, postNumberArg, commentId, secondary } = parseImpl(args);

  const { projectId, postId } = await resolvePostInput(client, {
    projectArg,
    postNumberArg,
    idOpt: args.idOpt,
    urlOpt: args.urlOpt,
  });

  return { projectId, postId, commentId, secondary };
}
