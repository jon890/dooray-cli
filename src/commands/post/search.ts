import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { createClient } from "../../api/dooray-client.js";
import { resolveProject } from "../../resolvers/project.js";
import { formatPostList } from "../../formatters/post.js";
import type { OutputOptions } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";

export const postSearchCommand = new Command("search")
  .description("업무 검색 (제목 키워드)")
  .argument("<project>", "프로젝트 코드 또는 ID")
  .argument("<keyword>", "검색 키워드")
  .action(async (project, keyword) => {
    const globalOpts = postSearchCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = createClient(config);

    startSpinner("업무 검색 중...");
    const projectId = await resolveProject(client, project);
    const res = await client.getPosts(projectId, { subjects: keyword, order: "-createdAt" });
    stopSpinner(true, "업무 검색 완료");

    formatPostList(res.result, globalOpts);
  });
