import { Command } from "commander";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolveWikiPageInput } from "../../../resolvers/wiki-page-input.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import { DoorayCliError } from "../../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../../utils/exit-codes.js";

export const wikiPageFileDownloadCommand = new Command("download")
  .description("위키 페이지 첨부파일 다운로드")
  .argument("[arg1]", "프로젝트 코드, Dooray Wiki URL, 또는 (`--id`/`--url` 모드일 때) 파일 ID")
  .argument("[arg2]", "page-id 또는 (`--id`/`--url` 모드일 때) 파일 ID")
  .argument("[arg3]", "파일 ID (positional 3개 모드)")
  .option("--id <pageId>", "위키 페이지 ID")
  .option("--url <url>", "Dooray Wiki URL")
  .option("--project <code>", "프로젝트 코드 (--id 모드에서 wikiId 해석용)")
  .option("--file-id <fileId>", "파일 ID (positional 대체)")
  .option("-o, --output <dir>", "저장 디렉토리", ".")
  .action(async (arg1, arg2, arg3, opts) => {
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    let projectArg: string | undefined;
    let pageIdArg: string | undefined;
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
      pageIdArg = arg2;
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
      pageIdArg = arg2;
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

    // resolveWikiPageInput 을 startSpinner 보다 먼저 호출 (1-1 회피)
    const { wikiId, pageId } = await resolveWikiPageInput(client, {
      projectArg,
      pageIdArg,
      idOpt: opts.id,
      urlOpt: opts.url,
      project: opts.project,
    });

    startSpinner("파일 다운로드 중...");
    try {
      const { buffer, fileName } = await client.downloadWikiPageFile(wikiId, pageId, fileId);
      // 방어적 basename — client 가 이미 sanitize 하지만 출력 경로 조합 전 한 번 더
      const outputPath = join(opts.output, basename(fileName));
      await writeFile(outputPath, Buffer.from(buffer));
      stopSpinner(true, `다운로드 완료: ${outputPath}`);

      process.stdout.write(`${outputPath}\n`);
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
  });
