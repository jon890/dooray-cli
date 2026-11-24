/**
 * `post comment react` — 업무 댓글에 리액션(이모지)을 달거나 뗀다.
 * 공식 API 에 없는 기능이라 저장된 웹 세션을 쓴다. 경로와 실측은 docs/api/web-endpoints/post.md 가 갖는다.
 */
import { Command } from "commander";
import { runWebOnlyCommand } from "@/commands/web-support.js";
import { resolvePostInput } from "../../../resolvers/post-input.js";
import { printJson, type OutputOptions } from "../../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import { DoorayCliError } from "../../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../../utils/exit-codes.js";
import { parseGetArgs, type GetArgs } from "./get.js";

/** 실측으로 달고 뗀 이름. 이 밖의 이름도 웹 이모지 선택기가 쓰는 이름이면 된다. */
export const MEASURED_REACTION_NAMES = [
  "+1", "heart", "smile", "joy", "clap", "pray", "ok_hand", "raised_hands", "tada", "eyes", "white_check_mark", "100",
] as const;

const NAME_PATTERN = /^[a-z0-9_+-]+$/i;

/** `:+1:` 처럼 콜론으로 감싼 이름도 받는다. 이모지 문자는 웹이 거절하므로 요청 전에 막는다. */
export function normalizeReactionName(raw: string): string {
  const name = raw.trim().replace(/^:(.+):$/, "$1");
  if (!NAME_PATTERN.test(name)) {
    throw new DoorayCliError(
      `리액션은 이모지 문자가 아니라 이름으로 줍니다(예: --emoji +1). 받은 값: ${JSON.stringify(raw)}`,
      EXIT_PARAM_ERROR,
    );
  }
  return name;
}

/** get 과 같은 입력 형식에, 첫 positional 에 Dooray URL 을 주는 형식을 더한다. */
export function parseReactArgs(
  arg1: string | undefined,
  arg2: string | undefined,
  arg3: string | undefined,
  opts: { id?: string; url?: string; commentId?: string },
): GetArgs {
  if (arg1 && !arg2 && !arg3 && !opts.id && !opts.url && /^https?:\/\//i.test(arg1)) {
    if (!opts.commentId) {
      throw new DoorayCliError("URL 모드에서는 --comment-id 옵션이 필요합니다.", EXIT_PARAM_ERROR);
    }
    return { projectArg: arg1, commentId: opts.commentId };
  }
  return parseGetArgs(arg1, arg2, arg3, opts);
}

export const commentReactCommand = new Command("react")
  .description(
    "저장된 웹 세션으로 댓글에 리액션(이모지)을 달거나 뗀다. API 키 방식에서도 쓸 수 있다. " +
      "공식 API 문서에 없는 endpoint 라 예고 없이 막힐 수 있다",
  )
  .argument("[arg1]", "프로젝트 코드 / Dooray URL (모드별)")
  .argument("[arg2]", "업무 번호 (모드별)")
  .argument("[arg3]", "댓글 ID (positional 3개 모드)")
  .requiredOption("--emoji <name>", "이모지 이름 (예: +1, heart). 이모지 문자는 받지 않는다")
  .option("--remove", "내가 단 리액션을 뗀다")
  .option("--id <postId>", "Dooray post ID (positional 대신)")
  .option("--url <url>", "Dooray 업무 URL (positional 대신)")
  .option("--comment-id <id>", "댓글 ID (arg3 대신)")
  .addHelpText(
    "after",
    [
      "",
      "이모지 이름:",
      `  실측한 이름: ${MEASURED_REACTION_NAMES.join(", ")}`,
      "  웹 이모지 선택기가 쓰는 이름이면 다른 것도 된다. 별칭은 거절된다(thumbsup 대신 +1).",
      "  한 댓글에 리액션 종류는 10개까지다.",
      "",
      "  API 키 방식에서는 테넌트 이름을 설정하고 dooray config set session-cookie - 로 SESSION 쿠키를 저장한다.",
      "",
      "예:",
      "  dooray post comment react <project> 42 <comment-id> --emoji +1",
      "  dooray post comment react <project> 42 <comment-id> --emoji +1 --remove",
    ].join("\n"),
  )
  .action(async (arg1, arg2, arg3, opts, command: Command) => {
    const parsed = parseReactArgs(arg1, arg2, arg3, opts);
    const emoji = normalizeReactionName(opts.emoji);
    const remove = !!opts.remove;
    const globalOpts = commentReactCommand.optsWithGlobals() as OutputOptions;

    await runWebOnlyCommand(command, async (client, useProjectCache) => {
      startSpinner(remove ? "리액션 떼는 중..." : "리액션 다는 중...");
      try {
        const { projectId, postId } = await resolvePostInput(client, {
          projectArg: parsed.projectArg,
          postNumberArg: parsed.postNumberArg,
          idOpt: parsed.idOpt,
          urlOpt: parsed.urlOpt,
          useProjectCache,
          argv: process.argv.slice(2),
        });
        if (remove) await client.removePostCommentReaction(projectId, postId, parsed.commentId, emoji);
        else await client.addPostCommentReaction(projectId, postId, parsed.commentId, emoji);
        stopSpinner(true, remove ? "리액션 떼기 완료" : "리액션 달기 완료");
      } catch (error) {
        stopSpinner(false);
        throw error;
      }
    });

    if (globalOpts.json) {
      printJson({ commentId: parsed.commentId, emoji, status: remove ? "removed" : "added" });
    } else if (globalOpts.quiet) {
      process.stdout.write(`${parsed.commentId}\n`);
    } else {
      process.stdout.write(`${remove ? "리액션을 뗐습니다" : "리액션을 달았습니다"}: ${emoji} (댓글 ${parsed.commentId})\n`);
    }
  });
