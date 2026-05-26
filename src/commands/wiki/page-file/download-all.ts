import { Command } from "commander";
import { writeFile, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolveWikiPageInput } from "../../../resolvers/wiki-page-input.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import type { WikiPageFile } from "../../../api/types.js";
import type { OutputOptions } from "../../../formatters/table.js";
import { printJson } from "../../../formatters/table.js";
import { emitDownloadAllResult } from "../../../formatters/file-output.js";

export const wikiPageFileDownloadAllCommand = new Command("download-all")
  .description("위키 페이지의 모든 첨부파일 다운로드 (general + inline image)")
  .argument("[project]", "프로젝트 코드 (또는 첫 인자에 Dooray Wiki URL)")
  .argument("[page-id]", "위키 페이지 ID (project와 함께 사용)")
  .option("--id <pageId>", "위키 페이지 ID (--project 동반 필요)")
  .option("--url <url>", "Dooray Wiki URL")
  .option("--project <code>", "프로젝트 코드 (--id 모드에서 wikiId 해석용)")
  .option("-o, --output <dir>", "저장 디렉토리", ".")
  .action(async (project, pageIdArg, opts) => {
    const globalOpts = wikiPageFileDownloadAllCommand.optsWithGlobals() as OutputOptions;
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

    startSpinner("파일 목록 조회 중...");
    let allFiles: WikiPageFile[];
    try {
      const pageRes = await client.getWikiPage(wikiId, pageId);
      allFiles = [...(pageRes.result.files ?? []), ...(pageRes.result.images ?? [])];
    } catch (e) {
      stopSpinner(false);
      throw e;
    }

    if (allFiles.length === 0) {
      stopSpinner(true, "첨부파일 없음");
      if (globalOpts.json) {
        printJson({ count: 0, succeeded: [], failed: [] });
      } else if (!globalOpts.quiet) {
        process.stdout.write("첨부파일이 없습니다.\n");
      }
      return;
    }

    stopSpinner(true, `${allFiles.length}개 파일 다운로드 시작`);

    await mkdir(opts.output, { recursive: true });

    const succeeded: { path: string; fileName: string }[] = [];
    const failed: { fileId: string; error: string }[] = [];

    for (const f of allFiles) {
      try {
        const { buffer, fileName } = await client.downloadWikiPageFile(wikiId, pageId, f.id);
        // CLI7: path-traversal 방지 — basename + decodeURIComponent
        const safeName = basename(decodeURIComponent(fileName));
        const outputPath = join(opts.output, safeName);
        await writeFile(outputPath, Buffer.from(buffer));
        succeeded.push({ path: outputPath, fileName: safeName });
        // plain 모드만 ✓ 진행 출력 (json/quiet 는 마지막에 일괄)
        if (!globalOpts.json && !globalOpts.quiet) {
          process.stdout.write(`✓ ${safeName}\n`);
        }
      } catch (e) {
        failed.push({ fileId: f.id, error: e instanceof Error ? e.message : String(e) });
        if (!globalOpts.json) {
          process.stderr.write(`✗ ${f.name} (${f.id}): ${e instanceof Error ? e.message : String(e)}\n`);
        }
      }
    }

    // ADR-031: --json / --quiet / plain 최종 출력
    emitDownloadAllResult(globalOpts, { count: allFiles.length, succeeded, failed });

    // 부분 실패 시 exit 1 (process.exit 대신 exitCode — 비동기 flush 보장)
    if (failed.length > 0) process.exitCode = 1;
  });
