import { Command } from "commander";
import { getConfigOrThrow } from "../../../../config/store.js";
import { DoorayApiClient } from "../../../../api/client.js";
import { resolveCommentFileInput } from "../../../../resolvers/comment-file-input.js";
import { output, printJson, type OutputOptions } from "../../../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../../../utils/spinner.js";
import { formatSize } from "../../../../utils/format-size.js";

export const listCommentFileCommand = new Command("list")
  .description("댓글 첨부 파일 목록 조회")
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
    const res = await client.getPostComment(projectId, postId, commentId);
    const files = res.result.files ?? [];
    stopSpinner(true, `첨부 파일 ${files.length}개`);

    if (files.length === 0) {
      if (globalOpts.json) {
        process.stdout.write("[]\n");
      } else if (!globalOpts.quiet) {
        process.stdout.write("첨부 없음\n");
      }
      return;
    }

    output(globalOpts, {
      headers: ["파일명", "크기", "ID"],
      rows: files.map((f) => [f.name ?? "-", formatSize(f.size), f.id]),
      raw: files,
      ids: files.map((f) => f.id),
    });
  });
