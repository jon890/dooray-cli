import { describe, it, expect } from "vitest";
import { wikiInlineImageSnippet } from "./wiki-snippet.js";

describe("wikiInlineImageSnippet", () => {
  it("기본 ASCII 파일명 — 정확한 markdown 반환", () => {
    expect(wikiInlineImageSnippet("W", "F", "a.png")).toBe(
      "![a.png](/wikis/W/files/F)",
    );
  });

  it("공백 포함 파일명 — 그대로 보존", () => {
    expect(wikiInlineImageSnippet("wikiId123", "fileId456", "my image.png")).toBe(
      "![my image.png](/wikis/wikiId123/files/fileId456)",
    );
  });

  it("한글 파일명 — 그대로 보존", () => {
    expect(wikiInlineImageSnippet("wikiId123", "fileId456", "다이어그램.png")).toBe(
      "![다이어그램.png](/wikis/wikiId123/files/fileId456)",
    );
  });

  it("plain stdout prefix 와 --json markdownSnippet 이 동일 문자열", () => {
    const wikiId = "W1";
    const attachFileId = "F1";
    const name = "test.jpg";
    const snippet = wikiInlineImageSnippet(wikiId, attachFileId, name);
    // plain 출력은 "  " + snippet + "\n" — 헬퍼 반환값(raw snippet) 자체가 동일
    expect(snippet).toBe("![test.jpg](/wikis/W1/files/F1)");
  });
});
