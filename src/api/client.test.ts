import { afterEach, describe, expect, it, vi } from "vitest";
import { DoorayApiClient } from "./client.js";

// ky.create 에 준 parseJson (ADR-051) 이 실제로 연결됐는지 확인한다.
// grep 은 문자열이 있는지만 보고, 기존 테스트는 큰 정수를 다루지 않아 연결 자체를 검증하지 못한다.
describe("DoorayApiClient — 응답 JSON 파싱", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("19자리 식별자는 문자열로, 안전 범위 값은 숫자로 온다", async () => {
    const body =
      '{"header":{"resultCode":0,"resultMessage":"","isSuccessful":true},' +
      '"result":{"id":1234567890123456789,"channelId":2222333344445555666,"sentAt":1788834599820,"seq":259}}';

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { status: 200 })),
    );

    const client = new DoorayApiClient("api-key", "https://api.dooray.com");
    const response = await client.sendDirectMessage("<memberId>", "메시지");

    expect(response.result.id).toBe("1234567890123456789");
    expect(response.result.channelId).toBe("2222333344445555666");
    expect((response.result as unknown as { sentAt: unknown }).sentAt).toBe(1788834599820);
    expect((response.result as unknown as { seq: unknown }).seq).toBe(259);
  });
});
