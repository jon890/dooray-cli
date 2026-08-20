import { describe, it, expect, vi, beforeEach } from "vitest";

// config/store 모킹 — 실제 ~/.dooray/config.json 을 건드리지 않게 하고,
// 이전 config 를 테스트가 직접 정해 판정 분기를 덮는다.
vi.mock("../config/store.js", () => ({
  getConfig: vi.fn(),
  setConfigValue: vi.fn().mockResolvedValue(undefined),
  saveConfig: vi.fn().mockResolvedValue(undefined),
}));

// cache/store 모킹 — clearCache 호출 여부와 반환값·실패 처리를 관찰한다
vi.mock("../cache/store.js", () => ({
  clearCache: vi.fn().mockResolvedValue(true),
}));

import {
  shouldInvalidateCache,
  updateConfigValue,
  replaceConfig,
} from "./config.js";
import { getConfig, setConfigValue, saveConfig } from "../config/store.js";
import { clearCache } from "../cache/store.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_CONFIG_ERROR } from "../utils/exit-codes.js";
import type { Config } from "../config/types.js";

const mockedGetConfig = vi.mocked(getConfig);
const mockedSetConfigValue = vi.mocked(setConfigValue);
const mockedSaveConfig = vi.mocked(saveConfig);
const mockedClearCache = vi.mocked(clearCache);

/** 자리수만 맞춘 가상 토큰. 실제 발급 값이 아니다. */
const KEY_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const KEY_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function config(over: Partial<Config> = {}): Config {
  return {
    version: 1,
    apiKey: KEY_A,
    baseUrl: "https://api.dooray.com",
    tenantName: "example",
    ...over,
  };
}

/** setConfigValue 의 알 수 없는 키 분기는 EXIT_CONFIG_ERROR 를 단 DoorayCliError 를 던진다 */
function unknownKeyError(): DoorayCliError {
  return new DoorayCliError("알 수 없는 설정 키: nope", EXIT_CONFIG_ERROR);
}

