import { describe, expect, it } from "vitest";
import {
  applyReplacements,
  escapeBrackets,
  findTaskLinks,
  hasUnescapedBrackets,
  parseLinkTextRef,
} from "./link-check.js";

const ORG = "1234567890123456789";
const POST = "9876543210987654321";

describe("findTaskLinks", () => {
  it("dooray:// 업무 링크와 title 을 찾는다", () => {
    const body = `앞 [my-project/1 제목](dooray://${ORG}/tasks/${POST} "working") 뒤`;
    const [link] = findTaskLinks(body);
    expect(link).toMatchObject({
      text: "my-project/1 제목",
      postId: POST,
      kind: "dooray",
      title: "working",
      raw: `[my-project/1 제목](dooray://${ORG}/tasks/${POST} "working")`,
    });
    expect(body.slice(link.start, link.end)).toBe(link.raw);
  });

  it("표시 글에 대괄호가 짝지어 들어 있어도 링크 시작을 맞게 찾는다", () => {
    const body = `[my-project/505 [MOD] 한도](dooray://${ORG}/tasks/${POST})`;
    const [link] = findTaskLinks(body);
    expect(link.start).toBe(0);
    expect(link.text).toBe("my-project/505 [MOD] 한도");
  });

  it("짝이 안 맞는 대괄호도 앞 링크를 넘지 않는다", () => {
    const body = `[a](https://example.com) [my-project/2 MOD] 한도](dooray://${ORG}/tasks/${POST})`;
    const links = findTaskLinks(body);
    expect(links).toHaveLength(1);
    expect(links[0].text).toBe("my-project/2 MOD] 한도");
  });

  it("같은 테넌트의 업무 웹 주소 두 꼴을 찾는다", () => {
    const body = [
      `[my-project/1 a](https://x.dooray.com/project/tasks/${POST})`,
      `[my-project/2 b](https://x.dooray.com/task/${ORG}/${POST})`,
    ].join("\n");
    const links = findTaskLinks(body, "x");
    expect(links.map((l) => l.kind)).toEqual(["web", "web"]);
    expect(links.map((l) => l.postId)).toEqual([POST, POST]);
  });

  it("다른 테넌트 웹 주소와 업무가 아닌 링크는 보지 않는다", () => {
    const body = [
      `[a](https://example.dooray.com/project/tasks/${POST})`,
      `[b](https://example.com/project/tasks/${POST})`,
      `[c](dooray://${ORG}/pages/${POST})`,
      `![d](dooray://${ORG}/tasks/${POST})`,
    ].join("\n");
    expect(findTaskLinks(body, "x")).toEqual([]);
  });

  it("테넌트 이름이 없으면 *.dooray.com 을 모두 본다", () => {
    expect(findTaskLinks(`[a](https://example.dooray.com/project/tasks/${POST})`)).toHaveLength(1);
  });
});

describe("표시 글 판정", () => {
  it("이스케이프하지 않은 대괄호를 찾는다", () => {
    expect(hasUnescapedBrackets("my-project/1 [MOD] 제목")).toBe(true);
    expect(hasUnescapedBrackets("my-project/1 &#91;MOD&#93; 제목")).toBe(false);
  });

  it("대괄호만 엔티티로 바꾸고 기존 엔티티는 두 번 바꾸지 않는다", () => {
    expect(escapeBrackets("[MOD] &#91;x&#93; & y")).toBe("&#91;MOD&#93; &#91;x&#93; & y");
  });

  it("「프로젝트/번호」 를 읽는다", () => {
    expect(parseLinkTextRef("my-project/520 제목")).toEqual({ projectCode: "my-project", number: 520 });
    expect(parseLinkTextRef("my-project/520")).toEqual({ projectCode: "my-project", number: 520 });
    expect(parseLinkTextRef("관련 업무")).toBeNull();
  });
});

describe("applyReplacements", () => {
  it("여러 치환을 위치가 밀리지 않게 적용한다", () => {
    expect(applyReplacements("aXbYc", [
      { start: 1, end: 2, replacement: "111" },
      { start: 3, end: 4, replacement: "2" },
    ])).toBe("a111b2c");
  });
});
