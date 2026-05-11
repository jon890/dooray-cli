import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolveProject } from "../../resolvers/project.js";
import { ensureTemplates } from "../../resolvers/template.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";

export const projectTemplatesCommand = new Command("templates")
  .description("프로젝트 템플릿 목록 조회")
  .argument("<project>", "프로젝트 코드 또는 ID")
  .action(async (project: string) => {
    const globalOpts = projectTemplatesCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    startSpinner("템플릿 목록 조회 중...");
    try {
      const projectId = await resolveProject(client, project);
      const templates = await ensureTemplates(client, projectId);
      stopSpinner(true, "템플릿 목록 조회 완료");

      output(globalOpts, {
        headers: ["ID", "Template Name"],
        rows: templates.map((t) => [t.id, t.templateName]),
        raw: templates,
        ids: templates.map((t) => t.id),
      });
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
  });
