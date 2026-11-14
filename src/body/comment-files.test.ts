import { describe, it, expect } from "vitest";
import { appendFileReference, removeFileReference } from "./comment-files.js";

describe("appendFileReference", () => {
  it.each(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif", "heic"])(
    "%s 이미지 확장자 → 이미지 reference",
    (extension) => {
      expect(appendFileReference("", `image.${extension}`, "1234567890123456789"))
        .toBe(`![image.${extension}](/files/1234567890123456789)`);
    },
  );

  it("대문자 이미지 확장자도 이미지 reference", () => {
    expect(appendFileReference("", "IMAGE.JPEG", "123"))
      .toBe("![IMAGE.JPEG](/files/123)");
  });

  it.each(["index.html", "manual.pdf", "data.xlsx", "README"])(
    "%s 비이미지 파일 → 일반 링크",
    (fileName) => {
      expect(appendFileReference("", fileName, "456"))
        .toBe(`[${fileName}](/files/456)`);
    },
  );

  it("빈 본문 → reference 만 반환", () => {
    expect(appendFileReference("", "image.png", "1234567890123456789"))
      .toBe("![image.png](/files/1234567890123456789)");
  });

  it("기존 본문 끝에 빈 줄로 분리해서 append", () => {
    const result = appendFileReference("hello world", "x.png", "9876543210987654321");
    expect(result).toBe("hello world\n\n![x.png](/files/9876543210987654321)");
  });

  it("기존 본문이 개행으로 끝나도 빈 줄 정확히 1 개", () => {
    const result = appendFileReference("line1\n", "y.png", "1111");
    expect(result).toBe("line1\n\n![y.png](/files/1111)");
  });

  it("filename 의 [] 는 이스케이프 (markdown 깨짐 방지)", () => {
    expect(appendFileReference("", "[draft].png", "222"))
      .toBe("![draft.png](/files/222)");
  });
});

describe("removeFileReference", () => {
  it("reference 만 있는 줄은 통째로 제거", () => {
    const body = "hello\n![x.png](/files/123)\nworld";
    expect(removeFileReference(body, "123").body).toBe("hello\nworld");
  });

  it("줄 끝에 섞인 reference 는 빈 문자열로 치환 (텍스트 보존)", () => {
    const body = "see ![x.png](/files/123) here";
    expect(removeFileReference(body, "123").body).toBe("see  here");
  });

  it("일반 링크만 있는 줄은 통째로 제거", () => {
    const body = "hello\n[manual.pdf](/files/123)\nworld";
    expect(removeFileReference(body, "123").body).toBe("hello\nworld");
  });

  it("문장 안의 일반 링크는 링크만 제거", () => {
    const body = "see [manual.pdf](/files/123) here";
    expect(removeFileReference(body, "123").body).toBe("see  here");
  });

  it("같은 fileId 의 이미지와 일반 링크를 모두 제거", () => {
    const body = "![image.png](/files/123)\n[manual.pdf](/files/123)";
    expect(removeFileReference(body, "123").body).toBe("");
  });

  it("다른 fileId 는 안 건드림", () => {
    const body = "![a.png](/files/111)\n![b.png](/files/222)";
    expect(removeFileReference(body, "111").body).toBe("![b.png](/files/222)");
  });

  it("같은 fileId 다중 출현 모두 제거", () => {
    const body = "![a](/files/9)\nmid\n![a](/files/9)";
    expect(removeFileReference(body, "9").body).toBe("mid\n");
  });

  it("regex 특수문자 fileId 안전 (이스케이프)", () => {
    expect(removeFileReference("![x](/files/abc.def)", "abc.def").body).toBe("");
    expect(removeFileReference("![x](/files/abcXdef)", "abc.def").body)
      .toBe("![x](/files/abcXdef)");
  });

  it("찾으면 removed 가 참이다", () => {
    const result = removeFileReference("![x.png](/files/123)", "123");
    expect(result.removed).toBe(true);
    expect(result.body).toBe("");
  });

  it("못 찾으면 removed 가 거짓이고 본문이 그대로다", () => {
    const body = "![x.png](/files/999)";
    const result = removeFileReference(body, "123");
    expect(result.removed).toBe(false);
    expect(result.body).toBe(body);
  });

  it("text/html 본문의 마크다운 참조도 지운다", () => {
    const body = "<p>보고서</p>\n[manual.pdf](/files/123)";
    const result = removeFileReference(body, "123", "text/html");
    expect(result.removed).toBe(true);
    expect(result.body).toBe("<p>보고서</p>\n");
  });

  it("text/html 본문에서 다른 fileId 는 남는다", () => {
    const body = "[a.pdf](/files/111)\n[b.pdf](/files/222)";
    const result = removeFileReference(body, "111", "text/html");
    expect(result.removed).toBe(true);
    expect(result.body).toBe("[b.pdf](/files/222)");
  });

  it("형식을 주지 않으면 마크다운 정규식으로 동작한다", () => {
    expect(removeFileReference("![x.png](/files/123)", "123").body).toBe("");
  });
});

describe("appendFileReference 의 형식 인자", () => {
  it("text/html 본문에는 표기가 확인되지 않아 던진다", () => {
    expect(() => appendFileReference("", "x.png", "123", "text/html")).toThrow(
      /checkMarkupSupport/,
    );
  });

  it("형식을 주지 않으면 마크다운 표기로 붙는다", () => {
    expect(appendFileReference("", "x.png", "123")).toBe("![x.png](/files/123)");
  });
});
