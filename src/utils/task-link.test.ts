import { describe, it, expect } from "vitest";
import { escapeLinkText, buildTaskLink, appendTaskLinks } from "./task-link.js";
import type { CachedMe } from "../cache/types.js";

const ME: CachedMe = { id: "user-1", orgId: "1234567890123456789", name: "tester" };

describe("escapeLinkText", () => {
  it("[ ] — & 이스케이프", () => {
    expect(escapeLinkText("a [b] — c & d")).toBe("a &#91;b&#93; &mdash; c &amp; d");
  });
  it("이스케이프 대상 없으면 그대로", () => {
    expect(escapeLinkText("plain text")).toBe("plain text");
  });
});

describe("buildTaskLink", () => {
  it("workflowClass 있으면 호버 title 포함", () => {
    expect(buildTaskLink({
      projectCode: "demo", number: 42, postId: "9876543210987654321",
      subject: "feat: foo", workflowClass: "backlog",
    }, ME)).toBe('[demo/42 feat: foo](dooray://1234567890123456789/tasks/9876543210987654321 "backlog")');
  });
  it("workflowClass 없으면 title 생략", () => {
    expect(buildTaskLink({
      projectCode: "demo", number: 42, postId: "9876543210987654321",
      subject: "fix: bar",
    }, ME)).toBe("[demo/42 fix: bar](dooray://1234567890123456789/tasks/9876543210987654321)");
  });
});

describe("appendTaskLinks", () => {
  it("links 가 비어있으면 body 그대로", () => {
    expect(appendTaskLinks("hello", [], ME)).toBe("hello");
  });
  it("body 끝에 빈 줄 1개 + 링크 줄바꿈 append", () => {
    const out = appendTaskLinks("hello", [{
      projectCode: "demo", number: 1, postId: "9876543210987654321", subject: "x",
    }], ME);
    expect(out).toBe("hello\n\n[demo/1 x](dooray://1234567890123456789/tasks/9876543210987654321)");
  });
});
