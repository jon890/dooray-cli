import { Command } from "commander";
import { getConfigOrThrow } from "../../../../config/store.js";
import { DoorayApiClient } from "../../../../api/client.js";
import {
  resolveCommentFileInput,
  FILE_ID_SECONDARY_LABEL,
} from "../../../../resolvers/comment-file-input.js";
import { startSpinner, stopSpinner } from "../../../../utils/spinner.js";
import { DoorayCliError } from "../../../../utils/errors.js";
import { EXIT_API_ERROR } from "../../../../utils/exit-codes.js";
import { removeFileReference } from "../../../../utils/comment-files.js";

export const deleteCommentFileCommand = new Command("delete")
  .description("댓글 첨부 파일 삭제 (댓글 본문 reference 제거 + 파일 삭제, ADR-024)")
  .argument("[arg1]", "프로젝트 코드, Dooray URL, 또는 (`--id`/`--url` 모드일 때) 댓글 ID")
  .argument("[arg2]", "업무 번호 또는 (`--id`/`--url` 모드일 때) 파일 ID")
  .argument("[arg3]", "댓글 ID (positional 모드)")
  .argument("[arg4]", "파일 ID (positional 모드)")
  .option("--id <postId>", "Dooray post ID (project/post-number 대신)")
  .option("--url <url>", "Dooray 업무 URL (project/post-number 대신)")
  .option("--comment-id <logId>", "댓글 ID (positional 대체)")
  .option("--file-id <fileId>", "파일 ID (positional 대체)")
  .option("--yes", "확인 없이 삭제")
  .action(async (arg1, arg2, arg3, arg4, opts) => {
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    const { projectId, postId, commentId, secondary: fileId } = await resolveCommentFileInput(client, {
      arg1, arg2, arg3, arg4,
      idOpt: opts.id,
      urlOpt: opts.url,
      commentIdOpt: opts.commentId,
      secondaryOpt: opts.fileId,
      requireSecondary: true,
      secondaryLabel: FILE_ID_SECONDARY_LABEL,
    });

    if (!opts.yes) {
      const { confirm } = await import("@inquirer/prompts");
      const ok = await confirm({
        message: `댓글 본문에서 reference 를 제거하고 파일(${fileId})을 삭제합니다. 같은 post 의 다른 댓글에서 같은 파일 ID 를 참조하는 경우 broken 됩니다. 계속하시겠습니까?`,
      });
      if (!ok) {
        process.stdout.write("취소되었습니다.\n");
        return;
      }
    }

    // Step 1: 댓글 본문에서 reference 제거
    startSpinner("댓글 본문 reference 제거 중...");
    try {
      const commentRes = await client.getPostComment(projectId, postId, commentId);
      const currentBody = commentRes.result.body.content;
      const newBody = removeFileReference(currentBody, fileId);
      await client.updatePostComment(projectId, postId, commentId, {
        body: { mimeType: "text/x-markdown", content: newBody },
      });
      stopSpinner(true, "reference 제거 완료");
    } catch {
      stopSpinner(false, "");
      throw new DoorayCliError(
        `댓글 본문 reference 제거 실패. 파일 삭제를 진행하지 않습니다. fileId=${fileId}`,
        EXIT_API_ERROR,
      );
    }

    // Step 2: 파일 삭제
    startSpinner("파일 삭제 중...");
    try {
      await client.deletePostFile(projectId, postId, fileId);
      stopSpinner(true, "파일 삭제 완료");
    } catch {
      stopSpinner(false, "");
      throw new DoorayCliError(
        `댓글 본문 reference 제거 OK / 파일 삭제 실패. 'dooray post file delete' 로 후처리하세요. fileId=${fileId}`,
        EXIT_API_ERROR,
      );
    }

    process.stdout.write(`파일(${fileId})이 댓글(${commentId})에서 삭제되었습니다.\n`);
  });
