import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyInvolvement,
  createRateLimiter,
  getAllPages,
  getMe,
  keychainApiKeyAccount,
  loadApiConfig,
  readKeychainApiKey,
} from "./dooray.mjs";

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));

// 실제 security 를 띄우지 않는다.
vi.mock("node:child_process", () => ({ execFile: execFileMock }));

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

describe("loadApiConfig 키체인", () => {
  async function withConfig(content, fn) {
    const directory = await mkdtemp(join(tmpdir(), "dooray-persona-"));
    const configPath = join(directory, "config.json");
    try {
      await writeFile(configPath, JSON.stringify(content));
      await fn(configPath);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  const BASE_URL = "https://api.dooray.com";

  it("macOS 에서 파일에 apiKey 가 없으면 키체인 값을 쓴다", async () => {
    await withConfig({ version: 1, baseUrl: BASE_URL }, async (configPath) => {
      const readKeychain = vi.fn().mockResolvedValue("dummy-keychain-key");

      await expect(
        loadApiConfig(configPath, { platform: "darwin", readKeychain }),
      ).resolves.toEqual({ apiKey: "dummy-keychain-key", baseUrl: BASE_URL });
      expect(readKeychain).toHaveBeenCalledTimes(1);
      // 임시 경로는 기본 경로가 아니라 경로별 account 로 읽는다.
      expect(readKeychain).toHaveBeenCalledWith(keychainApiKeyAccount(configPath));
      expect(readKeychain.mock.calls[0][0]).toMatch(/^apiKey:[0-9a-f]{16}$/);
    });
  });

  it("공백뿐인 apiKey 는 CLI 와 같이 없음으로 보지 않아 키체인을 부르지 않고 실패한다", async () => {
    await withConfig({ version: 1, apiKey: "   ", baseUrl: BASE_URL }, async (configPath) => {
      const readKeychain = vi.fn().mockResolvedValue("dummy-keychain-key");

      await expect(
        loadApiConfig(configPath, { platform: "darwin", readKeychain }),
      ).rejects.toThrow(/dooray setup/);
      expect(readKeychain).not.toHaveBeenCalled();
    });
  });

  it("macOS 에서도 파일에 apiKey 가 있으면 키체인을 부르지 않는다", async () => {
    await withConfig(
      { version: 1, apiKey: "dummy-file-key", baseUrl: BASE_URL },
      async (configPath) => {
        const readKeychain = vi.fn();

        await expect(
          loadApiConfig(configPath, { platform: "darwin", readKeychain }),
        ).resolves.toEqual({ apiKey: "dummy-file-key", baseUrl: BASE_URL });
        expect(readKeychain).not.toHaveBeenCalled();
      },
    );
  });

  it("macOS 가 아니면 키체인을 부르지 않고 dooray setup 을 안내한다", async () => {
    await withConfig({ version: 1, baseUrl: BASE_URL }, async (configPath) => {
      const readKeychain = vi.fn();

      await expect(
        loadApiConfig(configPath, { platform: "linux", readKeychain }),
      ).rejects.toThrow(/dooray setup/);
      expect(readKeychain).not.toHaveBeenCalled();
    });
  });

  it("키체인에도 없으면 dooray setup 을 안내한다", async () => {
    await withConfig({ version: 1, apiKey: "", baseUrl: BASE_URL }, async (configPath) => {
      const readKeychain = vi.fn().mockResolvedValue(undefined);

      await expect(
        loadApiConfig(configPath, { platform: "darwin", readKeychain }),
      ).rejects.toThrow(/dooray setup/);
    });
  });
});

describe("keychainApiKeyAccount", () => {
  it("계정 홈의 기본 config 경로면 apiKey 다", () => {
    expect(
      keychainApiKeyAccount(join(userInfo().homedir, ".dooray", "config.json")),
    ).toBe("apiKey");
  });

  it("다른 경로면 apiKey:<경로 sha256 앞 16자> 다", () => {
    const configPath = "/tmp/other-home/.dooray/config.json";
    const hash = createHash("sha256").update(configPath).digest("hex").slice(0, 16);

    expect(keychainApiKeyAccount(configPath)).toBe(`apiKey:${hash}`);
  });
});

describe("readKeychainApiKey", () => {
  it("주어진 account 로 읽는다", async () => {
    execFileMock.mockImplementationOnce((_file, _args, _options, callback) => {
      callback(null, "dummy-key\n", "");
    });

    await readKeychainApiKey("apiKey:0123456789abcdef");

    expect(execFileMock.mock.calls.at(-1)[1]).toEqual([
      "find-generic-password",
      "-s",
      "dooray-cli",
      "-a",
      "apiKey:0123456789abcdef",
      "-w",
    ]);
  });

  it("dooray-cli 서비스의 apiKey 항목을 읽고 끝 개행 하나만 뗀다", async () => {
    execFileMock.mockImplementationOnce((_file, _args, _options, callback) => {
      callback(null, " dummy-key \n", "");
    });

    await expect(readKeychainApiKey()).resolves.toBe(" dummy-key ");
    expect(execFileMock).toHaveBeenCalledWith(
      "/usr/bin/security",
      ["find-generic-password", "-s", "dooray-cli", "-a", "apiKey", "-w"],
      { env: expect.objectContaining({ HOME: userInfo().homedir }) },
      expect.any(Function),
    );
  });

  it("종료 코드 44 는 항목 없음이라 undefined 다", async () => {
    execFileMock.mockImplementationOnce((_file, _args, _options, callback) => {
      callback(Object.assign(new Error("exit 44"), { code: 44 }), "", "not found");
    });

    await expect(readKeychainApiKey()).resolves.toBeUndefined();
  });

  it("그 밖의 실패는 키체인 안내와 함께 던진다", async () => {
    execFileMock.mockImplementationOnce((_file, _args, _options, callback) => {
      callback(Object.assign(new Error("exit 51"), { code: 51 }), "", "locked");
    });

    await expect(readKeychainApiKey()).rejects.toThrow(/키체인/);
  });
});
