import { describe, expect, it } from "vitest";
import { checkThreadOptions } from "./thread-options.js";

describe("checkThreadOptions", () => {
  it("--channel 과 --body 기본 조합은 경고도 에러도 없다", () => {
    expect(checkThreadOptions({ body: "본문" })).toEqual({ warnings: [] });
  });

  it("--body 와 --thread-body 를 함께 주면 경고도 에러도 없다", () => {
    expect(checkThreadOptions({ body: "본문", threadBody: "첫 메시지" })).toEqual({
      warnings: [],
    });
  });

  it("--log 와 --body 조합은 경고도 에러도 없다", () => {
    expect(checkThreadOptions({ log: "1234567890123456789", body: "본문" })).toEqual({
      warnings: [],
    });
  });

  it("--log 와 --thread-body 를 함께 주면 경고 대상이다", () => {
    const result = checkThreadOptions({
      log: "1234567890123456789",
      body: "본문",
      threadBody: "첫 메시지",
    });
    expect(result.warnings).toHaveLength(1);
    expect(result.error).toBeUndefined();
  });

  it("--log 와 --thread-body-file 을 함께 주면 경고 대상이다", () => {
    const result = checkThreadOptions({
      log: "1234567890123456789",
      body: "본문",
      threadBodyFile: "./thread.txt",
    });
    expect(result.warnings).toHaveLength(1);
    expect(result.error).toBeUndefined();
  });

  it("--thread-body 와 --thread-body-file 을 함께 주면 에러다", () => {
    const result = checkThreadOptions({
      body: "본문",
      threadBody: "첫 메시지",
      threadBodyFile: "./thread.txt",
    });
    expect(result.error).toBe(
      "--thread-body와 --thread-body-file은 함께 사용할 수 없습니다.",
    );
  });

  it("--body - 와 --thread-body - 를 함께 주면 에러다", () => {
    const result = checkThreadOptions({ body: "-", threadBody: "-" });
    expect(result.error).toBe(
      "--body와 --thread-body는 동시에 stdin(-)을 지정할 수 없습니다.",
    );
  });

  it("--body-file - 와 --thread-body-file - 를 함께 주면 에러다", () => {
    const result = checkThreadOptions({ bodyFile: "-", threadBodyFile: "-" });
    expect(result.error).toBe(
      "--body와 --thread-body는 동시에 stdin(-)을 지정할 수 없습니다.",
    );
  });
});
