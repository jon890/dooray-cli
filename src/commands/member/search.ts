import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { formatMemberSearchResults } from "../../formatters/member.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import type { OutputOptions } from "../../formatters/table.js";

export const memberSearchCommand = new Command("search")
  .description("organization 전체에서 멤버 검색")
  .argument("[keyword]", "이름 검색어 (--email/--user-code 미지정 시 name으로 검색)")
  .option("--email <email>", "외부 이메일 (콤마 구분 가능, exact match)")
  .option("--user-code <code>", "사번 like 검색")
  .option("--user-code-exact <code>", "사번 exact match")
  .option("--page <n>", "페이지 (기본 0)", "0")
  .option("--size <n>", "페이지 크기 (기본 20, max 100)", "20")
  .action(async (keyword: string | undefined, opts) => {
    const globalOpts = memberSearchCommand.optsWithGlobals() as OutputOptions;

    // 옵션 검증 — 적어도 하나는 있어야 함
    const filterCount = [keyword, opts.email, opts.userCode, opts.userCodeExact].filter(Boolean).length;
    if (filterCount === 0) {
      throw new DoorayCliError(
        "검색 조건이 필요합니다. positional <keyword>(=name) 또는 --email/--user-code/--user-code-exact 중 하나 이상.",
        EXIT_PARAM_ERROR,
      );
    }
    // 보수적 상호배타: keyword(name) + 다른 필터 동시 사용 금지 (Dooray가 AND/OR 처리하는지 doc 불명확)
    if (keyword && (opts.email || opts.userCode || opts.userCodeExact)) {
      throw new DoorayCliError(
        "positional <keyword>(name)와 --email/--user-code/--user-code-exact 옵션은 동시 사용 불가.",
        EXIT_PARAM_ERROR,
      );
    }

    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    const size = Math.min(Math.max(1, Number(opts.size) || 20), 100);
    const page = Math.max(0, Number(opts.page) || 0);

    startSpinner("멤버 검색 중...");
    const res = await client.searchMembers({
      ...(keyword && { name: keyword }),
      ...(opts.email && { externalEmailAddresses: opts.email }),
      ...(opts.userCode && { userCode: opts.userCode }),
      ...(opts.userCodeExact && { userCodeExact: opts.userCodeExact }),
      page,
      size,
    });
    stopSpinner(true, `${res.totalCount}건 (이 페이지 ${res.result.length})`);

    formatMemberSearchResults(res.result, globalOpts);
  });
