import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { formatMemberDetail } from "../../formatters/member.js";
import type { OutputOptions } from "../../formatters/table.js";

export const memberGetCommand = new Command("get")
  .description("멤버 상세 정보 조회 (organizationMemberId)")
  .argument("<member-id>", "조회할 organization member ID")
  .action(async (memberId) => {
    const globalOpts = memberGetCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);
    const res = await client.getMemberDetail(memberId);
    formatMemberDetail(res.result, globalOpts);
  });
