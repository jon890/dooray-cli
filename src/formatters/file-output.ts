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
  id: string;
  // --json 출력의 id 필드명. 기본 "fileId" (기존 file 명령군 호환, ADR-031)
  jsonKey?: string;
  // plain 모드 전체 문장 override (예: "이/가" 조사 차이 대응). 기본 "파일(${id})이 삭제되었습니다."
  message?: string;
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
    if (data.failed.length > 0) {
      process.stderr.write(`${data.failed.length} failed\n`);
    }
  } else {
    process.stdout.write(`\n완료: ${data.succeeded.length}/${data.count}\n`);
  }
}

export function emitDeleteResult(
  globalOpts: OutputOptions,
  result: DeleteResult,
): void {
  const jsonKey = result.jsonKey ?? "fileId";
  const message = result.message ?? `파일(${result.id})이 삭제되었습니다.`;
  if (globalOpts.json) {
    printJson({ [jsonKey]: result.id, status: "deleted" });
  } else if (globalOpts.quiet) {
    process.stdout.write(`${result.id}\n`);
  } else {
    process.stdout.write(`${message}\n`);
  }
}
