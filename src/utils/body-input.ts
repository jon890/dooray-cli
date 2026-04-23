import { readFile } from "node:fs/promises";
import { DoorayCliError } from "./errors.js";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";

export interface BodyInputOptions {
  body?: string;
  bodyFile?: string;
}

/**
 * `--body` / `--body-file` 옵션을 받아 본문 문자열을 돌려준다.
 *
 * - 둘 중 하나만 지정 가능. 동시 지정 시 에러.
 * - 값이 `"-"`이면 stdin에서 읽음.
 * - 둘 다 비어있으면 빈 문자열 반환 (호출자 책임으로 의미 해석).
 */
export async function readBodyInput(opts: BodyInputOptions): Promise<string> {
  if (opts.body != null && opts.bodyFile != null) {
    throw new DoorayCliError(
      "--body와 --body-file은 함께 사용할 수 없습니다.",
      EXIT_PARAM_ERROR,
    );
  }
  if (opts.bodyFile) {
    if (opts.bodyFile === "-") return readStdin();
    return readFile(opts.bodyFile, "utf-8");
  }
  if (opts.body === "-") return readStdin();
  return opts.body ?? "";
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new DoorayCliError(
      "stdin에서 읽으려면 파이프로 데이터를 전달해주세요.",
      EXIT_PARAM_ERROR,
    );
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}
