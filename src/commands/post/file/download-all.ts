import { Command } from "commander";
import { writeFile, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolvePostInput } from "../../../resolvers/post-input.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import type { OutputOptions } from "../../../formatters/table.js";
import { printJson } from "../../../formatters/table.js";
import { emitDownloadAllResult } from "../../../formatters/file-output.js";

export const fileDownloadAllCommand = new Command("download-all")
  .description("업무의 모든 첨부파일 다운로드")
  .argument("[project]", "프로젝트 코드 (또는 첫 인자에 Dooray URL)")
  .argument("[post-number]", "업무 번호 (project와 함께 사용)")
  .option("--id <postId>", "Dooray post ID (project/post-number 대신)")
  .option("--url <url>", "Dooray 업무 URL (project/post-number 대신)")
  .option("-o, --output <dir>", "저장 디렉토리", ".")
  .action(async (project, postNumberStr, opts) => {
    const globalOpts = fileDownloadAllCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    startSpinner("첨부파일 목록 조회 중...");
    const { projectId, postId } = await resolvePostInput(client, {
      projectArg: project,
      postNumberArg: postNumberStr,
      idOpt: opts.id,
      urlOpt: opts.url,
    });
    const res = await client.getPostFiles(projectId, postId);

    if (res.result.length === 0) {
      stopSpinner(true, "첨부파일 없음");
      if (globalOpts.json) {
        printJson({ count: 0, succeeded: [], failed: [] });
      } else if (!globalOpts.quiet) {
        process.stdout.write("첨부파일이 없습니다.\n");
      }
      return;
    }

    stopSpinner(true, `${res.result.length}개 파일 다운로드 시작`);
    await mkdir(opts.output, { recursive: true });

    const succeeded: { path: string; fileName: string }[] = [];
    const failed: { fileId: string; error: string }[] = [];

    for (const file of res.result) {
      try {
        const { buffer, fileName } = await client.downloadPostFile(projectId, postId, file.id);
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
        failed.push({ fileId: file.id, error: e instanceof Error ? e.message : String(e) });
        if (!globalOpts.json) {
          process.stderr.write(`✗ ${file.name} (${file.id}): ${e instanceof Error ? e.message : String(e)}\n`);
        }
      }
    }

    // ADR-031: --json / --quiet / plain 최종 출력
    emitDownloadAllResult(globalOpts, { count: res.result.length, succeeded, failed });

    // 부분 실패 시 exit 1 (process.exit 대신 exitCode — 비동기 flush 보장)
    if (failed.length > 0) process.exitCode = 1;
  });
