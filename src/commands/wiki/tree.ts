import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolveWiki } from "../../resolvers/wiki.js";
import { formatWikiTree } from "../../formatters/wiki.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import type { OutputOptions } from "../../formatters/table.js";

export const wikiTreeCommand = new Command("tree")
  .description("위키 페이지 계층 트리 조회")
  .argument("<project>", "프로젝트 코드 또는 ID")
  .option("--depth <n>", "재귀 최대 깊이 (root=1, 미지정 시 전체)")
  .action(async (project, opts) => {
    const globalOpts = wikiTreeCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    let maxDepth: number | undefined;
    if (opts.depth !== undefined) {
      const parsed = Number(opts.depth);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new DoorayCliError("--depth 는 1 이상의 정수여야 합니다", EXIT_PARAM_ERROR);
      }
      maxDepth = parsed;
    }

    startSpinner("위키 페이지 트리 조회 중...");
    const wikiId = await resolveWiki(client, project);
    const pages = await client.getAllWikiPages(wikiId, maxDepth);
    stopSpinner(true, "위키 페이지 트리 조회 완료");

    formatWikiTree(pages, globalOpts);
  });
