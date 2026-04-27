import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolvePostInput } from "../../../resolvers/post-input.js";
import { basename } from "node:path";
import type { OutputOptions } from "../../../formatters/table.js";
import { printJson } from "../../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import { DoorayCliError } from "../../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../../utils/exit-codes.js";

export const fileUploadCommand = new Command("upload")
  .description("첨부파일 업로드")
  .argument("[arg1]", "프로젝트 코드, Dooray URL, 또는 (`--id`/`--url` 모드일 때) 파일 경로")
  .argument("[arg2]", "업무 번호 또는 (`--id`/`--url` 모드일 때) 파일 경로")
  .argument("[arg3]", "파일 경로 (positional 모드)")
  .option("--id <postId>", "Dooray post ID (project/post-number 대신)")
  .option("--url <url>", "Dooray 업무 URL (project/post-number 대신)")
  .option("--file <path>", "업로드할 파일 경로 (positional 대체)")
  .action(async (arg1, arg2, arg3, opts) => {
    const globalOpts = fileUploadCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    let projectArg: string | undefined;
    let postNumberArg: string | undefined;
    let filePath: string | undefined = opts.file;

    if (opts.id || opts.url) {
      if (arg2 || arg3) {
        throw new DoorayCliError(
          "--id/--url 모드에서는 파일 경로 외 positional 인자를 받지 않습니다. --file 옵션 사용을 권장합니다.",
          EXIT_PARAM_ERROR,
        );
      }
      filePath = filePath ?? arg1;
    } else if (arg3) {
      projectArg = arg1;
      postNumberArg = arg2;
      filePath = filePath ?? arg3;
    } else if (arg1 && !arg2) {
      projectArg = arg1;
      if (!filePath) {
        throw new DoorayCliError(
          "URL/--id 모드에서는 --file 옵션이 필요합니다.",
          EXIT_PARAM_ERROR,
        );
      }
    } else {
      projectArg = arg1;
      postNumberArg = arg2;
      if (!filePath) {
        throw new DoorayCliError(
          "<file-path>가 필요합니다. positional 3번째 또는 --file 옵션을 사용하세요.",
          EXIT_PARAM_ERROR,
        );
      }
    }

    if (!filePath) {
      throw new DoorayCliError("파일 경로가 필요합니다.", EXIT_PARAM_ERROR);
    }

    startSpinner("파일 업로드 중...");
    const { projectId, postId } = await resolvePostInput(client, {
      projectArg,
      postNumberArg,
      idOpt: opts.id,
      urlOpt: opts.url,
    });
    const res = await client.uploadPostFile(projectId, postId, filePath);
    stopSpinner(true, "업로드 완료");

    if (globalOpts.json) {
      printJson(res.result);
    } else if (globalOpts.quiet) {
      process.stdout.write(`${res.result.id}\n`);
    } else {
      process.stdout.write(`파일 업로드 완료: ${basename(filePath)} (ID: ${res.result.id})\n`);
    }
  });
