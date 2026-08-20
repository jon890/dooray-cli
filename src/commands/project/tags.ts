import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolveProject } from "../../resolvers/project.js";
import { ensureTags } from "../../resolvers/tag.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";

async function runTagsList(project: string, opts: OutputOptions): Promise<void> {
  const config = await getConfigOrThrow();
  const client = new DoorayApiClient(config.apiKey, config.baseUrl);

  startSpinner("태그 목록 조회 중...");
  let tags;
  try {
    const projectId = await resolveProject(client, project);
    tags = await ensureTags(client, projectId);
  } catch (e) {
    stopSpinner(false, "태그 목록 조회 실패");
    throw e;
  }
  stopSpinner(true, "태그 목록 조회 완료");

  output(opts, {
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
}

// 하위 명령을 가지면서 기존 `dooray project tags <project>` 호출도 그대로 받는다.
// 첫 positional 이 하위 명령 이름과 겹치지 않으면 이 action 이 받는다.
export const projectTagsCommand = new Command("tags")
  .description("프로젝트 태그 조회·생성·그룹 변경")
  .argument("[project]", "프로젝트 코드 또는 ID (생략하면 도움말)")
  .action(async (project: string | undefined) => {
    if (!project) {
      projectTagsCommand.outputHelp();
      return;
    }
    await runTagsList(project, projectTagsCommand.optsWithGlobals() as OutputOptions);
  });

export const projectTagsListCommand = new Command("list")
  .description("프로젝트 태그 목록 조회")
  .argument("<project>", "프로젝트 코드 또는 ID")
  .action(async (project: string) => {
    await runTagsList(project, projectTagsListCommand.optsWithGlobals() as OutputOptions);
  });
