import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { DoorayCliError } from "./errors.js";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";

export interface MailAttachment {
  path: string;
  filename: string;
  size: number;
}

/**
 * `--attach` 로 받은 경로를 발송 전에 모두 확인한다.
 * 발송은 되돌릴 수 없으므로 하나라도 일반 파일이 아니면 아무것도 보내지 않고 중단한다.
 */
export async function resolveMailAttachments(
  paths: string[] | undefined,
): Promise<MailAttachment[]> {
  const result: MailAttachment[] = [];
  for (const path of paths ?? []) {
    const info = await stat(path).catch(() => null);
    if (!info) {
      throw new DoorayCliError(`첨부 파일을 찾을 수 없습니다: ${path}`, EXIT_PARAM_ERROR);
    }
    if (!info.isFile()) {
      throw new DoorayCliError(`첨부는 일반 파일이어야 합니다: ${path}`, EXIT_PARAM_ERROR);
    }
    result.push({ path, filename: basename(path), size: info.size });
  }
  return result;
}
