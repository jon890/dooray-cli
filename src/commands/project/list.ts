import { Command, Option } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { createClient } from "../../api/dooray-client.js";
import { ensureProjects, ensurePrivateProjects } from "../../resolvers/project.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";

export const projectListCommand = new Command("list")
  .description("프로젝트 목록 조회")
  .option("-s, --search <keyword>", "code 필터링")
  .addOption(
    new Option("-t, --type <type>", "프로젝트 타입 필터")
      .choices(["public", "private"])
      .default("public"),
  )
  .action(async (opts) => {
    const globalOpts = projectListCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = createClient(config);

    const isPrivate = opts.type === "private";
    startSpinner(isPrivate ? "개인 프로젝트 목록 조회 중..." : "프로젝트 목록 조회 중...");
    const projects = isPrivate
      ? await ensurePrivateProjects(client)
      : await ensureProjects(client);
    stopSpinner(true, isPrivate ? "개인 프로젝트 목록 조회 완료" : "프로젝트 목록 조회 완료");

    let filtered = projects;
    if (opts.search) {
      const keyword = opts.search.toLowerCase();
      filtered = projects.filter((p) => p.code.toLowerCase().includes(keyword));
    }

    output(globalOpts, {
      headers: ["ID", "Code"],
      rows: filtered.map((p) => [p.id, p.code]),
      raw: filtered,
      ids: filtered.map((p) => p.id),
    });
  });
