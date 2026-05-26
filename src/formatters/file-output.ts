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

// ADR-031 file 명령 출력 헬퍼
export function emitDownloadResult(
  globalOpts: OutputOptions,
  result: DownloadResult,
): void {
  if (globalOpts.json) {
    printJson(result);
  } else {
    process.stdout.write(`${result.outputPath}\n`);
  }
}

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
