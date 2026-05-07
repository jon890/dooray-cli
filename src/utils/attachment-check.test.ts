import { describe, it, expect } from "vitest";
import { extractAttachmentFileIds, findDroppedAttachments, sanitizeFileName } from "./attachment-check.js";

describe("extractAttachmentFileIds", () => {
  it("인라인 이미지 markdown 에서 id 추출", () => {
    expect(extractAttachmentFileIds("text ![](/files/123) more"))
      .toEqual(new Set(["123"]));
  });
  it("일반 링크 markdown 에서도 id 추출", () => {
    expect(extractAttachmentFileIds("[file](/files/abc-456)"))
      .toEqual(new Set(["abc-456"]));
  });
  it("여러 attachment 동시 추출", () => {
    expect(extractAttachmentFileIds("![](/files/1) ![alt](/files/2) [a](/files/3)"))
      .toEqual(new Set(["1", "2", "3"]));
  });
  it("attachment 가 없으면 빈 Set", () => {
    expect(extractAttachmentFileIds("plain text without files")).toEqual(new Set());
  });
  it("/files/ prefix 없는 경로는 무시", () => {
    expect(extractAttachmentFileIds("![](/uploads/123) [x](/other/456)"))
      .toEqual(new Set());
  });
  it("query string / fragment 가 붙어도 id 만 추출", () => {
    expect(extractAttachmentFileIds("![](/files/abc?dl=1) [x](/files/def#frag)"))
      .toEqual(new Set(["abc", "def"]));
  });
});

describe("findDroppedAttachments", () => {
  it("이전 본문에 있고 새 본문에 없으면 dropped", () => {
    const dropped = findDroppedAttachments(
      "old ![](/files/1)",
      "new content",
      [{ id: "1", name: "img.png" }],
    );
    expect(dropped).toEqual([{ id: "1", name: "img.png" }]);
  });
  it("이전 본문에 reference 가 없었으면 dropped 아님 (non-inline 첨부)", () => {
    const dropped = findDroppedAttachments(
      "old text",
      "new text",
      [{ id: "1", name: "doc.pdf" }],
    );
    expect(dropped).toEqual([]);
  });
  it("새 본문에 그대로 있으면 dropped 아님", () => {
    const dropped = findDroppedAttachments(
      "![](/files/1)",
      "modified ![](/files/1)",
      [{ id: "1" }],
    );
    expect(dropped).toEqual([]);
  });
});

describe("sanitizeFileName", () => {
  it("ANSI escape 제거", () => {
    expect(sanitizeFileName("evil\x1b[31mname")).toBe("evil?[31mname");
  });
  it("control char 제거", () => {
    expect(sanitizeFileName("a\x00b\x07c\x7fd")).toBe("a?b?c?d");
  });
  it("일반 문자 유지", () => {
    expect(sanitizeFileName("img.png")).toBe("img.png");
    expect(sanitizeFileName("한글파일.pdf")).toBe("한글파일.pdf");
  });
});
