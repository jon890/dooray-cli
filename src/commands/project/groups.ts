import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolveProject } from "../../resolvers/project.js";
import { ensureMemberGroups } from "../../resolvers/member-group.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";

export const projectGroupsCommand = new Command("groups")
  .description("프로젝트 멤버 그룹 목록 조회")
  .argument("<project>", "프로젝트 코드 또는 ID")
  .action(async (project: string) => {
    const globalOpts = projectGroupsCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    startSpinner("멤버 그룹 목록 조회 중...");
    const projectId = await resolveProject(client, project);
    const groups = await ensureMemberGroups(client, projectId);
    stopSpinner(true, "멤버 그룹 목록 조회 완료");

    output(globalOpts, {
      headers: ["ID", "Code"],
      rows: groups.map((g) => [g.id, g.code ?? "-"]),
      raw: groups,
      ids: groups.map((g) => g.id),
    });
  });
