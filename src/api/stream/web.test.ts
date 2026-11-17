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
    expect(event.event).toEqual({
      read: true, id: "comment-1", type: "comment", postId: "post-1", creator: { type: "member", member: { organizationMemberId: "member-1", name: "홍길동" } },
      body: { mimeType: "text/x-markdown", content: "댓글" }, createdAt: "2026-11-14T01:02:00+09:00",
    });
    // 웹의 modifiedAt 이 null 이면 updatedAt 키를 넣지 않는다.
    expect(event.event).not.toHaveProperty("updatedAt");
    expect(page.page).toEqual({
      read: false, id: "page-1", wikiId: "wiki-1", subject: "문서", referrers: [{ organizationMemberId: "member-2" }], body: { mimeType: "text/x-markdown", content: "위키" },
      creator: { organizationMemberId: "member-1", name: "홍길동" }, createdAt: "2026-11-14T01:07:00+09:00",
    });
    expect(comment.pageComment).toMatchObject({ read: false, id: "pagecomment-1", pageId: "page-1", createdAt: "2026-11-14T01:08:00+09:00" });
    expect(schedule.schedule).toMatchObject({ read: true, id: "event-1", calendarId: "calendar-1", wholeDayFlag: false, recurrenceType: "none" });
    expect(schedule.schedule).not.toHaveProperty("recurrenceRule");
    expect(stderr).not.toHaveBeenCalled();
  });

  it("옵션이 없으면 변경 기록은 result 가 아니라 changes 에 있다", async () => {
    respond(fixtures.page);
    const res = await client().getStreams();
    expect(res.result!.filter((i) => i.type === "event")).toHaveLength(1);
    expect(res.changes!.map((i) => i.type)).toEqual(["event", "pageEvent", "event", "calendar", "project"]);
    expect(res.changes!.map((i) => (i[i.type!] as { id: string }).id)).toEqual(["event-nobody", "pageevent-1", "schedevent-1", "calendar-notice-1", "project-2"]);
    expect(res.unknown).toBe(0);
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

  it("모르는 카드 종류는 unknown 으로 세고 stderr 에 쓰지 않는다", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const page = structuredClone(fixtures.page);
    page.result.contents.push({ id: "card-9", type: "drive", drive: { id: "drive-1" } }, { id: "card-10", type: "ai" });
    respond(page);
    const res = await client().getStreams({ withChanges: true });
    expect(res.unknown).toBe(2);
    expect(res.result!.map((i) => i.type)).not.toContain("drive");
    expect(stderr).not.toHaveBeenCalled();
  });

  it("withChanges 면 변경 기록을 카드 순서대로 result 에 담고 웹 값을 그대로 둔다", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    respond(fixtures.page);
    const res = await client().getStreams({ withChanges: true });
    expect(res.result!.map((i) => i.type)).toEqual(["mail", "post", "event", "event", "page", "pageComment", "pageEvent", "schedule", "event", "calendar", "project"]);
    expect(res.changes).toEqual([]);
    expect(res.unknown).toBe(0);
    const refs = fixtures.page.result.references;
    const [, , , system, , , pageEvent, , scheduleEvent, calendar, project] = res.result!;
    expect(system.event).toEqual({
      read: false, id: "event-nobody", type: "workflow", postId: "post-1", creator: { type: "member", member: { organizationMemberId: "member-1", name: "홍길동" } },
      createdAt: "2026-11-14T01:03:00+09:00", actions: refs.eventMap["event-nobody"].body.actions,
    });
    expect(system.event).not.toHaveProperty("body");
    expect(scheduleEvent.event).toEqual({
      read: true, id: "schedevent-1", type: "schedule", scheduleId: "event-1", creator: { type: "member", member: { organizationMemberId: "member-1", name: "홍길동" } },
      createdAt: "2026-11-14T01:09:00+09:00", actions: refs.eventMap["schedevent-1"].body.actions,
    });
    expect(scheduleEvent.event).not.toHaveProperty("postId");
    expect(pageEvent).toEqual({ type: "pageEvent", pageEvent: refs.pageEventMap["pageevent-1"] });
    expect(calendar).toEqual({ type: "calendar", calendar: fixtures.page.result.contents[4].calendar });
    expect(project).toEqual({ type: "project", project: fixtures.page.result.contents[5].project });
    expect(stderr).not.toHaveBeenCalled();
  });

  it("withChanges 는 서버로 보내지 않는다", async () => {
    const calls = respond(fixtures.empty);
    await client().getStreams({ size: 20, withChanges: true });
    expect(calls[0].searchParams.has("withChanges")).toBe(false);
    expect(Object.fromEntries(calls[0].searchParams)).toEqual({ services: "project,mail,calendar,drive,wiki,contacts,ai", size: "20" });
  });

  it("응답의 organizationMemberMap 이름을 멤버 이름 캐시로 내준다", async () => {
    respond(fixtures.page);
    const c = client();
    await c.getStreams();
    expect(c.getMemberNameFromList?.("member-3")).toBe("이영희");
    expect(c.getMemberNameFromList?.("member-4")).toBe("박민수");
  });

  it("변경 기록 원소에 쓸 수 없는 하위 항목과 시각은 멈추지 않고 unknown 으로 센다", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const page = structuredClone(fixtures.page);
    const contents = page.result.contents, refs = page.result.references;
    contents[1].eventList.push({ id: "missing-post-event", read: false, type: null });
    contents[2].eventList.push({ id: "missing-page-event", read: false, type: "event" });
    contents[3].eventList.push({ id: "missing-schedule-event", read: false, type: null });
    contents[1].eventList.push({ id: "null-time", read: false, type: null }, { id: "object-time", read: false, type: null });
    refs.eventMap["null-time"] = { ...refs.eventMap["event-nobody"], id: "null-time", createdAt: null };
    refs.eventMap["object-time"] = { ...refs.eventMap["event-nobody"], id: "object-time", createdAt: {} };
    respond(page);
    const res = await client().getStreams({ withChanges: true });
    expect(res.unknown).toBe(5);
    const ids = res.result!.map((i) => (i[i.type!] as { id: string }).id);
    expect(ids).not.toContain("null-time");
    expect(ids).not.toContain("object-time");
    expect(res.result!.filter((i) => i.type === "event")).toHaveLength(3);
    expect(stderr).not.toHaveBeenCalled();
  });

  it("댓글의 createdAt 이 null 이면 댓글 원소는 남기고 createdAt 키만 뺀다", async () => {
    const page = structuredClone(fixtures.page);
    page.result.references.eventMap["comment-1"].createdAt = null;
    respond(page);
    const res = await client().getStreams();
    const comment = res.result!.find((i) => i.type === "event")!;
    expect(comment.event).toMatchObject({ id: "comment-1", body: { mimeType: "text/x-markdown", content: "댓글" } });
    expect(comment.event).not.toHaveProperty("createdAt");
    expect(res.unknown).toBe(0);
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

  it("걸러져 빈 페이지가 여러 번 이어져도 원본이 빈 페이지에서만 끝낸다(횟수 상한 없음)", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const dropped = (cursor: string) => ({ header: fixtures.page.header, result: { totalCount: 1, contents: [fixtures.page.result.contents[4]], references: { nextTimestamp: cursor } } });
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => { n += 1; return Response.json(n <= 6 ? dropped(`c-${n}`) : fixtures.empty); }));
    const res = await client().getStreams({ size: 1 });
    expect(n).toBe(7);
    expect(res.result).toEqual([]);
    // 이어 받은 페이지마다 뺀 일정 삭제 알림을 모두 모은다.
    expect(res.changes!.map((i) => i.type)).toEqual(Array(6).fill("calendar"));
    expect(res.unknown).toBe(0);
  });

  it("서버가 같은 커서를 되풀이하면 멈춘다", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loop = { header: fixtures.page.header, result: { totalCount: 1, contents: [fixtures.page.result.contents[4]], references: { nextTimestamp: "same" } } };
    const fetchMock = vi.fn(async () => Response.json(loop));
    vi.stubGlobal("fetch", fetchMock);
    const res = await client().getStreams({ size: 1 });
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3);
    expect(res.changes).toHaveLength(fetchMock.mock.calls.length);
  });
});
