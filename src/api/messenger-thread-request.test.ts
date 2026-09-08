import { describe, expect, it } from "vitest";
import { buildThreadRequest } from "./messenger-thread-request.js";

describe("buildThreadRequest", () => {
  it("channelId 와 text 만 주면 대화방 스레드 경로를 낸다", () => {
    const req = buildThreadRequest("1111111111111111111", "본문");
    expect(req.path).toBe(
      "messenger/v1/channels/1111111111111111111/threads/create-and-send",
    );
  });

  it("threadText 를 생략하면 body 에 threadText 키가 없다", () => {
    const req = buildThreadRequest("1111111111111111111", "본문");
    expect(req.json).toEqual({ text: "본문" });
    expect(req.json).not.toHaveProperty("threadText");
  });

  it("threadText 를 주면 body 에 그 값이 들어간다", () => {
    const req = buildThreadRequest("1111111111111111111", "본문", {
      threadText: "첫 메시지",
    });
    expect(req.json).toEqual({ text: "본문", threadText: "첫 메시지" });
  });

  it("logId 를 주면 경로에 logs/{logId} 가 들어가고 body 는 text 뿐이다", () => {
    const req = buildThreadRequest("1111111111111111111", "본문", {
      logId: "2222222222222222222",
      threadText: "무시된다",
    });
    expect(req.path).toBe(
      "messenger/v1/channels/1111111111111111111/logs/2222222222222222222/threads/create-and-send",
    );
    expect(req.json).toEqual({ text: "본문" });
    expect(req.json).not.toHaveProperty("threadText");
  });
});
