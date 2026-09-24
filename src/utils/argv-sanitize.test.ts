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

describe("sanitizeArgv — config set 값", () => {
  it("api-key 값 위치를 마스킹한다", () => {
    expect(sanitizeArgv(["config", "set", "api-key", "MY_SECRET_TOKEN_XXX"]))
      .toEqual(["config", "set", "api-key", "***"]);
  });
  it("전역 옵션이 앞에 있어도 마스킹한다", () => {
    expect(sanitizeArgv(["--json", "config", "set", "imap-password", "p@ss"]))
      .toEqual(["--json", "config", "set", "imap-password", "***"]);
  });
  it("키 종류와 관계없이 값을 가린다", () => {
    expect(sanitizeArgv(["config", "set", "imap-port", "993"]))
      .toEqual(["config", "set", "imap-port", "***"]);
  });
  it("오타 키로 실패한 명령의 값도 가린다", () => {
    const out = sanitizeArgv(["config", "set", "apikey", "MY_SECRET_TOKEN_XXX"]);
    expect(out).toEqual(["config", "set", "apikey", "***"]);
  });
  it("키 앞에 옵션이 끼어도 값 자리를 가린다", () => {
    expect(sanitizeArgv(["config", "set", "--no-color", "api-key", "TOKEN_X"]))
      .toEqual(["config", "set", "--no-color", "api-key", "***"]);
  });
  it("키와 값 사이의 옵션은 건너뛰고 값을 가린다", () => {
    expect(sanitizeArgv(["config", "set", "api-key", "--no-color", "TOKEN_X"]))
      .toEqual(["config", "set", "api-key", "--no-color", "***"]);
  });
  it("`--` 뒤의 토큰은 옵션처럼 보여도 값으로 가린다", () => {
    expect(sanitizeArgv(["config", "set", "api-key", "--", "-abc"]))
      .toEqual(["config", "set", "api-key", "--", "***"]);
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
