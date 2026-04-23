import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolveWiki, resolveWikiHomePageId } from "../../resolvers/wiki.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { readBodyInput } from "../../utils/body-input.js";
import type { OutputOptions } from "../../formatters/table.js";
import { printJson } from "../../formatters/table.js";

export const wikiPageCreateCommand = new Command("create")
  .description("위키 페이지 생성")
  .argument("<project>", "프로젝트 코드 또는 ID")
  .requiredOption("--title <title>", "페이지 제목")
  .option("--parent <page-id>", "부모 페이지 ID")
  .option("--body <text>", "본문 텍스트 (- 입력 시 stdin에서 읽기)")
  .option("--body-file <path>", "본문 파일 경로 (- 입력 시 stdin에서 읽기)")
  .action(async (project, opts) => {
    const globalOpts = wikiPageCreateCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    const bodyContent = await readBodyInput(opts);

    startSpinner("위키 페이지 생성 중...");
    const wikiId = await resolveWiki(client, project);
    const parentPageId = opts.parent ?? (await resolveWikiHomePageId(client, wikiId));

    const res = await client.createWikiPage(wikiId, {
      subject: opts.title,
      body: { mimeType: "text/x-markdown", content: bodyContent },
      parentPageId,
    });
    stopSpinner(true, "위키 페이지 생성 완료");

    if (globalOpts.json) {
      printJson(res.result);
    } else if (globalOpts.quiet) {
      process.stdout.write(res.result.id + "\n");
    } else {
      process.stdout.write(`위키 페이지가 생성되었습니다: ${res.result.id}\n`);
    }
  });
