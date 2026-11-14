import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebClient } from "../web/index.js";
import { createMessengerWeb } from "./web.js";
import { WebContext } from "../web/context.js";

const fixtures = JSON.parse(readFileSync(new URL("../web/fixtures/messenger/responses.json", import.meta.url), "utf8"));
const client = () => createWebClient("fake-session", "https://my-org.dooray.com", "https://api.dooray.com");

function respond(body: unknown) {
  const calls: URL[] = [];
  vi.stubGlobal("fetch", vi.fn(async (request: Request) => { calls.push(new URL(request.url)); return Response.json(body); }));
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe("웹 메신저 읽기", () => {
  it("대화방 목록은 보관·시스템 방까지 받아 공식 필드로 바꾼다", async () => {
    const calls = respond(fixtures.channels);
    const res = await client().getMessengerChannels();
    expect(calls[0].pathname).toBe("/messenger/v3/api/members/me/favorites");
    expect(Object.fromEntries(calls[0].searchParams)).toEqual({ responseType: "all", flags: "system,normal,archived" });
    expect((res as { totalCount?: number }).totalCount).toBe(3);
    expect(res.result[0]).toEqual({
      id: "channel-1", title: "", type: "direct", organization: { id: "tenant-1" }, capacity: 2, displayed: true, status: "normal",
      users: { participants: [{ type: "member", member: { organizationMemberId: "member-1" } }, { type: "member", member: { organizationMemberId: "member-2" } }] },
      me: { type: "member", member: { organizationMemberId: "member-1" }, role: "member" },
      createdAt: expect.stringMatching(/^2025-11-1\dT.*[+-]\d\d:\d\d$/), updatedAt: expect.stringMatching(/[+-]\d\d:\d\d$/),
    });
    expect(res.result[0]).not.toHaveProperty("archivedAt");
    expect(res.result[1]).toMatchObject({ type: "me", me: { role: "creator" } });
    expect(res.result[2]).toMatchObject({ title: "팀방", status: "archived", displayed: false });
  });

  it("메시지 목록은 최신이 앞이 되게 뒤집고 type·sender·file 을 공개 API 모양으로 바꾼다", async () => {
    const calls = respond(fixtures.logs);
    const res = await client().getChannelLogs("channel/1", 20);
    expect(calls[0].pathname).toBe("/messenger/v1/api/channel/channel%2F1/logs");
    expect(Object.fromEntries(calls[0].searchParams)).toEqual({ limit: "20", setLastChannel: "false" });
    expect(res.hasMore).toBe(true);
    expect(res.result.map((l) => l.id)).toEqual(["log-3", "log-2", "log-1"]);
    expect(res.result[0]).toMatchObject({ type: "REPLY", sender: { type: "member", member: { organizationMemberId: "member-1" } }, text: "답장" });
    expect(res.result[1]).toMatchObject({ type: "FILE", file: { id: "file-1", fileName: "a.txt", fileSize: 10, mimeType: "text/plain" } });
    expect(res.result[1].file).not.toHaveProperty("thumb");
    expect(res.result[2]).not.toHaveProperty("type");
    expect(res.result[0].thread).toEqual({ channelId: "thread-1", totalCount: "2", lastUpdatedAt: 1763049780000 });
    expect(res.result[2].sentAt).toMatch(/[+-]\d\d:\d\d$/);
  });

  it("목록이 배열이 아니면 구조가 바뀐 것이라 API 오류로 끝낸다", async () => {
    respond({ header: fixtures.logs.header, result: { content: {} } });
    await expect(client().getChannelLogs("channel-1", 5)).rejects.toMatchObject({ exitCode: 1 });
    await expect(client().getMessengerChannels()).rejects.toMatchObject({ exitCode: 1 });
  });
});

type Call = { url: URL; method: string; body?: Record<string, unknown> };
function sequence(...bodies: unknown[]) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (request: Request) => {
    const body = request.body ? await request.clone().json() : undefined;
    calls.push({ url: new URL(request.url), method: request.method, body });
    return Response.json(bodies[Math.min(calls.length - 1, bodies.length - 1)]);
  }));
  return calls;
}

