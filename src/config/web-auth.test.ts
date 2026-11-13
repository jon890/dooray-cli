import { describe, expect, it } from "vitest";
import { isConfigComplete, parseSessionCookie, resolveWebBaseUrl } from "./web-auth.js";
import { API_ENDPOINTS, type Config } from "./types.js";

const config: Config = { version: 1, apiKey: "", baseUrl: "https://api.dooray.com", tenantName: "test", authMode: "web", sessionCookie: "fake-cookie" };

describe("SESSION 쿠키 입력", () => {
  it.each(["fake-value==", "SESSION=fake-value==", " Cookie: a=1; SESSION=fake-value==; b=2 ", '"SESSION=fake-value=="', "'fake-value=='", "SESSION=fake-value==; SESSION=fake-value=="])("%s 에서 SESSION 값만 남긴다", (input) => {
    expect(parseSessionCookie(input)).toBe("fake-value==");
  });
  it.each(["", "SESSION=", "Cookie: a=1", "session=wrong", "JSESSIONID=wrong", "JSESSIONID=", "other=value", "a=1; b=2", "SESSION=a; SESSION=b", "two words", "비밀", "fake\r\nvalue", "a\tb"])("잘못된 입력을 값 노출 없이 거절한다", (input) => {
    expect(() => parseSessionCookie(input)).toThrow(expect.objectContaining({ exitCode: 3 }));
  });
});

describe("테넌트 주소와 설정 완료", () => {
  it.each(Object.values(API_ENDPOINTS))("알려진 클라우드 %s 의 테넌트 주소", (baseUrl) => {
    expect(resolveWebBaseUrl({ ...config, baseUrl })).toBe(baseUrl.replace("api.", "test."));
  });
  it.each(["", "example", "test.other", "test/other", "test#other", "test?other", "test@other", "TEST", " test", "test\n"])("손으로 바꾼 테넌트도 요청 전에 거절한다: %s", (tenantName) => {
    expect(() => resolveWebBaseUrl({ ...config, tenantName })).toThrow(expect.objectContaining({ exitCode: 4 }));
  });
  it.each(["http://api.dooray.com", "https://other.example.com", "https://api.dooray.com/path", "https://api.dooray.com?x=1", "https://user@api.dooray.com", "https://api.dooray.com:444"])("알려지지 않은 API 주소를 거절한다", (baseUrl) => {
    expect(() => resolveWebBaseUrl({ ...config, baseUrl })).toThrow(expect.objectContaining({ exitCode: 4 }));
  });
  it("웹이면 API 키 없이 완료하고 API 방식의 기존 조건은 유지한다", () => {
    expect(isConfigComplete(config)).toEqual([]);
    expect(isConfigComplete({ ...config, sessionCookie: "" })).toContain("session-cookie");
    expect(isConfigComplete({ ...config, authMode: undefined })).toEqual(["api-key"]);
    expect(isConfigComplete({ ...config, authMode: "api-key", apiKey: "fake-key" })).toEqual([]);
  });
});
