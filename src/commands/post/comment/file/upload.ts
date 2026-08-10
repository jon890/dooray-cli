import { Command } from "commander";
import { getConfigOrThrow } from "../../../../config/store.js";
import { DoorayApiClient } from "../../../../api/client.js";
import { resolveCommentFileInput } from "../../../../resolvers/comment-file-input.js";
import { basename } from "node:path";
import { printJson, type OutputOptions } from "../../../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../../../utils/spinner.js";
import { DoorayCliError } from "../../../../utils/errors.js";
import { EXIT_API_ERROR } from "../../../../utils/exit-codes.js";
import { appendFileReference } from "../../../../utils/comment-files.js";

export const uploadCommentFileCommand = new Command("upload")
  .description("댓글에 파일 업로드 (첨부 카드가 아닌 본문 링크로 표시)")
  .argument("[arg1]", "프로젝트 코드, Dooray URL, 또는 (`--id`/`--url` 모드일 때) 댓글 ID")
  .argument("[arg2]", "업무 번호 또는 (`--id`/`--url` 모드일 때) 파일 경로")
  .argument("[arg3]", "댓글 ID (positional 모드)")
  .argument("[arg4]", "파일 경로 (positional 모드)")
  .option("--id <postId>", "Dooray post ID (project/post-number 대신)")
  .option("--url <url>", "Dooray 업무 URL (project/post-number 대신)")
  .option("--comment-id <logId>", "댓글 ID (positional 대체)")
  .option("--file <path>", "업로드할 파일 경로 (positional 대체)")
  .action(async (arg1, arg2, arg3, arg4, opts) => {
    const globalOpts = uploadCommentFileCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    const { projectId, postId, commentId, secondary: filePath } = await resolveCommentFileInput(client, {
      arg1, arg2, arg3, arg4,
      idOpt: opts.id,
      urlOpt: opts.url,
      commentIdOpt: opts.commentId,
      secondaryOpt: opts.file,
      requireSecondary: true,
      secondaryLabel: { positional: "4번째", option: "--file", identifier: "<path>" },
    });

    // Step 1: 파일 업로드
    startSpinner("파일 업로드 중...");
    const uploadRes = await client.uploadPostFile(projectId, postId, filePath);
    const fileId = uploadRes.result.id;
    const fileName = basename(filePath);
    stopSpinner(true, "업로드 완료");

    // Step 2: 댓글 본문에 reference 추가
    startSpinner("댓글 reference 추가 중...");
    try {
      const commentRes = await client.getPostComment(projectId, postId, commentId);
      const currentBody = commentRes.result.body.content;
      const newBody = appendFileReference(currentBody, fileName, fileId);
      await client.updatePostComment(projectId, postId, commentId, {
        body: { mimeType: "text/x-markdown", content: newBody },
      });
      stopSpinner(true, "reference 추가 완료");
    } catch {
      stopSpinner(false, "");
      throw new DoorayCliError(
        `업로드 OK / 댓글 reference 추가 실패. fileId=${fileId} — 'dooray post comment file delete' 또는 수동 PUT 으로 정리하세요.`,
        EXIT_API_ERROR,
      );
    }

    if (globalOpts.json) {
      printJson({ fileId, fileName, commentId });
    } else if (globalOpts.quiet) {
      process.stdout.write(`${fileId}\n`);
    } else {
      process.stdout.write(`업로드 + 댓글 reference 추가: fileId=${fileId}\n`);
    }
  });
