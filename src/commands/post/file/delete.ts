import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolvePostInput } from "../../../resolvers/post-input.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import { DoorayCliError } from "../../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../../utils/exit-codes.js";

export const fileDeleteCommand = new Command("delete")
  .description("첨부파일 삭제")
  .argument("[arg1]", "프로젝트 코드, Dooray URL, 또는 (`--id`/`--url` 모드일 때) 파일 ID")
  .argument("[arg2]", "업무 번호 또는 (`--id`/`--url` 모드일 때) 파일 ID")
  .argument("[arg3]", "파일 ID (positional 3개 모드)")
  .option("--id <postId>", "Dooray post ID (project/post-number 대신)")
  .option("--url <url>", "Dooray 업무 URL (project/post-number 대신)")
  .option("--file-id <fileId>", "파일 ID (positional 대체)")
  .action(async (arg1, arg2, arg3, opts) => {
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    let projectArg: string | undefined;
    let postNumberArg: string | undefined;
    let fileId: string | undefined = opts.fileId;

    if (opts.id || opts.url) {
      if (arg2 || arg3) {
        throw new DoorayCliError(
          "--id/--url 모드에서는 파일 ID 외 추가 positional 인자를 받지 않습니다. --file-id 옵션 사용을 권장합니다.",
          EXIT_PARAM_ERROR,
        );
      }
      fileId = fileId ?? arg1;
    } else if (arg3) {
      projectArg = arg1;
      postNumberArg = arg2;
      fileId = fileId ?? arg3;
    } else if (arg1 && !arg2) {
      projectArg = arg1;
      if (!fileId) {
        throw new DoorayCliError(
          "URL/--id 모드에서는 --file-id 옵션이 필요합니다.",
          EXIT_PARAM_ERROR,
        );
      }
    } else {
      projectArg = arg1;
      postNumberArg = arg2;
      if (!fileId) {
        throw new DoorayCliError(
          "<file-id>가 필요합니다. positional 3번째 또는 --file-id 옵션을 사용하세요.",
          EXIT_PARAM_ERROR,
        );
      }
    }

    if (!fileId) {
      throw new DoorayCliError("파일 ID가 필요합니다.", EXIT_PARAM_ERROR);
    }

    startSpinner("파일 삭제 중...");
    const { projectId, postId } = await resolvePostInput(client, {
      projectArg,
      postNumberArg,
      idOpt: opts.id,
      urlOpt: opts.url,
    });
    await client.deletePostFile(projectId, postId, fileId);
    stopSpinner(true, "삭제 완료");

    process.stdout.write(`파일(${fileId})이 삭제되었습니다.\n`);
  });
