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

describe("sanitizeArgv — config set 비밀값", () => {
  it("api-key 값 위치를 마스킹한다", () => {
    expect(sanitizeArgv(["config", "set", "api-key", "MY_SECRET_TOKEN_XXX"]))
      .toEqual(["config", "set", "api-key", "***"]);
  });
  it("imap-password 값도 마스킹한다 (전역 옵션이 앞에 있어도)", () => {
    const out = sanitizeArgv(["--json", "config", "set", "imap-password", "p@ss"]);
    expect(out).toEqual(["--json", "config", "set", "imap-password", "***"]);
  });
  it("비밀값이 아닌 키는 그대로 둔다", () => {
    expect(sanitizeArgv(["config", "set", "imap-port", "993"]))
      .toEqual(["config", "set", "imap-port", "993"]);
  });
  it("stdin 표시 `-` 는 값이 아니라 그대로 둔다", () => {
    expect(sanitizeArgv(["config", "set", "api-key", "-"]))
      .toEqual(["config", "set", "api-key", "-"]);
  });
  it("config get 이나 다른 명령의 같은 단어는 건드리지 않는다", () => {
    expect(sanitizeArgv(["config", "get", "api-key"]))
      .toEqual(["config", "get", "api-key"]);
    expect(sanitizeArgv(["post", "create", "api-key", "x"]))
      .toEqual(["post", "create", "api-key", "x"]);
  });
  it("--password= 규칙과 함께 동작한다", () => {
    expect(sanitizeArgv(["config", "set", "api-key", "tok", "--password=p"]))
      .toEqual(["config", "set", "api-key", "***", "--password=***"]);
  });
});

describe("sanitizeArgv — config 키 목록과의 정합", () => {
  it("secret 으로 표시한 모든 config 키의 값을 가린다", async () => {
    const { CONFIG_SET_KEYS } = await import("../config/types.js");
    const secretKeys = Object.entries(CONFIG_SET_KEYS)
      .filter(([, v]) => v.secret)
      .map(([k]) => k);
    expect(secretKeys).toEqual(expect.arrayContaining(["api-key", "imap-password"]));
    for (const key of secretKeys) {
      expect(sanitizeArgv(["config", "set", key, "VALUE_XYZ"]).join(" "))
        .not.toContain("VALUE_XYZ");
    }
  });
});
