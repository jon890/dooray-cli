import { Command } from "commander";
import chalk from "chalk";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { fetchMemberOrganization } from "../../resolvers/member-organization.js";
import { formatMemberDetail } from "../../formatters/member.js";
import type { OutputOptions } from "../../formatters/table.js";

export const memberGetCommand = new Command("get")
  .description("멤버 상세 정보 조회 (organizationMemberId)")
  .argument("<member-id>", "조회할 organization member ID")
  .option("--with-org", "소속 회사·부서·직책을 함께 조회한다 (--json 출력에 organization 필드 추가)")
  .action(async (memberId, opts) => {
    const globalOpts = memberGetCommand.optsWithGlobals() as OutputOptions;

    // --quiet 은 ID 만 내므로 소속 정보를 쓸 곳이 없다.
    // 「무시되는 옵션」 규약대로 경고만 내고 추가 조회는 하지 않는다.
    const quietOnly = Boolean(globalOpts.quiet) && !globalOpts.json;
    const withOrg = Boolean(opts.withOrg) && !quietOnly;
    if (opts.withOrg && quietOnly) {
      process.stderr.write(
        chalk.yellow("경고: --with-org 는 --quiet 과 함께 주면 효력이 없습니다.\n"),
      );
    }

    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);
    const res = await client.getMemberDetail(memberId);
    const organization = withOrg ? await fetchMemberOrganization(client, memberId) : undefined;
    formatMemberDetail(res.result, globalOpts, organization);
  });
