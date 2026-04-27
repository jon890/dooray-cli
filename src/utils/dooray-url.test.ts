import { describe, it, expect } from "vitest";
import { parseDoorayTaskUrl, isLikelyDoorayUrl } from "./dooray-url.js";

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