/** clearCache 는 node:fs 의 rm 을 부르므로 실패하면 raw Error 가 올라온다 */
function fsError(): Error {
  return Object.assign(new Error("EACCES: permission denied, rmdir"), {
    code: "EACCES",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedClearCache.mockResolvedValue(true);
  mockedSetConfigValue.mockResolvedValue(undefined);
  mockedSaveConfig.mockResolvedValue(undefined);
});

describe("shouldInvalidateCache", () => {
  it("이전 설정이 없으면 지우지 않는다", () => {
    expect(shouldInvalidateCache(null, config())).toBe(false);
  });

  it("apiKey 가 달라지면 지운다", () => {
    expect(
      shouldInvalidateCache(config(), config({ apiKey: KEY_B })),
    ).toBe(true);
  });

  it("baseUrl 이 달라지면 지운다", () => {
    expect(
      shouldInvalidateCache(
        config(),
        config({ baseUrl: "https://api.gov-dooray.com" }),
      ),
    ).toBe(true);
  });

  it("두 값이 같고 다른 값만 달라지면 지우지 않는다", () => {
    expect(
      shouldInvalidateCache(
        config(),
        config({ tenantName: "other", trackLastRun: true, smtpPort: 465 }),
      ),
    ).toBe(false);
  });

  it("같은 값을 그대로 다시 넣으면 지우지 않는다", () => {
    const prev = config();
    expect(shouldInvalidateCache(prev, { ...prev })).toBe(false);
  });
});

describe("updateConfigValue", () => {
  it("apiKey 가 바뀌면 저장 후 캐시를 지우고 cacheCleared 가 true 다", async () => {
    const order: string[] = [];
    mockedGetConfig
      .mockResolvedValueOnce(config())
      .mockResolvedValueOnce(config({ apiKey: KEY_B }));
    mockedSetConfigValue.mockImplementation(async () => {
      order.push("save");
    });
    mockedClearCache.mockImplementation(async () => {
      order.push("clear");
      return true;
    });

    const res = await updateConfigValue("api-key", KEY_B);

    expect(res).toEqual({ cacheCleared: true });
    expect(mockedSetConfigValue).toHaveBeenCalledWith("api-key", KEY_B);
    // 저장이 먼저이고 삭제가 나중이다. 순서가 뒤집히면 저장 실패 시 캐시만 날아간다.
    expect(order).toEqual(["save", "clear"]);
  });

  it("같은 값을 다시 설정하면 캐시를 지우지 않는다", async () => {
    const same = config();
    mockedGetConfig
      .mockResolvedValueOnce(same)
      .mockResolvedValueOnce({ ...same });

    const res = await updateConfigValue("base-url", same.baseUrl);

    expect(res).toEqual({ cacheCleared: false });
    expect(mockedClearCache).not.toHaveBeenCalled();
  });

  it("캐시에 영향 없는 키만 바뀌면 캐시를 지우지 않는다", async () => {
    mockedGetConfig
      .mockResolvedValueOnce(config())
      .mockResolvedValueOnce(config({ tenantName: "other" }));

    const res = await updateConfigValue("tenant-name", "other");

    expect(res).toEqual({ cacheCleared: false });
    expect(mockedClearCache).not.toHaveBeenCalled();
  });

  it("이전 설정이 없으면 캐시를 지우지 않는다", async () => {
    mockedGetConfig
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(config());

    const res = await updateConfigValue("api-key", KEY_A);

    expect(res).toEqual({ cacheCleared: false });
    expect(mockedClearCache).not.toHaveBeenCalled();
  });

  it("지울 캐시가 없었으면 cacheCleared 가 false 다", async () => {
    mockedGetConfig
      .mockResolvedValueOnce(config({ apiKey: "" }))
      .mockResolvedValueOnce(config());
    mockedClearCache.mockResolvedValue(false);

    const res = await updateConfigValue("api-key", KEY_A);

    // 판정은 true 라 clearCache 를 부르지만, 지운 것이 없어 안내는 나오지 않는다.
    expect(mockedClearCache).toHaveBeenCalled();
    expect(res).toEqual({ cacheCleared: false });
  });

  it("캐시 삭제가 실패해도 정상 반환하고 cacheCleared 가 false 다", async () => {
    mockedGetConfig
      .mockResolvedValueOnce(config())
      .mockResolvedValueOnce(config({ apiKey: KEY_B }));
    mockedClearCache.mockRejectedValue(fsError());
    const warn = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      await expect(updateConfigValue("api-key", KEY_B)).resolves.toEqual({
        cacheCleared: false,
      });
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("알 수 없는 키면 그대로 던지고 캐시를 지우지 않는다", async () => {
    mockedGetConfig.mockResolvedValueOnce(config());
    mockedSetConfigValue.mockRejectedValue(unknownKeyError());

    await expect(updateConfigValue("nope", "x")).rejects.toMatchObject({
      exitCode: EXIT_CONFIG_ERROR,
    });
    expect(mockedClearCache).not.toHaveBeenCalled();
  });

  it("저장 결과를 되읽지 못하면 경고하고 캐시를 지우지 않는다", async () => {
    mockedGetConfig
      .mockResolvedValueOnce(config())
      .mockResolvedValueOnce(null);
    const warn = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      await expect(updateConfigValue("api-key", KEY_B)).resolves.toEqual({
        cacheCleared: false,
      });
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
    expect(mockedClearCache).not.toHaveBeenCalled();
  });
});

describe("replaceConfig", () => {
  it("baseUrl 이 바뀌면 저장 후 캐시를 지우고 cacheCleared 가 true 다", async () => {
    const order: string[] = [];
    mockedGetConfig.mockResolvedValue(config());
    mockedSaveConfig.mockImplementation(async () => {
      order.push("save");
    });
    mockedClearCache.mockImplementation(async () => {
      order.push("clear");
      return true;
    });

    const next = config({ baseUrl: "https://api.dooray.co.kr" });
    const res = await replaceConfig(next);

    expect(res).toEqual({ cacheCleared: true });
    expect(mockedSaveConfig).toHaveBeenCalledWith(next);
    expect(order).toEqual(["save", "clear"]);
  });

  it("최초 설정이면 캐시를 지우지 않는다", async () => {
    mockedGetConfig.mockResolvedValue(null);

    const res = await replaceConfig(config());

    expect(res).toEqual({ cacheCleared: false });
    expect(mockedSaveConfig).toHaveBeenCalled();
    expect(mockedClearCache).not.toHaveBeenCalled();
  });

  it("같은 값으로 다시 저장하면 캐시를 지우지 않는다", async () => {
    const prev = config();
    mockedGetConfig.mockResolvedValue(prev);

    const res = await replaceConfig({ ...prev, trackLastRun: true });

    expect(res).toEqual({ cacheCleared: false });
    expect(mockedClearCache).not.toHaveBeenCalled();
  });

  it("지울 캐시가 없었으면 cacheCleared 가 false 다", async () => {
    mockedGetConfig.mockResolvedValue(config());
    mockedClearCache.mockResolvedValue(false);

    const res = await replaceConfig(config({ apiKey: KEY_B }));

    expect(mockedClearCache).toHaveBeenCalled();
    expect(res).toEqual({ cacheCleared: false });
  });

  it("캐시 삭제가 실패해도 정상 반환하고 cacheCleared 가 false 다", async () => {
    mockedGetConfig.mockResolvedValue(config());
    mockedClearCache.mockRejectedValue(fsError());
    const warn = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      await expect(
        replaceConfig(config({ apiKey: KEY_B })),
      ).resolves.toEqual({ cacheCleared: false });
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("저장이 실패하면 그대로 던지고 캐시를 지우지 않는다", async () => {
    mockedGetConfig.mockResolvedValue(config());
    mockedSaveConfig.mockRejectedValue(new Error("EACCES: permission denied"));

    await expect(replaceConfig(config({ apiKey: KEY_B }))).rejects.toThrow(
      "EACCES",
    );
    expect(mockedClearCache).not.toHaveBeenCalled();
  });
});
