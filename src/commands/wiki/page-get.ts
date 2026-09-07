import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolveWikiPageInput } from "../../resolvers/wiki-page-input.js";
import { formatWikiPageDetail } from "../../formatters/wiki.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import type { OutputOptions } from "../../formatters/table.js";

export const wikiPageGetCommand = new Command("get")
  .description("위키 페이지 상세 조회")
  .argument("[arg1]", "프로젝트 코드 또는 Dooray Wiki URL")
  .argument("[arg2]", "page-id (positional 2개 모드)")
  .option("--id <pageId>", "위키 페이지 ID (project 없이 조회)")
  .option("--url <url>", "Dooray Wiki URL")
  .option("--project <code>", "프로젝트 코드 (선택, 주면 wikiId 해석 호출을 아낀다)")
  .action(async (arg1, arg2, opts) => {
    const globalOpts = wikiPageGetCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    // resolveWikiPageInput 을 스피너보다 먼저 호출 (validation-before-spinner)
    const { wikiId, pageId } = await resolveWikiPageInput(client, {
      projectArg: arg1,
      pageIdArg: arg2,
      idOpt: opts.id,
      urlOpt: opts.url,
      project: opts.project,
    });

    startSpinner("위키 페이지 조회 중...");
    const res = await client.getWikiPage(wikiId, pageId);
    stopSpinner(true, "위키 페이지 조회 완료");

    formatWikiPageDetail(res.result, globalOpts);
  });
