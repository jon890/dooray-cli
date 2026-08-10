import { Command } from "commander";
import { getConfigOrThrow } from "../../../../config/store.js";
import { DoorayApiClient } from "../../../../api/client.js";
import type { PostFileDetail } from "../../../../api/types.js";
import { resolveCommentFileInput } from "../../../../resolvers/comment-file-input.js";
import { output, type OutputOptions } from "../../../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../../../utils/spinner.js";
import { formatSize } from "../../../../utils/format-size.js";
import {
  extractAttachmentReferences,
  sanitizeFileName,
} from "../../../../utils/attachment-check.js";
import {
  mergeCommentFiles,
  type CommentFileSource,
} from "../../../../utils/comment-file-merge.js";

function formatSource(source: CommentFileSource): string {
  if (source === "attachment") return "첨부";
  if (source === "body-link") return "본문 링크";
  return "둘 다";
}

export const listCommentFileCommand = new Command("list")
  .description("댓글 첨부 파일과 본문 파일 링크 목록 통합 조회")
  .argument("[arg1]", "프로젝트 코드, Dooray URL, 또는 (`--id`/`--url` 모드일 때) 댓글 ID")
  .argument("[arg2]", "업무 번호 (positional 모드)")
  .argument("[arg3]", "댓글 ID (positional 3개 모드)")
  .option("--id <postId>", "Dooray post ID (project/post-number 대신)")
  .option("--url <url>", "Dooray 업무 URL (project/post-number 대신)")
  .option("--comment-id <logId>", "댓글 ID (positional 대체)")
  .action(async (arg1, arg2, arg3, opts) => {
    const globalOpts = listCommentFileCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    const { projectId, postId, commentId } = await resolveCommentFileInput(client, {
      arg1, arg2, arg3,
      idOpt: opts.id,
      urlOpt: opts.url,
      commentIdOpt: opts.commentId,
      requireSecondary: false,
    });
    startSpinner("댓글 첨부 파일 목록 조회 중...");
    try {
      const res = await client.getPostComment(projectId, postId, commentId);
      const commentFiles = res.result.files ?? [];
      const bodyRefs = extractAttachmentReferences(res.result.body.content);

      if (commentFiles.length === 0 && bodyRefs.length === 0) {
        stopSpinner(true, "첨부 파일 0개");
        if (globalOpts.json) {
          process.stdout.write("[]\n");
        } else if (!globalOpts.quiet) {
          process.stdout.write("첨부 없음\n");
        }
        return;
      }

      let postFiles: PostFileDetail[] = [];
      let metadataLookupFailed = false;
      try {
        const postFilesRes = await client.getPostFiles(projectId, postId);
        postFiles = postFilesRes.result;
      } catch {
        metadataLookupFailed = true;
      }

      const merged = mergeCommentFiles({ commentFiles, bodyRefs, postFiles });
      stopSpinner(true, `첨부 파일 ${merged.length}개`);
      if (metadataLookupFailed) {
        process.stderr.write("⚠  첨부 메타데이터 조회 실패 — 파일명·크기를 표시하지 못합니다.\n");
      }

      output(globalOpts, {
        headers: ["파일명", "크기", "출처", "ID"],
        rows: merged.map((file) => [
          file.name == null ? "-" : sanitizeFileName(file.name),
          formatSize(file.size),
          formatSource(file.source),
          file.id,
        ]),
        raw: merged,
        ids: merged.map((file) => file.id),
      });
    } catch (error) {
      stopSpinner(false);
      throw error;
    }
  });
