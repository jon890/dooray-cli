import { describe, expect, it, vi } from "vitest";
import { checkTaskLinks } from "./link-check.js";

const ORG = "1234567890123456789";
const POST = "9876543210987654321";
const OTHER = "1111222233334444555";

function clientWith(posts: Record<string, { code: string; number: number; subject: string; workflowClass: string }>) {
  return {
    getPostStandalone: vi.fn(async (postId: string) => {
      const p = posts[postId];
      if (!p) throw new Error("API 호출 실패 (404)");
      return {
        result: {
          id: postId,
          project: { id: "p", code: p.code },
          number: p.number,
          subject: p.subject,
          workflowClass: p.workflowClass,
        },
      } as never;
    }),
  };
}

const client = clientWith({
  [POST]: { code: "my-project", number: 505, subject: "[MOD] 한도", workflowClass: "working" },
  [OTHER]: { code: "my-project", number: 518, subject: "다른 업무", workflowClass: "closed" },
});

describe("checkTaskLinks", () => {
  it("문제가 없으면 본문 그대로 오류 없이 돌려준다", async () => {
    const body = `[my-project/505 &#91;MOD&#93; 한도](dooray://${ORG}/tasks/${POST} "working")`;
    const r = await checkTaskLinks(client, body, { orgId: ORG, tenantName: "x", fix: false });
    expect(r).toEqual({ body, errors: [], fixed: [], warnings: [] });
  });

  it("표시 글의 대괄호를 멈추고 고친 꼴을 보여 준다", async () => {
    const body = `[my-project/505 [MOD] 한도](dooray://${ORG}/tasks/${POST} "working")`;
    const r = await checkTaskLinks(client, body, { orgId: ORG, fix: false });
    expect(r.body).toBe(body);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({
      kinds: ["bracket"],
      fixable: true,
      suggestion: `[my-project/505 &#91;MOD&#93; 한도](dooray://${ORG}/tasks/${POST} "working")`,
    });
  });

  it("--fix-links 면 대괄호를 엔티티로 바꾼 본문을 돌려준다", async () => {
    const body = `앞\n[my-project/505 [MOD] 한도](dooray://${ORG}/tasks/${POST} "working")\n뒤`;
    const r = await checkTaskLinks(client, body, { orgId: ORG, fix: true });
    expect(r.errors).toEqual([]);
    expect(r.fixed).toHaveLength(1);
    expect(r.body).toBe(`앞\n[my-project/505 &#91;MOD&#93; 한도](dooray://${ORG}/tasks/${POST} "working")\n뒤`);
  });

  it.each([
    `https://x.dooray.com/project/tasks/${POST}`,
    `https://x.dooray.com/task/${ORG}/${POST}`,
  ])("업무 웹 주소 %s 를 멈추고 --fix-links 면 dooray:// 꼴로 바꾼다", async (url) => {
    const body = `[my-project/505 [MOD] 한도](${url})`;
    const expected = `[my-project/505 &#91;MOD&#93; 한도](dooray://${ORG}/tasks/${POST} "working")`;

    const stop = await checkTaskLinks(client, body, { orgId: ORG, tenantName: "x", fix: false });
    expect(stop.errors[0]).toMatchObject({ kinds: ["bracket", "web-url"], suggestion: expected });

    const fix = await checkTaskLinks(client, body, { orgId: ORG, tenantName: "x", fix: true });
    expect(fix.errors).toEqual([]);
    expect(fix.body).toBe(expected);
  });

  it("표시 글 번호와 postId 의 실제 번호가 다르면 --fix-links 여도 멈춘다", async () => {
    const body = `[my-project/520 새 업무](dooray://${ORG}/tasks/${OTHER} "working")`;
    const r = await checkTaskLinks(client, body, { orgId: ORG, fix: true });
    expect(r.body).toBe(body);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({
      kinds: ["number-mismatch"],
      fixable: false,
      suggestion: `[my-project/518 다른 업무](dooray://${ORG}/tasks/${OTHER} "closed")`,
    });
    expect(r.errors[0].message).toContain("my-project/518");
  });

  it("조회가 실패하면 번호 대조를 건너뛰고 경고만 한다", async () => {
    const missing = "2222333344445555666";
    const body = `[my-project/1 제목](dooray://${ORG}/tasks/${missing})`;
    const r = await checkTaskLinks(client, body, { orgId: ORG, fix: false });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain(missing);
  });

  it("조회하지 못한 웹 주소는 --fix-links 여도 고치지 않고 멈춘다", async () => {
    const missing = "2222333344445555666";
    const body = `[my-project/1 제목](https://x.dooray.com/project/tasks/${missing})`;
    const r = await checkTaskLinks(client, body, { orgId: ORG, tenantName: "x", fix: true });
    expect(r.body).toBe(body);
    expect(r.errors[0]).toMatchObject({ kinds: ["web-url"], fixable: false });
  });

  it("같은 postId 는 한 번만 조회한다", async () => {
    const c = clientWith({ [POST]: { code: "my-project", number: 505, subject: "s", workflowClass: "working" } });
    const link = `[my-project/505 s](dooray://${ORG}/tasks/${POST})`;
    await checkTaskLinks(c, `${link}\n${link}`, { orgId: ORG, fix: false });
    expect(c.getPostStandalone).toHaveBeenCalledTimes(1);
  });
});
