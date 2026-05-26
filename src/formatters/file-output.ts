import { printJson } from "./table.js";
import type { OutputOptions } from "./table.js";

export interface DownloadResult {
  outputPath: string;
  fileName: string;
  size: number;
}

export interface DownloadAllSucceeded {
  path: string;
  fileName: string;
}

export interface DownloadAllFailed {
  fileId: string;
  error: string;
}

export interface DownloadAllResult {
  count: number;
  succeeded: DownloadAllSucceeded[];
  failed: DownloadAllFailed[];
}

export interface DeleteResult {
  fileId: string;
}

/**
 * download 명령 출력 (ADR-031)
 * --json: { outputPath, fileName, size }
 * --quiet / plain: outputPath 한 줄
 */
export function emitDownloadResult(
  globalOpts: OutputOptions,
  result: DownloadResult,
): void {
  if (globalOpts.json) {
    printJson(result);
  } else {
    // quiet 와 plain 모두 outputPath 한 줄 — 의미 일관성 위해 분기는 동일
    process.stdout.write(`${result.outputPath}\n`);
  }
}

/**
 * download-all 명령 최종 출력 (ADR-031)
 * --json: { count, succeeded, failed }
 * --quiet: succeeded 경로 한 줄씩
 * plain: 완료 요약 한 줄
 *
 * 루프 중 ✓/✗ 진행 출력은 각 명령 파일에서 직접 처리.
 */
export function emitDownloadAllResult(
  globalOpts: OutputOptions,
  data: DownloadAllResult,
): void {
  if (globalOpts.json) {
    printJson(data);
  } else if (globalOpts.quiet) {
    for (const s of data.succeeded) {
      process.stdout.write(`${s.path}\n`);
    }
  } else {
    process.stdout.write(`\n완료: ${data.succeeded.length}/${data.count}\n`);
  }
}

/**
 * delete 명령 출력 (ADR-031)
 * --json: { fileId, status: "deleted" }
 * --quiet: fileId 한 줄
 * plain: 삭제 확인 메시지
 */
export function emitDeleteResult(
  globalOpts: OutputOptions,
  result: DeleteResult,
): void {
  if (globalOpts.json) {
    printJson({ fileId: result.fileId, status: "deleted" });
  } else if (globalOpts.quiet) {
    process.stdout.write(`${result.fileId}\n`);
  } else {
    process.stdout.write(`파일(${result.fileId})이 삭제되었습니다.\n`);
  }
}
