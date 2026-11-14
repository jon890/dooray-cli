import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { createClient } from "../../api/dooray-client.js";
import { resolveProject } from "../../resolvers/project.js";
import { ensureMembers } from "../../resolvers/member.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";

export const projectMembersCommand = new Command("members")
  .description("프로젝트 멤버 목록 조회")
  .argument("<project>", "프로젝트 코드 또는 ID")
  .action(async (project: string) => {
    const globalOpts = projectMembersCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = createClient(config);

    startSpinner("멤버 목록 조회 중...");
    const projectId = await resolveProject(client, project);
    const members = await ensureMembers(client, projectId);
    stopSpinner(true, "멤버 목록 조회 완료");

    output(globalOpts, {
      headers: ["ID", "Name"],
      rows: members.map((m) => [
        m.organizationMemberId,
        m.name,
      ]),
      raw: members,
      ids: members.map((m) => m.organizationMemberId),
    });
  });
