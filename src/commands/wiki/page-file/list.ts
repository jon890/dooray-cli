import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolveWikiPageInput } from "../../../resolvers/wiki-page-input.js";
import { output, type OutputOptions } from "../../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import { formatSize } from "../../../utils/format-size.js";

export const wikiPageFileListCommand = new Command("list")
  .description("위키 페이지 첨부파일 목록 조회 (general + inline image)")
  .argument("[project]", "프로젝트 코드 (또는 첫 인자에 Dooray Wiki URL)")
  .argument("[page-id]", "위키 페이지 ID (project와 함께 사용)")
  .option("--id <pageId>", "위키 페이지 ID (--project 동반 필요)")
  .option("--url <url>", "Dooray Wiki URL")
  .option("--project <code>", "프로젝트 코드 (--id 모드에서 wikiId 해석용)")
  .action(async (project, pageIdArg, opts) => {
    const globalOpts = wikiPageFileListCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    // resolveWikiPageInput 을 startSpinner 보다 먼저 호출 (1-1 회피)
    const { wikiId, pageId } = await resolveWikiPageInput(client, {
      projectArg: project,
      pageIdArg,
      idOpt: opts.id,
      urlOpt: opts.url,
      project: opts.project,
    });

    startSpinner("첨부파일 목록 조회 중...");
    try {
      const res = await client.getWikiPage(wikiId, pageId);
      const files = (res.result.files ?? []).map((f) => ({ ...f, type: "general" as const }));
      const images = (res.result.images ?? []).map((f) => ({ ...f, type: "inline_image" as const }));
      const merged = [...files, ...images];
      stopSpinner(true, `첨부파일 ${merged.length}개 (general ${files.length} + inline ${images.length})`);

      output(globalOpts, {
        headers: ["ID", "Type", "파일명", "크기"],
        rows: merged.map((f) => [f.id, f.type, f.name, formatSize(f.size)]),
        raw: merged,
        ids: merged.map((f) => f.id),
      });
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
  });
