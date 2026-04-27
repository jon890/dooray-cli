import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolveProject } from "../../resolvers/project.js";
import { ensureMembers } from "../../resolvers/member.js";
import { formatMemberList } from "../../formatters/member.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import type { OutputOptions } from "../../formatters/table.js";

export const memberListCommand = new Command("list")
  .description("프로젝트 멤버 목록")
  .argument("<project>", "프로젝트 코드 또는 ID")
  .action(async (project) => {
    const globalOpts = memberListCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);
    startSpinner("멤버 목록 조회 중...");
    const projectId = await resolveProject(client, project);
    const members = await ensureMembers(client, projectId);
    stopSpinner(true, `${members.length}명`);
    formatMemberList(
      members.map((m) => ({ id: m.organizationMemberId, name: m.name })),
      globalOpts,
    );
  });
