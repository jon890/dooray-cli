import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebClient } from "../web/index.js";

const fixtures = JSON.parse(readFileSync(new URL("../web/fixtures/stream/responses.json", import.meta.url), "utf8"));
const client = () => createWebClient("fake-session", "https://my-org.dooray.com", "https://api.dooray.com");

function respond(body: unknown) {
  const calls: URL[] = [];
  vi.stubGlobal("fetch", vi.fn(async (request: Request) => { calls.push(new URL(request.url)); return Response.json(body); }));
  return calls;
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("웹 스트림", () => {
  it("services 를 항상 보내고 size·before·read 를 그대로 넘긴다", async () => {
    const calls = respond(fixtures.empty);
    await client().getStreams({ size: 50, before: "cursor-0", read: false });
    expect(calls[0].pathname).toBe("/v2/wapi/streams");
    expect(Object.fromEntries(calls[0].searchParams)).toEqual({ services: "project,mail,calendar,drive,wiki,contacts,ai", size: "50", before: "cursor-0", read: "false" });
  });

  it("카드를 공식 원소로 바꾸고 하위 항목을 원소로 펼친다", async () => {
    respond(fixtures.page);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const res = await client().getStreams({ size: 20 });
    expect(res.result!.map((i) => i.type)).toEqual(["mail", "post", "event", "page", "pageComment", "schedule"]);
    const [mail, post, event, page, comment, schedule] = res.result! as Record<string, Record<string, unknown>>[] & Record<string, never>[];
    expect(mail.mail).toEqual({
      id: "mail-1", folder: { id: "1", name: "받은 편지함" }, sentAt: "2026-11-14T01:00:00+09:00", subject: "안내",
      users: { from: { type: "emailUser", emailUser: { name: "보낸이", emailAddress: "sender@example.com" } } }, body: { mimeType: "text/plain", content: "본문" },
    });
    expect(post.post).toEqual({
      read: false, id: "post-1", projectId: "project-1", subject: "업무", body: { mimeType: "text/x-markdown", content: "내용" },
      createdAt: "2026-11-14T01:00:00+09:00", updatedAt: "2026-11-14T01:10:00+09:00",
      users: {
        from: { type: "member", member: { organizationMemberId: "member-1", name: "홍길동" } },
        to: [{ type: "member", member: { organizationMemberId: "member-2", name: "김철수" } }],
        cc: [{ type: "group", group: { projectMemberGroupId: "group-1" } }],
      },
    });
    expect(event.event).toEqual({ read: true, id: "comment-1", type: "comment", postId: "post-1", creator: { type: "member", member: { organizationMemberId: "member-1", name: "홍길동" } }, body: { mimeType: "text/x-markdown", content: "댓글" } });
    expect(page.page).toEqual({
      read: false, id: "page-1", wikiId: "wiki-1", subject: "문서", referrers: [{ organizationMemberId: "member-2" }], body: { mimeType: "text/x-markdown", content: "위키" },
      creator: { organizationMemberId: "member-1", name: "홍길동" }, createdAt: "2026-11-14T01:07:00+09:00",
    });
    expect(comment.pageComment).toMatchObject({ read: false, id: "pagecomment-1", pageId: "page-1", createdAt: "2026-11-14T01:08:00+09:00" });
    expect(schedule.schedule).toMatchObject({ read: true, id: "event-1", calendarId: "calendar-1", wholeDayFlag: false, recurrenceType: "none" });
    expect(schedule.schedule).not.toHaveProperty("recurrenceRule");
    stderr.mockRestore();
  });

  it("다음 페이지 커서를 최상위 cursor 로 올린다. 끝에서는 cursor 가 없다", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    respond(fixtures.page);
    expect((await client().getStreams()).cursor).toBe("cursor-1");
    respond(fixtures.empty);
    const last = await client().getStreams();
    expect(last.result).toEqual([]);
    expect(last).not.toHaveProperty("cursor");
  });

  it("공식 종류에 없는 항목을 빼고 처음 한 번만 stderr 로 알린다", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    respond(fixtures.page);
    const c = client();
    await c.getStreams();
    await c.getStreams();
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(String(stderr.mock.calls[0][0])).toContain("공식 활동 종류에 없는");
  });

  it("참조 맵에 없는 카드는 구조가 바뀐 것이라 API 오류로 멈춘다", async () => {
    const broken = structuredClone(fixtures.page);
    delete broken.result.references.mailMap["mail-1"];
    respond(broken);
    await expect(client().getStreams()).rejects.toMatchObject({ exitCode: 1 });
  });

  it("한 페이지가 전부 공식 종류 밖이라 비면 다음 페이지를 이어 받아 끝으로 오해하지 않게 한다", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const onlyDropped = { header: fixtures.page.header, result: { totalCount: 1, contents: [fixtures.page.result.contents[4]], references: { nextTimestamp: "cursor-2" } } };
    const bodies = [onlyDropped, fixtures.page];
    const calls: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (request: Request) => { calls.push(new URL(request.url)); return Response.json(bodies[Math.min(calls.length - 1, 1)]); }));
    const res = await client().getStreams({ size: 1 });
    expect(calls).toHaveLength(2);
    expect(calls[1].searchParams.get("before")).toBe("cursor-2");
    expect(res.result!.length).toBeGreaterThan(0);
  });
});
