import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { formatWikiList } from "../../formatters/wiki.js";
import { fetchAllWikis, filterWikisByName } from "../../resolvers/wiki.js";
import { buildProjectCodeMap } from "../../resolvers/project.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import type { OutputOptions } from "../../formatters/table.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

export const wikiListCommand = new Command("list")
  .description("위키 목록 조회")
  .option("--page <number>", "페이지 번호", "0")
  .option("--size <number>", "페이지 크기", "20")
  .option("--search <keyword>", "위키 이름 부분 일치 검색 (대소문자 무시)")
  .action(async (opts) => {
    const globalOpts = wikiListCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    // project 조회 실패 시 빈 Map fallback — 위키 목록 자체는 그대로 낸다.
    // Project 열은 코드를 찾지 못하면 project id 를 그대로 낸다.
    const projectCodeMapPromise = buildProjectCodeMap(client).catch(
      () => new Map<string, string>(),
    );

    // 빈 문자열을 검색 분기로 들이지 않는다. filterWikisByName 이 빈 키워드에 입력을
    // 그대로 돌려주므로, 무거운 전체 순회를 돌고 전체 목록을 내는 결과가 된다.
    if (opts.search != null && opts.search.trim() === "") {
      throw new DoorayCliError(
        "--search 에 빈 값을 줄 수 없습니다. 찾을 이름의 일부를 입력하세요.",
        EXIT_PARAM_ERROR,
      );
    }

    let wikis;
    if (opts.search) {
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
