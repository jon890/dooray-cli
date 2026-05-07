import { describe, it, expect } from "vitest";
import { sanitizeArgv } from "./argv-sanitize.js";

describe("sanitizeArgv", () => {
  it("--api-key=value 마스킹", () => {
    expect(sanitizeArgv(["dooray", "post", "--api-key=secret123"]))
      .toEqual(["dooray", "post", "--api-key=***"]);
  });
  it("--api-key value 분리 형태 마스킹", () => {
    expect(sanitizeArgv(["dooray", "--api-key", "secret123", "post"]))
      .toEqual(["dooray", "--api-key", "***", "post"]);
  });
  it("--token / --password 동일 처리", () => {
    expect(sanitizeArgv(["--token=t", "--password=p"]))
      .toEqual(["--token=***", "--password=***"]);
  });
  it("Authorization 헤더 인자 마스킹", () => {
    expect(sanitizeArgv(["--header", "Authorization: Bearer abc123"]))
      .toEqual(["--header", "Authorization: ***"]);
  });
  it("일반 인자는 그대로", () => {
    expect(sanitizeArgv(["dooray", "post", "create", "<project>", "--title", "X"]))
      .toEqual(["dooray", "post", "create", "<project>", "--title", "X"]);
  });
  it("회귀 가드 — secret 단어가 결과에 0건", () => {
    const out = sanitizeArgv(["--api-key", "MY_SECRET_TOKEN_XXX"]);
    expect(out.join(" ")).not.toContain("MY_SECRET_TOKEN_XXX");
  });
});
