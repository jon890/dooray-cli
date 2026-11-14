import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { createClient } from "../../api/dooray-client.js";
import { resolveProject } from "../../resolvers/project.js";
import { ensureWorkflows } from "../../resolvers/workflow.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";

export const projectWorkflowsCommand = new Command("workflows")
  .description("프로젝트 워크플로우 목록 조회")
  .argument("<project>", "프로젝트 코드 또는 ID")
  .action(async (project: string) => {
    const globalOpts = projectWorkflowsCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = createClient(config);

    startSpinner("워크플로우 목록 조회 중...");
    const projectId = await resolveProject(client, project);
    const workflows = await ensureWorkflows(client, projectId);
    stopSpinner(true, "워크플로우 목록 조회 완료");

    output(globalOpts, {
      headers: ["ID", "Name", "Class", "Order"],
      rows: workflows.map((w) => [
        w.id,
        w.name,
        w.class,
        String(w.order ?? ""),
      ]),
      raw: workflows,
      ids: workflows.map((w) => w.id),
    });
  });
