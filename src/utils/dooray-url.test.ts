import { describe, it, expect } from "vitest";
import { parseDoorayTaskUrl, parseDoorayWikiUrl, isLikelyDoorayUrl } from "./dooray-url.js";

describe("parseDoorayTaskUrl", () => {
  it("정상 URL에서 postId 추출", () => {
    expect(parseDoorayTaskUrl("https://x.dooray.com/task/to/1234567890123456789"))
      .toBe("1234567890123456789");
  });
  it("query string 무시", () => {
    expect(parseDoorayTaskUrl("https://x.dooray.com/task/to/123?projectScope=from_to_cc"))
      .toBe("123");
  });
  it("hash 무시", () => {
    expect(parseDoorayTaskUrl("https://x.dooray.com/task/to/123#section"))
      .toBe("123");
  });
  it("trailing slash 허용", () => {
    expect(parseDoorayTaskUrl("https://x.dooray.com/task/to/123/")).toBe("123");
  });
  it("dooray.com 도메인이 아니면 null", () => {
    expect(parseDoorayTaskUrl("https://other.com/task/to/123")).toBeNull();
  });
  it("/task/to/ 경로가 아니면 null", () => {
    expect(parseDoorayTaskUrl("https://x.dooray.com/wiki/123")).toBeNull();
  });
  it("URL 형식이 아니면 null", () => {
    expect(parseDoorayTaskUrl("my-project/337")).toBeNull();
    expect(parseDoorayTaskUrl("12345")).toBeNull();
  });
  it("/task/<projectId>/<postId> 형 URL 에서 postId 추출", () => {
    expect(parseDoorayTaskUrl("https://example.dooray.com/task/1234567890123456789/9876543210987654321"))
      .toBe("9876543210987654321");
  });
  it("/task/<projectId>/<postId> 형도 query string 무시", () => {
    expect(parseDoorayTaskUrl("https://x.dooray.com/task/123/456?ref=foo"))
      .toBe("456");
  });
  it("/task/<projectId>/<postId> 형도 trailing slash 허용", () => {
    expect(parseDoorayTaskUrl("https://x.dooray.com/task/123/456/")).toBe("456");
  });
  it("/task/<projectId>/<postId> 형도 dooray.com 도메인 외 reject", () => {
    expect(parseDoorayTaskUrl("https://other.com/task/123/456")).toBeNull();
  });

  // Issue #83 — 브라우저 '프로젝트 업무 목록 → 업무 열기' URL
  it("/project/tasks/<postId> 에서 postId 추출", () => {
    expect(
      parseDoorayTaskUrl("https://x.dooray.com/project/tasks/1234567890123456789"),
    ).toBe("1234567890123456789");
  });

  it("/project/tasks/<postId> query string 무시", () => {
    expect(
      parseDoorayTaskUrl("https://x.dooray.com/project/tasks/1234567890123456789?workflowIds=a,b,c"),
    ).toBe("1234567890123456789");
  });

  it("/project/tasks/<postId> dooray.com 도메인 외 reject", () => {
    expect(parseDoorayTaskUrl("https://other.com/project/tasks/123")).toBeNull();
  });

  // Issue #83 — /task/{pid}/{id}?workflowIds= 회귀 (TASK_URL_ALT_RE 의 query 무시 확인)
  it("/task/<projectId>/<postId>?workflowIds=a,b,c query 무시 회귀", () => {
    expect(
      parseDoorayTaskUrl(
        "https://x.dooray.com/task/1234567890123456789/9876543210987654321?workflowIds=a,b,c",
      ),
    ).toBe("9876543210987654321");
  });
});

describe("parseDoorayWikiUrl", () => {
  it("표준 wiki URL → {wikiId, pageId}", () => {
    expect(parseDoorayWikiUrl("https://x.dooray.com/wiki/123/456"))
      .toEqual({ wikiId: "123", pageId: "456" });
  });
  it("쿼리 파라미터 무시", () => {
    expect(parseDoorayWikiUrl("https://my-org.dooray.com/wiki/123/456?foo=bar"))
      .toEqual({ wikiId: "123", pageId: "456" });
  });
  it("task URL 은 wiki parser 에서 null", () => {
    expect(parseDoorayWikiUrl("https://x.dooray.com/task/123/456")).toBeNull();
  });
});

describe("isLikelyDoorayUrl", () => {
  it("http(s) prefix 인식", () => {
    expect(isLikelyDoorayUrl("https://x.com")).toBe(true);
    expect(isLikelyDoorayUrl("http://x.com")).toBe(true);
  });
  it("URL 아니면 false", () => {
    expect(isLikelyDoorayUrl("my-project")).toBe(false);
    expect(isLikelyDoorayUrl("12345")).toBe(false);
  });
});
