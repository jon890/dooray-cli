import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { createClient } from "../../api/dooray-client.js";
import { resolveWiki } from "../../resolvers/wiki.js";
import { formatWikiPages } from "../../formatters/wiki.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import type { OutputOptions } from "../../formatters/table.js";

export const wikiPagesCommand = new Command("pages")
  .description("위키 페이지 목록 조회")
  .argument("<project>", "프로젝트 코드 또는 ID")
  .option("--parent <page-id>", "부모 페이지 ID")
  .action(async (project, opts) => {
    const globalOpts = wikiPagesCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = createClient(config);

    startSpinner("위키 페이지 목록 조회 중...");
    const wikiId = await resolveWiki(client, project);
    const res = await client.getWikiPages(wikiId, opts.parent);
    stopSpinner(true, "위키 페이지 목록 조회 완료");

    formatWikiPages(res.result, globalOpts);
  });
