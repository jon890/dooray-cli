import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolveProject } from "../../resolvers/project.js";
import { ensureTags } from "../../resolvers/tag.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";

export const projectTagsCommand = new Command("tags")
  .description("프로젝트 태그 목록 조회")
  .argument("<project>", "프로젝트 코드 또는 ID")
  .action(async (project: string) => {
    const globalOpts = projectTagsCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    startSpinner("태그 목록 조회 중...");
    const projectId = await resolveProject(client, project);
    const tags = await ensureTags(client, projectId);
    stopSpinner(true, "태그 목록 조회 완료");

    output(globalOpts, {
      headers: ["ID", "Color", "Name", "Group", "Mandatory"],
      rows: tags.map((t) => [
        t.id,
        t.color,
        t.name,
        t.groupName ?? "",
        t.groupMandatory ? "Y" : "",
      ]),
      raw: tags,
      ids: tags.map((t) => t.id),
    });
  });
