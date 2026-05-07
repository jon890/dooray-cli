import { Command } from "commander";
import { getConfigOrThrow } from "../../../../config/store.js";
import { DoorayApiClient } from "../../../../api/client.js";
import { resolvePostInput } from "../../../../resolvers/post-input.js";
import { output, printJson, type OutputOptions } from "../../../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../../../utils/spinner.js";
import { DoorayCliError } from "../../../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../../../utils/exit-codes.js";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

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

    let projectArg: string | undefined;
    let postNumberArg: string | undefined;
    let logId: string | undefined = opts.commentId;

    if (opts.id || opts.url) {
      if (arg2 || arg3) {
        throw new DoorayCliError(
          "--id/--url 모드에서는 댓글 ID 외 추가 positional 인자를 받지 않습니다. --comment-id 옵션 사용을 권장합니다.",
          EXIT_PARAM_ERROR,
        );
      }
      logId = logId ?? arg1;
    } else if (arg3) {
      projectArg = arg1;
      postNumberArg = arg2;
      logId = logId ?? arg3;
    } else if (arg1 && !arg2) {
      projectArg = arg1;
      if (!logId) {
        throw new DoorayCliError(
          "URL/--id 모드에서는 --comment-id 옵션이 필요합니다.",
          EXIT_PARAM_ERROR,
        );
      }
    } else {
      projectArg = arg1;
      postNumberArg = arg2;
      if (!logId) {
        throw new DoorayCliError(
          "<comment-id>가 필요합니다. positional 3번째 또는 --comment-id 옵션을 사용하세요.",
          EXIT_PARAM_ERROR,
        );
      }
    }

    if (!logId) {
      throw new DoorayCliError("<comment-id>가 필요합니다.", EXIT_PARAM_ERROR);
    }

    startSpinner("댓글 첨부 파일 목록 조회 중...");
    const { projectId, postId } = await resolvePostInput(client, {
      projectArg,
      postNumberArg,
      idOpt: opts.id,
      urlOpt: opts.url,
    });
    const res = await client.getPostComment(projectId, postId, logId);
    const files = res.result.files ?? [];
    stopSpinner(true, `첨부 파일 ${files.length}개`);

    if (files.length === 0) {
      if (globalOpts.json) {
        process.stdout.write("[]\n");
      } else {
        process.stderr.write("첨부 없음\n");
      }
      return;
    }

    output(globalOpts, {
      headers: ["파일명", "크기", "ID"],
      rows: files.map((f) => [f.name, formatSize(f.size), f.id]),
      raw: files,
      ids: files.map((f) => f.id),
    });
  });
