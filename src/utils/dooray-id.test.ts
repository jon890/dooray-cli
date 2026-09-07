import { describe, expect, it } from "vitest";
import { decodeDoorayIdTimeMs } from "./dooray-id.js";
import { DoorayCliError } from "./errors.js";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";

describe("decodeDoorayIdTimeMs", () => {
  it("Dooray id 에서 도착 시각을 복원한다", () => {
    expect(decodeDoorayIdTimeMs("1234567890123456789")).toBe(
      Number((1234567890123456789n >> 23n) + 1262304000000n),
    );
  });

  it("Number() 선변환 회귀를 막는 경계값을 유지한다", () => {
    const boundaryId = (((1735689600000n - 1262304000000n) << 23n) - 1n).toString();
    const numberFirstTimeMs = Math.floor(Number(boundaryId) / 2 ** 23) + 1262304000000;

    expect(decodeDoorayIdTimeMs(boundaryId)).toBe(1735689599999);
    expect(numberFirstTimeMs).not.toBe(1735689599999);
  });

  it("숫자 문자열이 아니면 파라미터 오류를 던진다", () => {
    try {
      decodeDoorayIdTimeMs("123abc");
      throw new Error("예상한 오류가 발생하지 않았다");
    } catch (error) {
      expect(error).toBeInstanceOf(DoorayCliError);
      expect(error).toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    }
  });
});
