import { describe, it, expect } from "vitest";
import { buildLink, checkMarkupSupport, escapeLinkText } from "./body-markup.js";

describe("buildLink — text/x-markdown", () => {
  it("title 이 있으면 호버 title 포함", () => {
    expect(buildLink("text/x-markdown", { text: "t", url: "u", title: "c" }))
      .toBe('[t](u "c")');
  });

  it("title 이 없으면 title 생략", () => {
    expect(buildLink("text/x-markdown", { text: "t", url: "u" })).toBe("[t](u)");
  });

  it("image 가 참이면 앞에 ! 를 붙인다", () => {
    expect(buildLink("text/x-markdown", { text: "t", url: "u", image: true }))
      .toBe("![t](u)");
  });

  it("text 는 손대지 않는다 — 호출부가 이미 escape 를 마쳤다", () => {
    expect(buildLink("text/x-markdown", { text: "a [b] & c", url: "u" }))
      .toBe("[a [b] & c](u)");
  });

  it("title 의 따옴표만 &quot; 로 바꾼다", () => {
    expect(buildLink("text/x-markdown", { text: "t", url: "u", title: 'a"b' }))
      .toBe('[t](u "a&quot;b")');
  });

  it("BODY_MIME_TYPES 밖의 값은 마크다운으로 본다", () => {
    expect(buildLink("application/json", { text: "t", url: "u" })).toBe("[t](u)");
  });
});

describe("buildLink — text/html", () => {
  it("표기가 확인되지 않아 던진다 — checkMarkupSupport 를 건너뛴 호출이라는 뜻이다", () => {
    expect(() => buildLink("text/html", { text: "t", url: "u" })).toThrow(
      /checkMarkupSupport/,
    );
  });
});

describe("checkMarkupSupport", () => {
  it.each([
    "member-mention",
    "group-mention",
    "task-link",
    "file-reference",
  ] as const)("text/x-markdown 은 %s 를 지원한다", (kind) => {
    expect(checkMarkupSupport("text/x-markdown", kind).supported).toBe(true);
  });

  it.each([
    ["member-mention", "멤버 멘션"],
    ["group-mention", "그룹 멘션"],
    ["task-link", "업무 링크"],
    ["file-reference", "첨부 파일 reference"],
  ] as const)("text/html 의 %s 는 거절하고 종류 이름을 문구에 담는다", (kind, label) => {
    const result = checkMarkupSupport("text/html", kind);
    expect(result.supported).toBe(false);
    if (result.supported) throw new Error("거절을 기대했다");
    expect(result.message).toContain(label);
  });

  it("거절 문구는 --mime-type 으로 형식을 바꾸는 방법을 알린다", () => {
    const result = checkMarkupSupport("text/html", "member-mention");
    if (result.supported) throw new Error("거절을 기대했다");
    expect(result.message).toContain("--mime-type text/x-markdown");
  });

  it("알 수 없는 형식은 마크다운으로 보아 지원한다", () => {
    expect(checkMarkupSupport("application/json", "task-link").supported).toBe(true);
  });
});

describe("escapeLinkText", () => {
  it("[ ] — & 이스케이프", () => {
    expect(escapeLinkText("a [b] — c & d")).toBe("a &#91;b&#93; &mdash; c &amp; d");
  });
});
