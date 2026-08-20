import { describe, it, expect } from "vitest";
import { normalizeTagColor } from "./tags-create.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

/** 던져진 예외가 DoorayCliError 이고 exitCode 가 EXIT_PARAM_ERROR 인지까지 확인한다 */
function expectParamError(input: string): void {
  try {
    normalizeTagColor(input);
  } catch (e) {
    expect(e).toBeInstanceOf(DoorayCliError);
    expect((e as DoorayCliError).exitCode).toBe(EXIT_PARAM_ERROR);
    return;
  }
  throw new Error(`throw 되지 않았습니다: ${JSON.stringify(input)}`);
}

describe("normalizeTagColor", () => {
  it("undefined 면 기본값", () => {
    expect(normalizeTagColor(undefined)).toBe("e0e0e0");
  });

  it("빈 문자열과 공백만 있는 값도 기본값", () => {
    expect(normalizeTagColor("")).toBe("e0e0e0");
    expect(normalizeTagColor("   ")).toBe("e0e0e0");
  });

  it("6자리 hex 는 그대로", () => {
    expect(normalizeTagColor("c6eab3")).toBe("c6eab3");
  });

  it("# 을 하나 벗긴다", () => {
    expect(normalizeTagColor("#c6eab3")).toBe("c6eab3");
  });

  it("대문자는 소문자로", () => {
    expect(normalizeTagColor("C6EAB3")).toBe("c6eab3");
  });

  it("앞뒤 공백을 벗기고 판정한다", () => {
    expect(normalizeTagColor("  #C6EAB3  ")).toBe("c6eab3");
  });

  it("hex 가 아니면 EXIT_PARAM_ERROR", () => {
    expectParamError("xyz");
  });

  it("5자리는 EXIT_PARAM_ERROR", () => {
    expectParamError("c6eab");
  });

  it("8자리는 EXIT_PARAM_ERROR", () => {
    expectParamError("c6eab3ff");
  });

  it("# 은 하나만 벗기므로 ## 은 EXIT_PARAM_ERROR", () => {
    expectParamError("##c6eab3");
  });

  it("에러 메시지에 입력한 원본 값이 담긴다", () => {
    expect(() => normalizeTagColor("xyz")).toThrow(/xyz/);
  });
});
