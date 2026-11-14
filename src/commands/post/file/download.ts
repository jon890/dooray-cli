import { Command } from "commander";
import { basename } from "node:path";
import { getConfigOrThrow } from "../../../config/store.js";
import { createClient } from "../../../api/dooray-client.js";
import { resolvePostInput } from "../../../resolvers/post-input.js";
import { checkOutputFile, saveDownload } from "../../../utils/download-target.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import { DoorayCliError } from "../../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../../utils/exit-codes.js";
import type { OutputOptions } from "../../../formatters/table.js";
import { emitDownloadResult } from "../../../formatters/file-output.js";

export const fileDownloadCommand = new Command("download")
  .description("첨부파일 다운로드")
  .argument("[arg1]", "프로젝트 코드, Dooray URL, 또는 (`--id`/`--url` 모드일 때) 파일 ID")
  .argument("[arg2]", "업무 번호 또는 (`--id`/`--url` 모드일 때) 파일 ID")
  .argument("[arg3]", "파일 ID (positional 모드)")
  .option("--id <postId>", "Dooray post ID (project/post-number 대신)")
  .option("--url <url>", "Dooray 업무 URL (project/post-number 대신)")
  .option("--file-id <fileId>", "파일 ID (positional 대체)")
  .option("-o, --output <dir>", "저장 디렉토리", ".")
  .option("--output-file <path>", "저장할 파일 경로 (지정하면 -o, --output 는 무시)")
  .action(async (arg1, arg2, arg3, opts) => {
    const globalOpts = fileDownloadCommand.optsWithGlobals() as OutputOptions;
    await checkOutputFile({ command: fileDownloadCommand, dirKey: "output", dirFlag: "--output", outputFile: opts.outputFile });
    const config = await getConfigOrThrow();
    const client = createClient(config);

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

    startSpinner("파일 다운로드 중...");
    try {
      const { projectId, postId } = await resolvePostInput(client, {
        projectArg,
        postNumberArg,
        idOpt: opts.id,
        urlOpt: opts.url,
        argv: process.argv.slice(2),
      });
      const { buffer, fileName } = await client.downloadPostFile(projectId, postId, fileId);

      // 클라이언트가 이미 basename·NFC 로 정리한 이름이다 (ADR-067)
      const safeName = fileName;
      const outputPath = await saveDownload(
        {
          command: fileDownloadCommand,
          dirKey: "output",
          dirFlag: "--output",
          dirValue: opts.output,
          outputFile: opts.outputFile,
          fileName: safeName,
        },
        new Uint8Array(buffer),
      );
      stopSpinner(true, "다운로드 완료");

      // ADR-031: --json / --quiet / plain 3 모드 분기
      emitDownloadResult(globalOpts, { outputPath, fileName: basename(outputPath), size: buffer.byteLength });
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
  });
