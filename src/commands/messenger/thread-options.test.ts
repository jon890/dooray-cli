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
      '--body 과 --thread-body 에 동시에 "-" 를 줄 수 없습니다. stdin 은 한 번만 읽습니다.',
    );
  });

  // 에러 문구가 실제로 준 옵션 이름을 낸다. 계열 이름으로 고정하면
  // --body-file 을 준 사용자가 --body 를 지적받아 어느 옵션을 고칠지 알 수 없다.
  it("--body-file - 와 --thread-body-file - 를 함께 주면 그 옵션 이름으로 에러를 낸다", () => {
    const result = checkThreadOptions({ bodyFile: "-", threadBodyFile: "-" });
    expect(result.error).toBe(
      '--body-file 과 --thread-body-file 에 동시에 "-" 를 줄 수 없습니다. stdin 은 한 번만 읽습니다.',
    );
  });

  it("--body - 와 --thread-body-file - 처럼 계열이 섞여도 준 옵션을 낸다", () => {
    const result = checkThreadOptions({ body: "-", threadBodyFile: "-" });
    expect(result.error).toBe(
      '--body 과 --thread-body-file 에 동시에 "-" 를 줄 수 없습니다. stdin 은 한 번만 읽습니다.',
    );
  });
});
