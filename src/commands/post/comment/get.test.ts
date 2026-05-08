import { describe, it, expect } from "vitest";
import { parseGetArgs } from "./get.js";
import { DoorayCliError } from "../../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../../utils/exit-codes.js";

describe("parseGetArgs", () => {
  it("positional 3개 → projectArg / postNumberArg / commentId", () => {
    const result = parseGetArgs("myproject", "337", "comment-123", {});
    expect(result.projectArg).toBe("myproject");
    expect(result.postNumberArg).toBe("337");
    expect(result.commentId).toBe("comment-123");
    expect(result.idOpt).toBeUndefined();
    expect(result.urlOpt).toBeUndefined();
  });

  it("--id + --comment-id → idOpt + commentId (projectArg 없음)", () => {
    const result = parseGetArgs(undefined, undefined, undefined, {
      id: "post-999",
      commentId: "comment-123",
    });
    expect(result.idOpt).toBe("post-999");
    expect(result.commentId).toBe("comment-123");
    expect(result.projectArg).toBeUndefined();
    expect(result.postNumberArg).toBeUndefined();
  });

  it("--url + --comment-id → urlOpt + commentId (projectArg 없음)", () => {
    const result = parseGetArgs(undefined, undefined, undefined, {
      url: "https://example.dooray.com/task/to/999",
      commentId: "comment-456",
    });
    expect(result.urlOpt).toBe("https://example.dooray.com/task/to/999");
    expect(result.commentId).toBe("comment-456");
    expect(result.projectArg).toBeUndefined();
  });

  it("positional + --id 동시 → DoorayCliError (EXIT_PARAM_ERROR)", () => {
    const err = (() => {
      try {
        parseGetArgs("myproject", "337", "comment-123", { id: "post-999" });
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(DoorayCliError);
    expect((err as DoorayCliError).exitCode).toBe(EXIT_PARAM_ERROR);
  });

  it("--id 만 있고 --comment-id 누락 → DoorayCliError (EXIT_PARAM_ERROR)", () => {
    const err = (() => {
      try {
        parseGetArgs(undefined, undefined, undefined, { id: "post-999" });
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(DoorayCliError);
    expect((err as DoorayCliError).exitCode).toBe(EXIT_PARAM_ERROR);
  });

  it("project + post-number + --comment-id → projectArg / postNumberArg / commentId", () => {
    const result = parseGetArgs("myproject", "337", undefined, { commentId: "comment-789" });
    expect(result.projectArg).toBe("myproject");
    expect(result.postNumberArg).toBe("337");
    expect(result.commentId).toBe("comment-789");
  });

  it("positional 3개 + --comment-id 동시 → DoorayCliError (EXIT_PARAM_ERROR)", () => {
    // ADR-020 분기 규칙: 모호한 입력은 silent fallback 대신 명시적 에러
    const err = (() => {
      try {
        parseGetArgs("myproject", "337", "comment-A", { commentId: "comment-B" });
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(DoorayCliError);
    expect((err as DoorayCliError).exitCode).toBe(EXIT_PARAM_ERROR);
  });
});
