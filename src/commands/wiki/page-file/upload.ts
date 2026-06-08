import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolveWikiPageInput } from "../../../resolvers/wiki-page-input.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import { DoorayCliError } from "../../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../../utils/exit-codes.js";
import type { WikiPageFileType } from "../../../api/types.js";
import type { OutputOptions } from "../../../formatters/table.js";
import { printJson } from "../../../formatters/table.js";
import { wikiInlineImageSnippet } from "../../../utils/wiki-snippet.js";

export const wikiPageFileUploadCommand = new Command("upload")
  .description("위키 페이지 첨부파일 업로드 (multipart type 순서 강제, ADR-029)")
  .argument("[arg1]", "프로젝트 코드, Dooray Wiki URL, 또는 (`--id`/`--url` 모드일 때) 파일 경로")
  .argument("[arg2]", "page-id 또는 (`--id`/`--url` 모드일 때) 파일 경로")
  .argument("[arg3]", "파일 경로 (positional 3개 모드)")
  .option("--id <pageId>", "위키 페이지 ID")
  .option("--url <url>", "Dooray Wiki URL")
  .option("--project <code>", "프로젝트 코드 (--id 모드에서 wikiId 해석용)")
  .option("--file <path>", "업로드할 파일 경로 (positional 대체)")
  .option("--type <type>", "파일 타입: general | inline_image (기본 general)", "general")
  .action(async (arg1, arg2, arg3, opts) => {
    const globalOpts = wikiPageFileUploadCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    const fileType = opts.type as WikiPageFileType;
    if (fileType !== "general" && fileType !== "inline_image") {
      throw new DoorayCliError(
        `--type 은 general 또는 inline_image 여야 합니다 (입력: ${opts.type})`,
        EXIT_PARAM_ERROR,
      );
    }

    let projectArg: string | undefined;
    let pageIdArg: string | undefined;
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
      pageIdArg = arg2;
      filePath = filePath ?? arg3;
    } else if (arg1 && !arg2) {
      projectArg = arg1;
      if (!filePath) {
        throw new DoorayCliError(
          "URL/--id 모드 외에서는 <project> <page-id> 둘 다 또는 --file 옵션이 필요합니다.",
          EXIT_PARAM_ERROR,
        );
      }
    } else {
      projectArg = arg1;
      pageIdArg = arg2;
      if (!filePath) {
        throw new DoorayCliError(
          "<file> 이 필요합니다. positional 3번째 또는 --file 옵션을 사용하세요.",
          EXIT_PARAM_ERROR,
        );
      }
    }

    if (!filePath) {
      throw new DoorayCliError("파일 경로가 필요합니다.", EXIT_PARAM_ERROR);
    }

    // resolveWikiPageInput 을 startSpinner 보다 먼저 호출 (1-1 회피)
    const { wikiId, pageId } = await resolveWikiPageInput(client, {
      projectArg,
      pageIdArg,
      idOpt: opts.id,
      urlOpt: opts.url,
      project: opts.project,
    });

    startSpinner(`파일 업로드 중... (${fileType})`);
    try {
      const res = await client.uploadWikiPageFile(wikiId, pageId, filePath, fileType);
      stopSpinner(true, "업로드 완료");

      // ADR-031: --json / --quiet / plain 3 모드 분기
      if (globalOpts.json) {
        const payload =
          fileType === "inline_image"
            ? {
                ...res.result,
                markdownSnippet: wikiInlineImageSnippet(
                  wikiId,
                  res.result.attachFileId,
                  res.result.name,
                ),
              }
            : res.result;
        printJson(payload);
      } else if (globalOpts.quiet) {
        process.stdout.write(`${res.result.id}\n`);
      } else {
        process.stdout.write(`attachFileId: ${res.result.attachFileId}\n`);
        process.stdout.write(`name:         ${res.result.name}\n`);
        process.stdout.write(`size:         ${res.result.size}\n`);
        process.stdout.write(`type:         ${res.result.type}\n`);

        if (fileType === "inline_image") {
          process.stdout.write("\n본문 삽입용 markdown snippet (직접 wiki page edit 으로 본문에 박으세요):\n");
          process.stdout.write(
            `  ${wikiInlineImageSnippet(wikiId, res.result.attachFileId, res.result.name)}\n`,
          );
        }
      }
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
  });
