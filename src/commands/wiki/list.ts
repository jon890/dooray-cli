import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { formatWikiList } from "../../formatters/wiki.js";
import { fetchAllWikis, filterWikisByName } from "../../resolvers/wiki.js";
import { buildProjectCodeMap } from "../../resolvers/project.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import type { OutputOptions } from "../../formatters/table.js";

export const wikiListCommand = new Command("list")
  .description("위키 목록 조회")
  .option("--page <number>", "페이지 번호", "0")
  .option("--size <number>", "페이지 크기", "20")
  .option("--search <keyword>", "위키 이름 부분 일치 검색 (대소문자 무시)")
  .action(async (opts) => {
    const globalOpts = wikiListCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    const projectCodeMapPromise = buildProjectCodeMap(client);

    let wikis;
    if (opts.search != null) {
      const pageGivenExplicitly = wikiListCommand.getOptionValueSource("page") === "cli";
      const sizeGivenExplicitly = wikiListCommand.getOptionValueSource("size") === "cli";
      if (pageGivenExplicitly || sizeGivenExplicitly) {
        process.stderr.write(
          "--search 는 전체 목록에서 찾으므로 --page 와 --size 를 무시합니다.\n",
        );
      }

      startSpinner("위키 목록 전체 조회 중...");
      const all = await fetchAllWikis(client);
      stopSpinner(true, "위키 목록 조회 완료");

      wikis = filterWikisByName(all, opts.search);
      if (wikis.length === 0) {
        process.stderr.write(
          `"${opts.search}" 와 이름이 부분 일치하는 위키가 없습니다. 대소문자는 구분하지 않았습니다.\n`,
        );
      }
    } else {
      startSpinner("위키 목록 조회 중...");
      const res = await client.getWikis({
        page: Number(opts.page),
        size: Number(opts.size),
      });
      stopSpinner(true, "위키 목록 조회 완료");
      wikis = res.result;
    }

    const projectCodeMap = await projectCodeMapPromise;
    formatWikiList(wikis, globalOpts, projectCodeMap);
  });
