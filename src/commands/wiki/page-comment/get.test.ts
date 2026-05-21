import { describe, it, expect } from "vitest";
import { parseGetArgs } from "./get.js";
import { DoorayCliError } from "../../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../../utils/exit-codes.js";

describe("parseGetArgs (wiki page comment)", () => {
  it("positional 3개 → projectArg / pageIdArg / commentId", () => {
    const result = parseGetArgs("myproject", "4071828729722696495", "comment-123", {});
    expect(result.projectArg).toBe("myproject");
    expect(result.pageIdArg).toBe("4071828729722696495");
    expect(result.commentId).toBe("comment-123");
    expect(result.idOpt).toBeUndefined();
    expect(result.urlOpt).toBeUndefined();
  });

  it("--url + --comment-id → urlOpt + commentId (projectArg 없음)", () => {
    const result = parseGetArgs(undefined, undefined, undefined, {
      url: "https://example.dooray.com/wiki/123/456",
      commentId: "comment-789",
    });
    expect(result.urlOpt).toBe("https://example.dooray.com/wiki/123/456");
    expect(result.commentId).toBe("comment-789");
    expect(result.projectArg).toBeUndefined();
    expect(result.pageIdArg).toBeUndefined();
  });

  it("--id + --project + --comment-id → idOpt + projectOpt + commentId", () => {
    const result = parseGetArgs(undefined, undefined, undefined, {
      id: "4071828729722696495",
      project: "myproject",
      commentId: "comment-123",
    });
    expect(result.idOpt).toBe("4071828729722696495");
    expect(result.projectOpt).toBe("myproject");
    expect(result.commentId).toBe("comment-123");
    expect(result.projectArg).toBeUndefined();
  });

  it("positional + --url 동시 → DoorayCliError (EXIT_PARAM_ERROR)", () => {
    const err = (() => {
      try {
        parseGetArgs("myproject", "4071828729722696495", "comment-123", {
          url: "https://example.dooray.com/wiki/123/456",
        });
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(DoorayCliError);
    expect((err as DoorayCliError).exitCode).toBe(EXIT_PARAM_ERROR);
  });

  it("--url 만 있고 --comment-id 누락 → DoorayCliError (EXIT_PARAM_ERROR)", () => {
    const err = (() => {
      try {
        parseGetArgs(undefined, undefined, undefined, {
          url: "https://example.dooray.com/wiki/123/456",
        });
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(DoorayCliError);
    expect((err as DoorayCliError).exitCode).toBe(EXIT_PARAM_ERROR);
  });

  it("positional 3개 + --comment-id 동시 → DoorayCliError (EXIT_PARAM_ERROR)", () => {
    const err = (() => {
      try {
        parseGetArgs("myproject", "4071828729722696495", "comment-A", {
          commentId: "comment-B",
        });
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(DoorayCliError);
    expect((err as DoorayCliError).exitCode).toBe(EXIT_PARAM_ERROR);
  });
});
