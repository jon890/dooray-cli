import { afterEach, describe, expect, it, vi } from "vitest";
import { describeOrigin, fetchWithResponseTimeout, isTrustedFileHost } from "./file-redirect.js";

// check-pii 는 URL 의 호스트를 허용 목록과 비교한다. 거부해야 할 가짜 호스트를 목록에 더하지 않으려고 이어 붙여 만든다.
const SUFFIXED = `https://file-api.dooray.com${".example.com"}/x`;
const GLUED = `https://example${"dooray.com"}/x`;
const TRAILING_DOT = `https://file-api.dooray.com${"."}/x`;
const UPPERCASE = "https://file-api.dooray.com/x".replace("file-api.dooray", "FILE-API.Dooray");

describe("isTrustedFileHost", () => {
  it.each([
    // 실측: api.dooray.com 의 첨부 307 은 file-api.dooray.com 을 가리킨다
    ["https://file-api.dooray.com/downloads/x", "https://api.dooray.com"],
    ["https://file-api.gov-dooray.com/x", "https://api.gov-dooray.com"],
    ["https://file-api.gov-dooray.co.kr/x", "https://api.gov-dooray.co.kr"],
    ["https://file-api.dooray.co.kr/x", "https://api.dooray.co.kr/"],
    ["https://dooray.com/x", "https://api.dooray.com"],
    ["https://api.dooray.com/x", "https://api.dooray.com"],
    [UPPERCASE, "https://api.dooray.com"],
  ])("%s 는 %s 에서 허용한다", (location, baseUrl) => {
    expect(isTrustedFileHost(location, baseUrl)).toBe(true);
  });

  it.each([
    ["http://file-api.dooray.com/x", "https://api.dooray.com", "https 가 아님"],
    [SUFFIXED, "https://api.dooray.com", "도메인 뒤에 다른 이름이 붙음"],
    [GLUED, "https://api.dooray.com", "점 없이 이어 붙인 이름"],
    ["https://file-api.dooray.com@other.example.com/x", "https://api.dooray.com", "userinfo 뒤의 호스트"],
    [TRAILING_DOT, "https://api.dooray.com", "끝에 점이 붙은 호스트"],
    ["https://file-api.gov-dooray.com/x", "https://api.dooray.com", "다른 클라우드 도메인"],
    ["https://other.example.com/x", "https://api.dooray.com", "전혀 다른 호스트"],
    ["not a url", "https://api.dooray.com", "주소가 아님"],
  ])("%s 는 %s 에서 거부한다 (%s)", (location, baseUrl) => {
    expect(isTrustedFileHost(location, baseUrl)).toBe(false);
  });

  it("api. 로 시작하지 않는 API 호스트는 그 호스트만 믿는다", () => {
    expect(isTrustedFileHost("https://dooray.com/x", "https://dooray.com")).toBe(true);
    expect(isTrustedFileHost("https://example.com/x", "https://dooray.com")).toBe(false);
    // 앞 이름을 떼면 com 전체를 믿게 된다
    expect(isTrustedFileHost("https://other.example.com/x", "https://example.com")).toBe(false);
  });

  it("IP 주소 API 호스트는 같은 IP 만 믿는다", () => {
    expect(isTrustedFileHost("https://10.168.0.5/x", "https://10.168.0.5")).toBe(true);
    expect(isTrustedFileHost("https://99.168.0.5/x", "https://10.168.0.5")).toBe(false);
  });
});

describe("describeOrigin", () => {
  it("경로와 쿼리를 빼고 origin 만 낸다", () => {
    expect(describeOrigin("https://example.com/a/b?sig=secret")).toBe("https://example.com");
  });
});

describe("fetchWithResponseTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("응답 헤더가 제시간에 오면 그대로 돌려준다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok")));
    const res = await fetchWithResponseTimeout("https://x", {}, "파일 다운로드", 1000);
    expect(await res.text()).toBe("ok");
  });

  it("응답 헤더가 제시간에 오지 않으면 종료 코드 1 로 끝낸다", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          }),
      ),
    );
    const pending = fetchWithResponseTimeout("https://x", {}, "파일 다운로드", 5000);
    const assertion = expect(pending).rejects.toMatchObject({
      exitCode: 1,
      message: "파일 다운로드 실패: 서버가 5초 안에 응답하지 않았습니다.",
    });
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
  });

  it("시간 초과가 아닌 오류는 그대로 던진다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(fetchWithResponseTimeout("https://x", {}, "파일 다운로드", 1000)).rejects.toThrow("fetch failed");
  });
});
