import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolvePostInput } from "../../../resolvers/post-input.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import { DoorayCliError } from "../../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../../utils/exit-codes.js";
import {
  authorizeDeletion,
  promptDeletion,
} from "../../../utils/delete-confirmation.js";

export const commentDeleteCommand = new Command("delete")
  .description("댓글 삭제")
  .argument("[arg1]", "프로젝트 코드 / Dooray URL / 댓글 ID (모드별)")
  .argument("[arg2]", "업무 번호 또는 댓글 ID (모드별)")
  .argument("[arg3]", "댓글 ID (positional 3개 모드)")
  .option("--id <postId>", "Dooray post ID (project/post-number 대신)")
  .option("--url <url>", "Dooray 업무 URL (project/post-number 대신)")
  .option("--comment-id <commentId>", "댓글 ID (positional 대체)")
  .option("-y, --yes", "확인 없이 삭제 (자동화용)")
  .action(async (arg1, arg2, arg3, opts) => {
    const confirmed = await authorizeDeletion(
      !!opts.yes,
      !!process.stdin.isTTY,
      () => promptDeletion("업무 댓글을 영구 삭제할까요?"),
    );
    if (!confirmed) {
      process.stderr.write("취소되었습니다.\n");
      return;
    }

    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    let projectArg: string | undefined;
    let postNumberArg: string | undefined;
    let commentId: string | undefined = opts.commentId;

    if (opts.id || opts.url) {
      // 옵션 모드: arg1 = comment-id (있다면), arg2/arg3은 비어야 함
      if (arg2 || arg3) {
        throw new DoorayCliError(
          "--id/--url 모드에서는 댓글 ID 외 추가 positional 인자를 받지 않습니다. --comment-id 옵션 사용을 권장합니다.",
          EXIT_PARAM_ERROR,
        );
      }
      commentId = commentId ?? arg1;
    } else if (arg3) {
      // positional 3개 모드 (legacy): project + post-number + comment-id
      projectArg = arg1;
      postNumberArg = arg2;
      commentId = commentId ?? arg3;
    } else if (arg1 && !arg2) {
      // positional 1개 — URL positional 모드
      projectArg = arg1;
      if (!commentId) {
        throw new DoorayCliError(
          "URL/--id 모드에서는 --comment-id 옵션이 필요합니다.",
          EXIT_PARAM_ERROR,
        );
      }
    } else {
      // positional 2개 — project + post-number, comment-id는 옵션 필수
      projectArg = arg1;
      postNumberArg = arg2;
      if (!commentId) {
        throw new DoorayCliError(
          "<comment-id>가 필요합니다. positional 3번째 또는 --comment-id 옵션을 사용하세요.",
          EXIT_PARAM_ERROR,
        );
      }
    }

    if (!commentId) {
      throw new DoorayCliError(
        "<comment-id>가 필요합니다.",
        EXIT_PARAM_ERROR,
      );
    }

    startSpinner("댓글 삭제 중...");
    const { projectId, postId } = await resolvePostInput(client, {
      projectArg,
      postNumberArg,
      idOpt: opts.id,
      urlOpt: opts.url,
    });
    await client.deletePostComment(projectId, postId, commentId);
    stopSpinner(true, "댓글 삭제 완료");

    process.stdout.write(`댓글이 삭제되었습니다: ${commentId}\n`);
  });
