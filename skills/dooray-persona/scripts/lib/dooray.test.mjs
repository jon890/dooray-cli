import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyInvolvement,
  createRateLimiter,
  getAllPages,
  getMe,
  loadApiConfig,
} from "./dooray.mjs";

const MEMBER_ID = "1234567890123456789";
const OTHER_MEMBER_ID = "9876543210987654321";

afterEach(() => {
  vi.useRealTimers();
});

describe("classifyInvolvement", () => {
  it("그룹 담당에 포함된 구성원을 담당자로 분류한다", () => {
    const post = {
      users: {
        to: [
          {
            group: {
              members: [{ organizationMemberId: MEMBER_ID }],
            },
          },
        ],
      },
    };

    expect(classifyInvolvement(post, MEMBER_ID)).toEqual({
      authored: false,
      assigned: true,
      cc: false,
      assigneeKind: "group",
    });
  });

  it("개인 담당자를 member로 분류한다", () => {
    const post = {
      users: {
        to: [{ member: { organizationMemberId: MEMBER_ID } }],
      },
    };

    expect(classifyInvolvement(post, MEMBER_ID)).toEqual({
      authored: false,
      assigned: true,
      cc: false,
      assigneeKind: "member",
    });
  });

  it("참조자로만 포함된 구성원은 cc만 참이다", () => {
    const post = {
      users: {
        to: [{ member: { organizationMemberId: OTHER_MEMBER_ID } }],
        cc: [{ member: { organizationMemberId: MEMBER_ID } }],
      },
    };

    expect(classifyInvolvement(post, MEMBER_ID)).toEqual({
      authored: false,
      assigned: false,
      cc: true,
      assigneeKind: "none",
    });
  });

  it("users가 없어도 전부 거짓으로 분류한다", () => {
    expect(classifyInvolvement({}, MEMBER_ID)).toEqual({
      authored: false,
      assigned: false,
      cc: false,
      assigneeKind: "none",
    });
  });
});

describe("getAllPages", () => {
  it("빈 결과가 계속되면 두 번 재시도한 뒤 오류를 던진다", async () => {
    vi.useFakeTimers();
    const client = {
      get: vi.fn().mockResolvedValue({ result: [], totalCount: 1 }),
    };

    const request = getAllPages(client, "project/v1/projects");
    const rejection = expect(request).rejects.toThrow(/빈 결과를 반복/);
    await vi.runAllTimersAsync();
    await rejection;

    expect(client.get).toHaveBeenCalledTimes(3);
  });

  it("여러 페이지의 결과를 totalCount만큼 이어 붙인다", async () => {
    const first = { id: "1111222233334444555" };
    const second = { id: "2222333344445555666" };
    const client = {
      get: vi
        .fn()
        .mockResolvedValueOnce({ result: [first], totalCount: 2 })
        .mockResolvedValueOnce({ result: [second], totalCount: 2 }),
    };

    await expect(
      getAllPages(client, "project/v1/projects", {}, { size: 1 }),
    ).resolves.toEqual([first, second]);
    expect(client.get).toHaveBeenNthCalledWith(1, "project/v1/projects", {
      page: 0,
      size: 1,
    });
    expect(client.get).toHaveBeenNthCalledWith(2, "project/v1/projects", {
      page: 1,
      size: 1,
    });
  });
});

describe("createRateLimiter", () => {
  it("초당 한도를 넘는 호출을 다음 시간 창까지 기다리게 한다", async () => {
    let currentTime = 0;
    const sleep = vi.fn(async (ms) => {
      currentTime += ms;
    });
    const limit = createRateLimiter(2, {
      now: () => currentTime,
      sleep,
    });

    await Promise.all([limit(), limit(), limit()]);

    expect(sleep).toHaveBeenCalledWith(1_000);
  });
});

describe("getMe", () => {
  it("응답 id를 organizationMemberId로 반환한다", async () => {
    const client = {
      get: vi.fn().mockResolvedValue({
        result: { id: MEMBER_ID, name: "홍길동" },
      }),
    };

    await expect(getMe(client)).resolves.toEqual({
      organizationMemberId: MEMBER_ID,
      name: "홍길동",
    });
    expect(client.get).toHaveBeenCalledWith("common/v1/members/me");
  });
});

describe("loadApiConfig", () => {
  it("baseUrl이 없으면 dooray setup 실행을 안내한다", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dooray-persona-"));
    const configPath = join(directory, "config.json");

    try {
      await writeFile(configPath, JSON.stringify({ apiKey: "test-api-key" }));

      await expect(loadApiConfig(configPath)).rejects.toThrow(/dooray setup/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
