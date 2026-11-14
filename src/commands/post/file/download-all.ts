import { Command } from "commander";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getConfigOrThrow } from "../../../config/store.js";
import { createClient } from "../../../api/dooray-client.js";
import { resolvePostInput } from "../../../resolvers/post-input.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";
import { extractInlineFileIds } from "../../../utils/inline-file-refs.js";
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
  .option("--no-inline", "본문에 삽입된 파일을 제외하고 첨부 목록만 받는다")
  .action(async (project, postNumberStr, opts) => {
    const globalOpts = fileDownloadAllCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = createClient(config);

    startSpinner("첨부파일 목록 조회 중...");
    const { projectId, postId } = await resolvePostInput(client, {
      projectArg: project,
      postNumberArg: postNumberStr,
      idOpt: opts.id,
      urlOpt: opts.url,
      argv: process.argv.slice(2),
    });
    const res = await client.getPostFiles(projectId, postId);

    // ADR-057: 첨부 목록과 본문의 /files/<id> 참조를 합쳐 대상으로 삼는다.
    // --no-inline 을 준 호출에는 상세 조회 왕복을 더하지 않는다.
    const targets: { id: string; name?: string }[] = res.result.map((f) => ({
      id: f.id,
      name: f.name,
    }));
    if (opts.inline) {
      // 본문 조회가 실패해도 이미 받아 둔 첨부 목록은 그대로 받는다.
      // 여기서 멈추면 이 변경 전에는 받아지던 파일이 받아지지 않는다.
      let detail: Awaited<ReturnType<typeof client.getPost>> | undefined;
      try {
        detail = await client.getPost(projectId, postId);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (!globalOpts.json) {
          process.stderr.write(`경고: 본문을 조회하지 못해 첨부 목록만 받습니다: ${msg}\n`);
        }
      }
      if (detail) {
        // 본문의 /files/<id> 가 모두 이 업무의 파일은 아니다.
        // 다른 업무 주소나 메신저 링크가 섞이면 그 id 로 받으려다 404 가 난다.
        // 응답의 fileIdList 에 있는 것만 남긴다.
        const owned = new Set(detail.result.fileIdList ?? []);
        const seen = new Set(targets.map((t) => t.id));
        for (const id of extractInlineFileIds(detail.result.body?.content ?? "")) {
          if (seen.has(id) || !owned.has(id)) continue;
          seen.add(id);
          targets.push({ id });
        }
      }
    }

    if (targets.length === 0) {
      stopSpinner(true, "첨부파일 없음");
      if (globalOpts.json) {
        printJson({ count: 0, succeeded: [], failed: [] });
      } else if (!globalOpts.quiet) {
        process.stdout.write("첨부파일이 없습니다.\n");
      }
      return;
    }

    stopSpinner(true, `${targets.length}개 파일 다운로드 시작`);
    await mkdir(opts.output, { recursive: true });

    const succeeded: { path: string; fileName: string }[] = [];
    const failed: { fileId: string; error: string }[] = [];

    for (const file of targets) {
      try {
        const { buffer, fileName } = await client.downloadPostFile(projectId, postId, file.id, file.name);
        // 클라이언트가 이미 basename·NFC 로 정리한 이름이다 (ADR-067)
        const safeName = fileName;
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
          // 본문에서만 온 항목은 이름을 모른다. 그 자리에 id 를 쓴다.
          process.stderr.write(`✗ ${file.name ?? file.id} (${file.id}): ${e instanceof Error ? e.message : String(e)}\n`);
        }
      }
    }

    // ADR-031: --json / --quiet / plain 최종 출력
    emitDownloadAllResult(globalOpts, { count: targets.length, succeeded, failed });

    // 부분 실패 시 exit 1 (process.exit 대신 exitCode — 비동기 flush 보장)
    if (failed.length > 0) process.exitCode = 1;
  });
