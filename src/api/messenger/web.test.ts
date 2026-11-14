import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebClient } from "../web/index.js";

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
    expect(res.result[2].sentAt).toMatch(/[+-]\d\d:\d\d$/);
  });

  it("목록이 배열이 아니면 구조가 바뀐 것이라 API 오류로 끝낸다", async () => {
    respond({ header: fixtures.logs.header, result: { content: {} } });
    await expect(client().getChannelLogs("channel-1", 5)).rejects.toMatchObject({ exitCode: 1 });
    await expect(client().getMessengerChannels()).rejects.toMatchObject({ exitCode: 1 });
  });

  it("보내기·스레드·파일 받기는 요청 없이 지원하지 않는다고 끝낸다", async () => {
    const calls = respond(fixtures.logs);
    const c = client();
    for (const run of [
      () => c.sendDirectMessage("member-1", "x"), () => c.sendChannelMessage("channel-1", "x"),
      () => c.createChannelThread("channel-1", "x"), () => c.createLogThread("channel-1", "log-1", "x"),
      () => c.downloadMessengerFile("channel-1", "file-1"),
    ]) await expect(run()).rejects.toMatchObject({ exitCode: 3 });
    expect(calls).toHaveLength(0);
  });
});
