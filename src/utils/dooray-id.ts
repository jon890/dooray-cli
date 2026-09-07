import { DoorayCliError } from "./errors.js";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";

const DOORAY_ID_EPOCH_MS = 1262304000000n;
const DOORAY_ID_TIME_SHIFT = 23n;

export function decodeDoorayIdTimeMs(id: string): number {
  if (!/^\d+$/.test(id)) {
    throw new DoorayCliError(`메시지 id 형식이 올바르지 않습니다: "${id}"`, EXIT_PARAM_ERROR);
  }

  const bigId = BigInt(id);
  const timeMs = (bigId >> DOORAY_ID_TIME_SHIFT) + DOORAY_ID_EPOCH_MS;
  return Number(timeMs);
}
