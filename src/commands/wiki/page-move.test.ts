import { describe, expect, it } from "vitest";
import { buildMoveBody, validateMoveOptions } from "./page-move.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

function captureError(fn: () => void): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error("throw 되지 않았습니다.");
}

describe("buildMoveBody", () => {
  it("--parent 만 주면 targetParentPageId 하나만 든 본문이 나온다", () => {
    const body = buildMoveBody({ parent: "9876543210987654321" });
    expect(body).toEqual({ targetParentPageId: "9876543210987654321" });
    expect(Object.keys(body)).toHaveLength(1);
  });

  it("--no-children 을 주면 withChildren 이 false 로 들어간다", () => {
    expect(buildMoveBody({ parent: "9876543210987654321", children: false })).toEqual({
      targetParentPageId: "9876543210987654321",
      withChildren: false,
    });
  });

  it("Commander 기본값 children true 는 withChildren 을 본문에 넣지 않는다", () => {
    const body = buildMoveBody({ parent: "9876543210987654321", children: true });
    expect(body).toEqual({ targetParentPageId: "9876543210987654321" });
    expect("withChildren" in body).toBe(false);
  });

  it("--first 를 주면 beforePageId 가 문자열 0 이 된다", () => {
    expect(buildMoveBody({ parent: "9876543210987654321", first: true })).toEqual({
      targetParentPageId: "9876543210987654321",
      beforePageId: "0",
    });
  });

  it("--before 를 주면 beforePageId 가 그 값이 된다", () => {
    expect(buildMoveBody({ parent: "9876543210987654321", before: "1234567890123456789" })).toEqual({
      targetParentPageId: "9876543210987654321",
      beforePageId: "1234567890123456789",
    });
  });

  it("해석된 위키 ID 를 넘기면 targetWikiId 가 들어간다", () => {
    expect(buildMoveBody({ parent: "9876543210987654321" }, "1234567890123456789")).toEqual({
      targetParentPageId: "9876543210987654321",
      targetWikiId: "1234567890123456789",
    });
  });
});

describe("validateMoveOptions", () => {
  it("--parent 가 없으면 EXIT_PARAM_ERROR 로 던지고 메시지에 --parent 가 들어간다", () => {
    const err = captureError(() => validateMoveOptions({}));
    expect(err).toBeInstanceOf(DoorayCliError);
    expect((err as DoorayCliError).exitCode).toBe(EXIT_PARAM_ERROR);
    expect((err as Error).message).toContain("--parent");
  });

  it("--before 와 --first 를 함께 주면 EXIT_PARAM_ERROR 로 던지고 메시지에 둘 다 들어간다", () => {
    const err = captureError(() =>
      validateMoveOptions({
        parent: "9876543210987654321",
        before: "1234567890123456789",
        first: true,
      }),
    );
    expect(err).toBeInstanceOf(DoorayCliError);
    expect((err as DoorayCliError).exitCode).toBe(EXIT_PARAM_ERROR);
    expect((err as Error).message).toContain("--before");
    expect((err as Error).message).toContain("--first");
  });

  it("--parent 만 주면 던지지 않는다", () => {
    expect(() => validateMoveOptions({ parent: "9876543210987654321" })).not.toThrow();
  });
});
