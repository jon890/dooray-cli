import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebClient } from "../web/index.js";

const fixtures = JSON.parse(readFileSync(new URL("../web/fixtures/calendar/responses.json", import.meta.url), "utf8"));
const client = () => createWebClient("fake-session", "https://my-org.dooray.com", "https://api.dooray.com");

function respond(...keys: string[]) {
  const calls: { url: URL; method: string; headers: Headers; body?: unknown }[] = [];
  let index = 0;
  vi.stubGlobal("fetch", vi.fn(async (request: Request) => {
    const body = request.body ? await request.clone().json() : undefined;
    calls.push({ url: new URL(request.url), method: request.method, headers: request.headers, body });
    return Response.json(fixtures[keys[Math.min(index++, keys.length - 1)]]);
  }));
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe("웹 캘린더 읽기", () => {
  it("목록은 1.2 헤더로 부르고 공식 me 객체만 낸다. 구독 캘린더는 뺀다", async () => {
    const calls = respond("calendars");
    const res = await client().getCalendars();
    expect(calls[0].url.pathname).toBe("/v2/wapi/calendars");
    expect(calls[0].url.searchParams.get("size")).toBe("99999");
    expect(calls[0].headers.get("Dooray-Api-Version")).toBe("1.2");
    expect(res.result.map((c) => c.id)).toEqual(["calendar-1", "calendar-2"]);
    expect(res.totalCount).toBe(2);
    expect(res.result[0]).toEqual({
      id: "calendar-1", name: "내 캘린더", type: "private", createdAt: "2026-01-01T09:00:00+09:00", ownerOrganizationMemberId: "member-1",
      me: { default: true, color: "#112233", listed: true, checked: true, role: "owner", order: 1 },
    });
    expect(res.result[0]).not.toHaveProperty("projectId");
    expect(res.result[1]).toMatchObject({ projectId: "project-1" });
  });

  it("일정 목록은 경로의 * 와 기간 쿼리를 그대로 보내고 공식 항목 모양으로 바꾼다", async () => {
    const calls = respond("events");
    const res = await client().getCalendarEvents("2026-11-20T00:00:00+09:00", "2026-11-23T00:00:00+09:00");
    expect(calls[0].url.pathname).toBe("/v2/wapi/calendars/*/schedules");
    expect(Object.fromEntries(calls[0].url.searchParams)).toEqual({ timeMin: "2026-11-20T00:00:00+09:00", timeMax: "2026-11-23T00:00:00+09:00" });
    expect(res.result[0]).toEqual({
      id: "event-1", masterScheduleId: "event-1", calendar: { id: "calendar-1", name: "내 캘린더" }, recurrenceId: null,
      startedAt: "2026-11-20T10:00:00+09:00", endedAt: "2026-11-20T10:30:00+09:00", location: "", subject: "회의",
      createdAt: "2026-11-01T09:00:00+09:00", updatedAt: "2026-11-02T09:00:00+09:00", category: "general", wholeDayFlag: false,
      tenant: { id: "tenant-1" }, uid: "u1", recurrenceType: "none", users: {},
      me: { type: "member", member: { organizationMemberId: "member-1", name: "홍길동", emailAddress: "hong@example.com" }, status: "accepted", userType: "to" },
    });
  });

  it("종일 일정은 날짜 형식을 지키고 참여자가 아닌 일정의 me 에는 status·userType 이 없다", async () => {
    respond("events");
    const [, second] = (await client().getCalendarEvents("a", "b")).result;
    expect(second).toMatchObject({ id: "event-2-20261121T010000Z", recurrenceId: "20261121T010000Z", startedAt: "2026-11-21+09:00", endedAt: "2026-11-22+09:00", wholeDayFlag: true });
    expect(second.me).toEqual({ type: "member", member: { organizationMemberId: "member-1", name: "홍길동" } });
    expect(second.calendar).toEqual({ id: "calendar-2", name: "팀 캘린더" });
  });

  it("상세는 content 를 꺼내 참석자 상태를 공식 위치로 옮기고 반복 규칙의 웹 전용 시각을 뺀다", async () => {
    const calls = respond("detail");
    const { result } = await client().getCalendarEvent("calendar-1", "event-1-20261120T010000Z");
    expect(calls[0].url.pathname).toBe("/v2/wapi/calendars/calendar-1/schedules/event-1-20261120T010000Z");
    expect(result.body).toEqual({ mimeType: "text/x-markdown", content: "본문" });
    expect(result.users?.from).toEqual({ type: "member", status: "accepted", member: { organizationMemberId: "member-1", name: "홍길동", emailAddress: "hong@example.com" } });
    expect(result.users?.to?.[0]).toMatchObject({ status: "not_confirmed" });
    expect(result.me).toMatchObject({ status: "accepted", userType: "from" });
    expect(result.recurrenceRule).toEqual({ frequency: "weekly", interval: 1, until: null, count: null, byday: "FR", bymonthday: "", bymonth: "", wkst: null, timezoneName: "Asia/Seoul" });
    expect(result).not.toHaveProperty("files");
  });

  it("HTTP 200 이어도 isSuccessful 이 false 면 API 오류로 끝낸다", async () => {
    respond("failed");
    await expect(client().getCalendarEvents("a", "b")).rejects.toMatchObject({ exitCode: 1 });
  });
});

describe("웹 캘린더 쓰기", () => {
  it("생성은 원소 하나인 배열을 웹 형식으로 보내고 id 만 돌려준다", async () => {
    const calls = respond("created");
    const res = await client().createCalendarEvent("calendar-1", {
      subject: "새 일정", body: { mimeType: "text/x-markdown", content: "내용" }, startedAt: "2026-11-20T10:00:00+09:00", endedAt: "2026-11-20T10:30:00+09:00",
      users: {}, personalSettings: { alarms: [{ action: "app", trigger: "TRIGGER:-PT10M" }], class: "private" },
    });
    expect(res.result).toEqual({ id: "event-9" });
    expect(calls[0]).toMatchObject({ method: "POST", url: expect.objectContaining({ pathname: "/v2/wapi/schedules" }) });
    expect(calls[0].headers.get("Dooray-Api-Version")).toBe("1.2");
    expect(calls[0].body).toEqual([{
      calendarId: "calendar-1", resourceId: null, category: "general", wholeDayFlag: false, subject: "새 일정", location: "",
      body: { mimeType: "text/x-markdown", content: "내용" }, startedAt: "2026-11-20T10:00:00+09:00", endedAt: "2026-11-20T10:30:00+09:00",
      users: { to: [], cc: [] }, replyFlag: false, recurrenceType: "none", recurrenceRule: null, fileIdList: [], conferencing: null,
      personalSettings: { alarms: [{ action: "app", trigger: "TRIGGER:-PT10M", option: null }], busy: true, class: "private", travelTime: null },
    }]);
  });

  it("반복 일정은 규칙에 시작·종료 시각을 채워 보낸다", async () => {
    const calls = respond("created");
    await client().createCalendarEvent("calendar-1", {
      subject: "반복", startedAt: "2026-11-20T10:00:00+09:00", endedAt: "2026-11-20T10:30:00+09:00", users: {},
      recurrenceRule: { frequency: "weekly", interval: 2, byday: "FR", timezoneName: "Asia/Seoul" },
    });
    const item = (calls[0].body as Record<string, unknown>[])[0];
    expect(item.recurrenceType).toBe("unmodified");
    expect(item.recurrenceRule).toEqual({
      frequency: "weekly", interval: 2, startedAt: "2026-11-20T10:00:00+09:00", endedAt: "2026-11-20T10:30:00+09:00",
      until: null, byday: "FR", bymonthday: "", bymonth: "", timezoneName: "Asia/Seoul",
    });
  });

  it("참석자가 있는 쓰기는 요청 전에 지원하지 않는다고 끝낸다", async () => {
    const calls = respond("created");
    const users = { to: [{ type: "member" as const, member: { organizationMemberId: "member-2" } }] };
    await expect(client().createCalendarEvent("calendar-1", { users })).rejects.toMatchObject({ exitCode: 3 });
    await expect(client().updateCalendarEvent("calendar-1", "event-1", { users })).rejects.toMatchObject({ exitCode: 3 });
    expect(calls).toHaveLength(0);
  });

  it("수정은 준 필드만 PUT 으로 보내고 결과는 null 이다", async () => {
    const calls = respond("updated");
    const res = await client().updateCalendarEvent("calendar-1", "event-1", { subject: "바뀜" });
    expect(res.result).toBeNull();
    expect(calls[0]).toMatchObject({ method: "PUT", body: { subject: "바뀜" } });
    expect(calls[0].url.pathname).toBe("/v2/wapi/calendars/calendar-1/schedules/event-1");
  });

  it("반복 규칙만 고칠 때는 기존 일정의 시각을 읽어 규칙에 채운다", async () => {
    const calls = respond("detail", "updated");
    await client().updateCalendarEvent("calendar-1", "event-1", { recurrenceRule: { frequency: "daily", timezoneName: "Asia/Seoul" } });
    expect(calls.map((c) => c.method)).toEqual(["GET", "PUT"]);
    expect((calls[1].body as { recurrenceRule: Record<string, unknown> }).recurrenceRule).toMatchObject({ frequency: "daily", startedAt: "2026-11-20T10:00:00+09:00", endedAt: "2026-11-20T10:30:00+09:00" });
  });

  it("직전에 읽은 같은 일정의 상세가 있으면 반복 규칙 수정에서 다시 읽지 않는다", async () => {
    const calls = respond("detail", "updated");
    const c = client();
    await c.getCalendarEvent("calendar-1", "event-1");
    await c.updateCalendarEvent("calendar-1", "event-1", { recurrenceRule: { frequency: "daily", timezoneName: "Asia/Seoul" } });
    expect(calls.map((x) => x.method)).toEqual(["GET", "PUT"]);
  });

  it.each(["this", "wholeFromThis", "whole"] as const)("삭제는 DELETE 와 deleteType=%s 쿼리로 보낸다", async (deleteType) => {
    const calls = respond("deleted");
    const res = await client().deleteCalendarEvent("calendar-1", "event-1-20261120T010000Z", deleteType);
    expect(res.result).toBeNull();
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url.searchParams.get("deleteType")).toBe(deleteType);
    expect(calls[0].body).toBeUndefined();
  });

  it("소속 조회(바쁨 시간)는 웹 경로를 실측하지 못해 요청 없이 지원하지 않는다고 끝낸다", async () => {
    const calls = respond("created");
    await expect(client().fetchBusyHours({ organizationMemberIds: ["member-1"], beginDateTime: "a", endDateTime: "b" })).rejects.toMatchObject({ exitCode: 3 });
    expect(calls).toHaveLength(0);
  });
});
