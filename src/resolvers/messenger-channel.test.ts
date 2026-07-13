import { describe, it, expect } from "vitest";
import { resolveMessengerChannel } from "./messenger-channel.js";
import type { DoorayApiClient } from "../api/client.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import { vi } from "vitest";

function mockClient(channels: { id: string; title: string; type: string }[]): DoorayApiClient {
  return {
    getMessengerChannels: vi.fn().mockResolvedValue({ result: channels }),
  } as unknown as DoorayApiClient;
}

const fixture = [
  { id: "1111222233334444555", title: "공지방", type: "private" },
  { id: "2222333344445555666", title: "개발팀", type: "private" },
  { id: "3333444455556666777", title: "개발팀 백업", type: "private" },
  { id: "4444555566667777888", title: "", type: "direct" },
];

describe("resolveMessengerChannel (ADR-033)", () => {
  it("15자리 이상 숫자 → getMessengerChannels 호출 없이 그대로 channelId 반환", async () => {
    const client = mockClient(fixture);
    const result = await resolveMessengerChannel(client, "9999999999999999999");
    expect(result).toBe("9999999999999999999");
    expect(client.getMessengerChannels).not.toHaveBeenCalled();
  });

  it("title 정확일치", async () => {
    const client = mockClient(fixture);
    const result = await resolveMessengerChannel(client, "공지방");
    expect(result).toBe("1111222233334444555");
  });

  it("title 부분일치 (단일 후보)", async () => {
    const client = mockClient([fixture[0]!, fixture[1]!]);
    const result = await resolveMessengerChannel(client, "개발");
    expect(result).toBe("2222333344445555666");
  });

  it("title 부분일치 모호 → 복수 후보 에러 + EXIT_PARAM_ERROR", async () => {
    const client = mockClient(fixture);
    await expect(resolveMessengerChannel(client, "개발")).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof DoorayCliError &&
        err.exitCode === EXIT_PARAM_ERROR &&
        /개발팀.*개발팀 백업/s.test(err.message),
    );
  });

  it("title 빈값(direct 방)만 있으면 매칭 후보 0건 → not-found (direct 방 id 노출 안 됨)", async () => {
    const directOnly = [fixture[3]!]; // title: ""
    const client = mockClient(directOnly);
    await expect(resolveMessengerChannel(client, "아무이름")).rejects.toSatisfy((err: unknown) => {
      if (!(err instanceof DoorayCliError)) return false;
      return (
        /찾을 수 없습니다/.test(err.message) &&
        !err.message.includes("4444555566667777888")
      );
    });
  });

  it("not-found → channelId 직접 입력 안내 힌트 포함", async () => {
    const client = mockClient(fixture);
    await expect(resolveMessengerChannel(client, "없는방")).rejects.toThrow(
      /channelId 직접 입력/,
    );
  });
});
