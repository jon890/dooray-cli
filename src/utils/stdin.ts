/** 파이프로 전달된 UTF-8 표준 입력을 읽는다. */
import { DoorayCliError } from "./errors.js";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";

export async function readStdin(): Promise<string> {
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
