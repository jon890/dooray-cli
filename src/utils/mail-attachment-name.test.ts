import { describe, expect, it } from "vitest";
import { assignAttachmentFileNames } from "./mail-attachment-name.js";

function names(filenames: Array<string | undefined>): string[] {
  const map = assignAttachmentFileNames(filenames.map((filename, i) => ({ index: i + 1, filename })));
  return filenames.map((_, i) => map.get(i + 1) as string);
}

describe("assignAttachmentFileNames", () => {
  it("겹치지 않는 이름은 그대로 둔다", () => {
    expect(names(["a.txt", "b.txt"])).toEqual(["a.txt", "b.txt"]);
  });

  it("이름이 없으면 attachment-<순번> 이다", () => {
    expect(names([undefined, "x.txt", undefined])).toEqual(["attachment-1", "x.txt", "attachment-3"]);
  });

  it("경로가 든 이름은 basename 만 쓴다", () => {
    expect(names(["../a/b.txt"])).toEqual(["b.txt"]);
  });

  it("같은 이름 둘은 두 번째에 순번을 붙인다", () => {
    expect(names(["a.crt", "a.crt"])).toEqual(["a.crt", "a-2.crt"]);
  });

  it("확장자 없는 이름과 .env 의 중복도 구분한다", () => {
    expect(names(["README", "README", ".env", ".env"])).toEqual([
      "README",
      "README-2",
      ".env",
      ".env-4",
    ]);
  });

  it("255바이트를 넘는 이름은 attachment-<순번> 이다", () => {
    expect(names(["x".repeat(256) + ".txt"])).toEqual(["attachment-1"]);
  });

  it("순번을 붙인 이름이 255바이트를 넘으면 attachment-<순번> 으로 바꾼다", () => {
    const long = "x".repeat(251) + ".txt";
    expect(names([long, long])).toEqual([long, "attachment-2"]);
  });

  it("바꾼 이름이 또 겹치면 n 을 올려 빈 이름을 찾는다", () => {
    expect(names(["a", "a-3", "a"])).toEqual(["a", "a-3", "a-3-2"]);
  });

  it("대소문자만 다른 이름은 같은 이름으로 본다", () => {
    expect(names(["A.crt", "a.crt"])).toEqual(["A.crt", "a-2.crt"]);
  });

  it("대체 이름 attachment-<순번> 도 중복 검사를 거친다", () => {
    expect(names(["attachment-2", undefined])).toEqual(["attachment-2", "attachment-2-2"]);
  });

  it("입력 순서와 상관없이 순번 오름차순으로 처리한다", () => {
    const map = assignAttachmentFileNames([
      { index: 2, filename: "a.crt" },
      { index: 1, filename: "a.crt" },
    ]);
    expect(map.get(1)).toBe("a.crt");
    expect(map.get(2)).toBe("a-2.crt");
  });
});
