import { describe, it, expect } from "vitest";
import { parseCommentFilePositional } from "./comment-file-input.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

const fileLabel = { positional: "4번째", option: "--file", identifier: "<path>" };

describe("parseCommentFilePositional", () => {
  it("positional 4 모드 — secondary 있음", () => {
    const result = parseCommentFilePositional({
      arg1: "p",
      arg2: "n",
      arg3: "c",
      arg4: "s",
      requireSecondary: true,
      secondaryLabel: fileLabel,
    });
    expect(result).toEqual({ projectArg: "p", postNumberArg: "n", commentId: "c", secondary: "s" });
  });

  it("positional 3 모드 — list (requireSecondary=false, secondary undefined OK)", () => {
    const result = parseCommentFilePositional({
      arg1: "p",
      arg2: "n",
      arg3: "c",
      requireSecondary: false,
    });
    expect(result).toEqual({ projectArg: "p", postNumberArg: "n", commentId: "c", secondary: undefined });
  });

  it("--id 모드 — arg1=commentId", () => {
    const result = parseCommentFilePositional({
      idOpt: "post-id",
      arg1: "c",
      requireSecondary: false,
    });
    expect(result).toEqual({ projectArg: undefined, postNumberArg: undefined, commentId: "c", secondary: undefined });
  });

  it("--url 모드 — arg1=commentId, arg2=secondary 폴백", () => {
    const result = parseCommentFilePositional({
      urlOpt: "https://example.dooray.com/task/to/123",
      arg1: "c",
      arg2: "s",
      requireSecondary: true,
      secondaryLabel: fileLabel,
    });
    expect(result).toEqual({ projectArg: undefined, postNumberArg: undefined, commentId: "c", secondary: "s" });
  });

  it("--id 모드 + --comment-id 옵션 우선", () => {
    const result = parseCommentFilePositional({
      idOpt: "post-id",
      commentIdOpt: "c2",
      arg1: "c1",
      requireSecondary: false,
    });
    expect(result.commentId).toBe("c2");
  });

  it("옵션 모드 + --file 옵션 폴백 (positional 미입력)", () => {
    const result = parseCommentFilePositional({
      idOpt: "post-id",
      commentIdOpt: "c",
      secondaryOpt: "s",
      requireSecondary: true,
      secondaryLabel: fileLabel,
    });
    expect(result).toEqual({ projectArg: undefined, postNumberArg: undefined, commentId: "c", secondary: "s" });
  });

  it("--id 모드 + arg3 있으면 에러", () => {
    expect(() =>
      parseCommentFilePositional({
        idOpt: "post-id",
        arg1: "c",
        arg3: "x",
        requireSecondary: false,
      }),
    ).toThrow(expect.objectContaining({ exitCode: EXIT_PARAM_ERROR }));
  });

  it("commentId 미입력 — 에러", () => {
    expect(() =>
      parseCommentFilePositional({ requireSecondary: false }),
    ).toThrow(
      expect.objectContaining({
        exitCode: EXIT_PARAM_ERROR,
        message: expect.stringContaining("--comment-id"),
      }),
    );
  });

  it("requireSecondary=true + secondary 누락 — secondaryLabel 메시지 사용", () => {
    expect(() =>
      parseCommentFilePositional({
        arg1: "p",
        arg2: "n",
        arg3: "c",
        requireSecondary: true,
        secondaryLabel: fileLabel,
      }),
    ).toThrow(
      expect.objectContaining({
        exitCode: EXIT_PARAM_ERROR,
        message: expect.stringContaining("--file"),
      }),
    );
  });
});
