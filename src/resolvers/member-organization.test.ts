import { afterEach, describe, expect, it, vi } from "vitest";
import { DoorayApiClient } from "../api/client.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_API_ERROR, EXIT_AUTH_ERROR } from "../utils/exit-codes.js";
import { buildBusyHoursWindow, fetchMemberOrganization } from "./member-organization.js";

const NOW = new Date("2026-09-03T02:00:00.000Z");

function okResponse(result: unknown): Response {
  return new Response(
    JSON.stringify({ header: { isSuccessful: true, resultCode: 0, resultMessage: "" }, result }),
    { status: 200 },
  );
}

const entry = {
  member: {
    id: "1111111111111111111",
    name: "홍길동",
    primaryDepartment: { id: null, name: "플랫폼개발팀" },
    defaultOrganization: { id: "2222222222222222222", name: "두레이" },
    positionName: null,
  },
  busyHours: [],
  officeHours: [],
  outOfOfficeHours: [],
};

describe("buildBusyHoursWindow", () => {
  it("기준 시각부터 1분 뒤까지를 ISO8601 로 낸다", () => {
    expect(buildBusyHoursWindow(NOW)).toEqual({
      beginDateTime: "2026-09-03T02:00:00.000Z",
      endDateTime: "2026-09-03T02:01:00.000Z",
    });
  });
});

describe("fetchMemberOrganization", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetch-busy-hours 에 멤버 하나와 7일 미만의 기간을 POST 한다", async () => {
    // ky 가 응답을 받은 뒤에는 요청 body 를 다시 읽을 수 없으므로 fetch 안에서 미리 읽어 둔다.
    const seen: { method: string; path: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (req: Request) => {
        seen.push({ method: req.method, path: new URL(req.url).pathname, body: await req.json() });
        return okResponse([entry]);
      }),
    );

    const client = new DoorayApiClient("api-key", "https://api.dooray.com");
    await fetchMemberOrganization(client, "1111111111111111111", NOW);

    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("POST");
    expect(seen[0].path).toBe("/calendar/v1/fetch-busy-hours");
    const body = seen[0].body as { organizationMemberIds: string[]; beginDateTime: string; endDateTime: string };
    expect(body.organizationMemberIds).toEqual(["1111111111111111111"]);
    const spanMs = Date.parse(body.endDateTime) - Date.parse(body.beginDateTime);
    expect(spanMs).toBeGreaterThan(0);
    expect(spanMs).toBeLessThan(7 * 24 * 60 * 60 * 1000);
  });

  it("응답의 회사·부서·직책을 그대로 꺼낸다 (부서 id 가 null 이어도 이름은 남는다)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okResponse([entry])));

    const client = new DoorayApiClient("api-key", "https://api.dooray.com");
    const org = await fetchMemberOrganization(client, "1111111111111111111", NOW);

    expect(org).toEqual({
      defaultOrganization: { id: "2222222222222222222", name: "두레이" },
      primaryDepartment: { id: null, name: "플랫폼개발팀" },
      positionName: null,
    });
  });

  it("응답에 그 멤버가 없으면 EXIT_API_ERROR 로 던진다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okResponse([])));

    const client = new DoorayApiClient("api-key", "https://api.dooray.com");

    await expect(
      fetchMemberOrganization(client, "1111111111111111111", NOW),
    ).rejects.toMatchObject({ exitCode: EXIT_API_ERROR, message: expect.stringContaining("1111111111111111111") });
  });

  it("조회가 실패하면 소속 정보 실패임을 알리고 클라이언트의 종료 코드를 유지한다", async () => {
    const client = {
      fetchBusyHours: vi.fn().mockRejectedValue(new DoorayCliError("인증 실패", EXIT_AUTH_ERROR)),
    } as unknown as DoorayApiClient;

    await expect(
      fetchMemberOrganization(client, "1111111111111111111", NOW),
    ).rejects.toMatchObject({
      exitCode: EXIT_AUTH_ERROR,
      message: "소속 정보를 불러오지 못했습니다: 인증 실패",
    });
  });
});
