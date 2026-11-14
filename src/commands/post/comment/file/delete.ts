import { Command } from "commander";
import { getConfigOrThrow } from "../../../../config/store.js";
import { createClient } from "../../../../api/dooray-client.js";
import {
  resolveCommentFileInput,
  FILE_ID_SECONDARY_LABEL,
} from "../../../../resolvers/comment-file-input.js";
import { startSpinner, stopSpinner } from "../../../../utils/spinner.js";
import { DoorayCliError } from "../../../../utils/errors.js";
import { EXIT_API_ERROR, EXIT_PARAM_ERROR } from "../../../../utils/exit-codes.js";
import { removeFileReference } from "../../../../utils/comment-files.js";
import { resolveBodyMimeType } from "../../../../utils/body-input.js";
import {
  authorizeDeletion,
  promptDeletion,
} from "../../../../utils/delete-confirmation.js";

export const deleteCommentFileCommand = new Command("delete")
  .description("댓글 첨부 파일 삭제 (본문 reference 제거와 파일 삭제를 함께 수행)")
  .argument("[arg1]", "프로젝트 코드, Dooray URL, 또는 (`--id`/`--url` 모드일 때) 댓글 ID")
  .argument("[arg2]", "업무 번호 또는 (`--id`/`--url` 모드일 때) 파일 ID")
  .argument("[arg3]", "댓글 ID (positional 모드)")
  .argument("[arg4]", "파일 ID (positional 모드)")
  .option("--id <postId>", "Dooray post ID (project/post-number 대신)")
  .option("--url <url>", "Dooray 업무 URL (project/post-number 대신)")
  .option("--comment-id <logId>", "댓글 ID (positional 대체)")
  .option("--file-id <fileId>", "파일 ID (positional 대체)")
  .option("-y, --yes", "확인 없이 삭제 (자동화용)")
  .action(async (arg1, arg2, arg3, arg4, opts) => {
    const confirmed = await authorizeDeletion(
      !!opts.yes,
      !!process.stdin.isTTY,
      () =>
        promptDeletion(
          "댓글 본문에서 파일 reference를 제거하고 첨부 파일을 삭제합니다. 본문에서 reference를 찾지 못하면 아무것도 지우지 않고 멈춥니다. 같은 업무의 다른 댓글이 같은 파일 ID를 참조하면 링크가 깨질 수 있습니다. 계속하시겠습니까?",
        ),
    );
    if (!confirmed) {
      process.stderr.write("취소되었습니다.\n");
      return;
    }

    const config = await getConfigOrThrow();
    const client = createClient(config);

    const { projectId, postId, commentId, secondary: fileId } = await resolveCommentFileInput(client, {
      arg1, arg2, arg3, arg4,
      idOpt: opts.id,
      urlOpt: opts.url,
      argv: process.argv.slice(2),
      commentIdOpt: opts.commentId,
      secondaryOpt: opts.fileId,
      requireSecondary: true,
      secondaryLabel: FILE_ID_SECONDARY_LABEL,
    });

    // Step 1: 댓글 본문에서 reference 제거
    // 조회와 판정은 try 밖에 둔다. 안에 두면 그 catch 가 "제거 실패" 한 문구로
    // 덮어, 참조를 찾지 못한 것과 호출이 실패한 것이 구별되지 않는다.
    startSpinner("댓글 본문 reference 제거 중...");
    // 조회 실패는 여기서만 잡아 spinner 를 내리고 그대로 다시 던진다.
    // 아래 try 에 넣으면 그 catch 의 "제거 실패" 문구가 조회 실패를 덮는다.
    let commentRes: Awaited<ReturnType<typeof client.getPostComment>>;
    try {
      commentRes = await client.getPostComment(projectId, postId, commentId);
    } catch (error) {
      stopSpinner(false, "");
      throw error;
    }
    const currentBody = commentRes.result.body.content;
    const bodyMimeType = resolveBodyMimeType(commentRes.result.body.mimeType);
    const { body: newBody, removed } = removeFileReference(currentBody, fileId, bodyMimeType);
    if (!removed) {
      stopSpinner(false, "");
      throw new DoorayCliError(
        `댓글 본문에서 파일 reference 를 찾지 못했습니다. 파일을 삭제하지 않습니다. fileId=${fileId}\n` +
          `  본문 형식: ${bodyMimeType}\n` +
          `  파일만 지우려면: dooray post file delete <project> <number> ${fileId}`,
        EXIT_PARAM_ERROR,
      );
    }
    try {
      const update = { body: { mimeType: bodyMimeType, content: newBody } };
      if (config.authMode === "web") await client.updatePostComment(projectId, postId, commentId, update, { removeFileId: fileId });
      else await client.updatePostComment(projectId, postId, commentId, update);
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
