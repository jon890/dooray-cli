import { describe, it, expect } from "vitest";
import { parseDoorayTaskUrl, parseDoorayWikiUrl, isLikelyDoorayUrl } from "./dooray-url.js";

describe("parseDoorayTaskUrl", () => {
  it("정상 URL에서 postId 추출", () => {
    expect(parseDoorayTaskUrl("https://nhnent.dooray.com/task/to/4319587406666362045"))
      .toBe("4319587406666362045");
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
    expect(parseDoorayTaskUrl("tc-ocr/337")).toBeNull();
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
    expect(isLikelyDoorayUrl("tc-ocr")).toBe(false);
    expect(isLikelyDoorayUrl("12345")).toBe(false);
  });
});