describe("웹 메신저 보내기", () => {
  it("채널 메시지는 channelLogs 로 text 와 UUID token 을 보내고 id·channelId 만 돌려준다", async () => {
    const calls = sequence(fixtures.sent);
    const res = await client().sendChannelMessage("channel-2", "안녕");
    expect(calls[0]).toMatchObject({ method: "POST" });
    expect(calls[0].url.pathname).toBe("/messenger/v1/api/channelLogs/channel-2");
    expect(calls[0].body).toEqual({ text: "안녕", token: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(res.result).toEqual({ id: "log-9", channelId: "channel-2" });
  });

  it("나에게 보내기는 내 아이디면 나와의 대화방으로, 그 밖에는 이미 있는 1:1 방으로 보낸다", async () => {
    const calls = sequence(fixtures.channels, fixtures.myMessenger, fixtures.sent);
    await client().sendDirectMessage("member-1", "메모");
    expect(calls.map((c) => c.url.pathname)).toEqual(["/messenger/v3/api/members/me/favorites", "/messenger/v1/api/members/me", "/messenger/v1/api/channelLogs/channel-2"]);
    const other = sequence(fixtures.channels, fixtures.myMessenger, fixtures.sent);
    await client().sendDirectMessage("member-2", "안녕");
    expect(other[2].url.pathname).toBe("/messenger/v1/api/channelLogs/channel-1");
  });

  it("대화방이 없는 상대에게는 요청 없이 지원하지 않는다고 끝낸다", async () => {
    const calls = sequence(fixtures.channels, fixtures.myMessenger);
    await expect(client().sendDirectMessage("member-9", "안녕")).rejects.toMatchObject({ exitCode: 3 });
    expect(calls).toHaveLength(2);
  });

  it("메시지에서 스레드를 열고 스레드 채널에 보낸다", async () => {
    const calls = sequence(fixtures.myMessenger, fixtures.threadCreated, fixtures.sentThread);
    const res = await client().createLogThread("channel-2", "log-9", "스레드 글");
    expect(calls[1].url.pathname).toBe("/messenger/v1/api/thread-channels");
    expect(calls[1].body).toEqual({ parentChannelId: "channel-2", parentChannelLogId: "log-9", capacity: 1, type: "thread", members: ["member-1"], isPublic: false });
    expect(calls[2].url.pathname).toBe("/messenger/v1/api/channelLogs/thread-1");
    expect(res.result).toEqual({ id: "log-10", channelId: "thread-1" });
  });

  it("새 메시지와 스레드를 함께 만든다. 스레드 첫 글을 생략하면 새 메시지 id 를 돌려준다", async () => {
    const calls = sequence(fixtures.sent, fixtures.myMessenger, fixtures.threadCreated);
    const res = await client().createChannelThread("channel-2", "본문");
    expect(calls).toHaveLength(3);
    expect(res.result).toEqual({ id: "log-9", channelId: "thread-1" });
  });

  it("이미 스레드가 있는 메시지는 로그의 thread 필드에서 그 채널을 찾아 쓴다", async () => {
    const calls = sequence(fixtures.myMessenger, fixtures.threadExists, fixtures.logs, fixtures.sentThread);
    const res = await client().createLogThread("channel-1", "log-3", "또 하나");
    expect(calls[2].url.pathname).toBe("/messenger/v1/api/channel/channel-1/logs");
    expect(calls[3].url.pathname).toBe("/messenger/v1/api/channelLogs/thread-1");
    expect(res.result.channelId).toBe("thread-1");
  });
});

describe("웹 메신저 파일 받기", () => {
  function setup() {
    const context = new WebContext("fake-session", "https://example.dooray.com", "https://api.dooray.com");
    return { context, api: createMessengerWeb(context) };
  }

  it("channel/file 경로에서 받아 content-disposition 의 이름을 쓴다", async () => {
    const { context, api } = setup();
    const bytes = vi.spyOn(context.http, "requestBytes").mockResolvedValue(new Response("데이터", { headers: { "content-disposition": 'attachment; filename="../report.pdf"' } }));
    const file = await api.downloadMessengerFile("channel-1", "file-1");
    expect(bytes).toHaveBeenCalledWith("messenger/v2/api/channel/channel-1/file/file-1");
    expect(file.fileName).toBe("report.pdf");
    expect(new TextDecoder().decode(file.buffer)).toBe("데이터");
  });

  it("없는 파일은 200 에 content-disposition 이 없어 찾지 못했다고 끝낸다", async () => {
    const { context, api } = setup();
    vi.spyOn(context.http, "requestBytes").mockResolvedValue(new Response(null, { status: 200 }));
    await expect(api.downloadMessengerFile("channel-1", "file-9")).rejects.toMatchObject({ exitCode: 1 });
  });
});
