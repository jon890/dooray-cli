import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardWebCommand } from "@/commands/web-support.js";

const getConfig = vi.hoisted(() => vi.fn());
vi.mock("@/config/store.js", () => ({ getConfig, warnConfigFileSecurity: vi.fn() }));

const channelId = "1234567890123456789";
const messageId = "9876543210987654321";
const args = ["messenger", "react", channelId, messageId];
const envelope = (result: unknown) => ({ header: { isSuccessful: true }, result });
const config = { authMode: "api-key", baseUrl: "https://api.dooray.com", tenantName: "my-org", sessionCookie: "fake-session" };
const request = vi.fn<(request: Request) => Promise<Response>>();

let stdout: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  getConfig.mockReset().mockResolvedValue({ state: "ok", config });
  request.mockReset();
  vi.stubGlobal("fetch", request);
  stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});
afterEach(() => {
  stdout.mockRestore();
  vi.unstubAllGlobals();
});

async function run(options: string[] = [], argv = [...args, "--emoji", "+1"]) {
  vi.resetModules();
  const { messengerReactCommand } = await import("./react.js");
  const program = new Command().name("dooray").option("--json").option("--quiet").exitOverride();
  program.hook("preAction", (_program, command) => guardWebCommand(command, async () => "api-key"));
  program.addCommand(new Command("messenger").addCommand(messengerReactCommand));
  await program.parseAsync([...options, ...argv], { from: "user" });
}

describe("messenger react", () => {
  it("방 이름을 웹 세션으로 찾고, 콜론을 벗긴 대표 이름과 추가 결과를 JSON으로 출력한다", async () => {
    request
      .mockResolvedValueOnce(Response.json(envelope({
        content: { channels: [{ channelId, title: "테스트 방", type: "private", orgId: "org-1" }] },
      })))
      .mockResolvedValueOnce(Response.json(envelope({ content: { logs: [{ id: messageId, channelId }] } })))
      .mockResolvedValueOnce(Response.json(envelope({ content: { id: "reaction-1" } })));
    await run(["--json"], ["messenger", "react", "테스트 방", messageId, "--emoji", ":+1:"]);
    expect(getConfig).toHaveBeenCalledWith({ sessionOnly: true });
    expect(request.mock.calls.map(([input]) => new URL(input.url).pathname)).toEqual([
      "/messenger/v3/api/members/me/favorites",
      `/messenger/v1/api/channel/${channelId}/logs`,
      `/messenger/v1/api/channels/${channelId}/logs/${messageId}/reactions`,
    ]);
    for (const [input] of request.mock.calls) {
      expect(input.headers.get("Cookie")).toBe("SESSION=fake-session");
      expect(input.headers.has("Authorization")).toBe(false);
    }
    expect(JSON.parse(String(stdout.mock.lastCall?.[0]))).toEqual({ channelId, messageId, emoji: "+1", status: "added" });
  });

  it.each(["thumbsup", "not_a_real_emoji", "👍"])("지원하지 않는 이름 %s 를 설정을 읽기 전에 거절한다", async (name) => {
    await expect(run([], [...args, "--emoji", name])).rejects.toMatchObject({ exitCode: 3 });
    expect(getConfig).not.toHaveBeenCalled();
  });

  it.each(["api-key", "web"])("%s 방식에서 세션이 없으면 종료 코드 3으로 끝난다", async (authMode) => {
    getConfig.mockResolvedValue({ state: "ok", config: { ...config, authMode, sessionCookie: undefined } });
    await expect(run()).rejects.toMatchObject({
      exitCode: 3, message: expect.stringContaining("dooray config set session-cookie -"),
    });
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    ["api-key", 401, 3],
    ["web", 401, 3],
    ["web", 403, 2],
  ])("%s 방식에서 웹 응답 %i를 종료 코드 %i로 알린다", async (authMode, status, exitCode) => {
    getConfig.mockResolvedValue({ state: "ok", config: { ...config, authMode } });
    request.mockResolvedValueOnce(new Response(null, { status }));
    await expect(run()).rejects.toMatchObject({ exitCode });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("--remove는 내가 단 리액션을 떼고 --quiet은 메시지 ID만 출력한다", async () => {
    const reaction = { id: "reaction-1", channelId, logId: messageId, value: "+1", members: [{ memberId: "member-1" }] };
    request
      .mockResolvedValueOnce(Response.json(envelope({
        content: { logs: [{ id: messageId, channelId, reactions: [reaction.id] }] },
        references: { reactionMap: { [reaction.id]: reaction } },
      })))
      .mockResolvedValueOnce(Response.json(envelope({ content: { id: "member-1" } })))
      .mockResolvedValueOnce(Response.json(envelope({ content: reaction })));
    await run(["--quiet"], [...args, "--emoji", "+1", "--remove"]);
    expect(request.mock.lastCall?.[0]).toMatchObject({ method: "DELETE" });
    expect(stdout).toHaveBeenCalledWith(`${messageId}\n`);
  });
});
