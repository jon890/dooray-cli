import { describe, it, expect } from "vitest";
import { extractInlineFileIds } from "./inline-file-refs.js";

describe("extractInlineFileIds", () => {
  it("이미지 참조에서 id 를 뽑는다", () => {
    expect(extractInlineFileIds("![a.png](/files/123)")).toEqual(["123"]);
  });

  it("일반 파일 참조에서 id 를 뽑는다", () => {
    expect(extractInlineFileIds("[a.pdf](/files/123)")).toEqual(["123"]);
  });

  it("둘 이상이면 본문에 나온 순서대로 돌려준다", () => {
    const body = "![a.png](/files/456)\n\n[b.pdf](/files/123)";
    expect(extractInlineFileIds(body)).toEqual(["456", "123"]);
  });

  it("같은 id 가 두 번 나오면 하나만 남긴다", () => {
    const body = "![a.png](/files/123)\n![a.png](/files/123)";
    expect(extractInlineFileIds(body)).toEqual(["123"]);
  });

  it("참조가 없으면 빈 배열이다", () => {
    expect(extractInlineFileIds("본문에 참조가 없다")).toEqual([]);
  });

  it("빈 본문이면 빈 배열이다", () => {
    expect(extractInlineFileIds("")).toEqual([]);
  });

  it("HTML 앵커에서도 id 를 뽑는다", () => {
    expect(extractInlineFileIds('<img src="/files/123">')).toEqual(["123"]);
  });

  it("숫자가 아닌 경로는 대상이 아니다", () => {
    expect(extractInlineFileIds("/files/abc")).toEqual([]);
  });
});
