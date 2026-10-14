import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DoorayCliError } from "../utils/errors.js";
import {
  EXIT_CONFIG_ERROR,
  EXIT_IO_ERROR,
  EXIT_PARAM_ERROR,
} from "../utils/exit-codes.js";
import type { SecretField, SecretStore } from "./secret-store.js";
import {
  clearMailCredentials,
  getConfig,
  getConfigOrThrow,
  saveConfig,
  setConfigValue,
} from "./store.js";

const {
  readFileMock,
  writeFileMock,
  mkdirMock,
  renameMock,
  chmodMock,
  unlinkMock,
  fake,
} = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  writeFileMock: vi.fn(),
  mkdirMock: vi.fn(),
  renameMock: vi.fn(),
  chmodMock: vi.fn(),
  unlinkMock: vi.fn(),
  fake: { store: null as unknown },
}));

vi.mock("node:fs/promises", () => ({
  mkdir: mkdirMock,
  readFile: readFileMock,
  writeFile: writeFileMock,
  rename: renameMock,
  chmod: chmodMock,
  unlink: unlinkMock,
}));

// 키체인 자리에 가짜 저장소를 넣는다. 검증 함수와 필드 목록은 실제 것을 쓴다.
vi.mock("./secret-store.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./secret-store.js")>()),
  getSecretStore: () => fake.store,
}));

type FakeStore = SecretStore & {
  values: Map<SecretField, string>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function createFakeStore(initial: Partial<Record<SecretField, string>> = {}): FakeStore {
  const values = new Map<SecretField, string>(
    Object.entries(initial) as [SecretField, string][],
  );
  return {
    values,
    get: vi.fn(async (name: SecretField) => values.get(name)),
    set: vi.fn(async (name: SecretField, value: string) => {
      values.set(name, value);
    }),
    delete: vi.fn(async (name: SecretField) => {
      values.delete(name);
    }),
  };
}

let store: FakeStore;
let stderr: string[];

const BASE = { version: 1, baseUrl: "https://api.dooray.com" } as const;

/** 저장도 이전 상태를 다시 읽으므로 테스트 동안 같은 내용을 돌려준다. */
function fileWith(content: Record<string, unknown>): void {
  readFileMock.mockResolvedValue(JSON.stringify(content));
}

function writtenConfig(): Record<string, unknown> {
  return JSON.parse(writeFileMock.mock.calls[0][1] as string);
}

beforeEach(() => {
  vi.clearAllMocks();
  readFileMock.mockReset();
  unlinkMock.mockResolvedValue(undefined);
  readFileMock.mockRejectedValue(
    Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
  );
  store = createFakeStore();
  fake.store = store;
  stderr = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("키체인 모드 읽기", () => {
  it("파일에 비어 있지 않은 값이 있으면 파일 값을 쓰고 키체인은 읽지 않는다", async () => {
    store.values.set("apiKey", "dummy-keychain-key");
    store.values.set("imapPassword", "dummy-keychain-pw");
    fileWith({ ...BASE, apiKey: "dummy-file-key", imapPassword: "dummy-file-pw" });

    await expect(getConfig()).resolves.toEqual({
      state: "ok",
      config: { ...BASE, apiKey: "dummy-file-key", imapPassword: "dummy-file-pw" },
    });
    expect(store.get).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it("파일에 없거나 빈 문자열이면 키체인 값을 쓴다", async () => {
    store.values.set("apiKey", "dummy-keychain-key");
    store.values.set("imapPassword", "dummy-keychain-pw");
    fileWith({ ...BASE, apiKey: "" });

    await expect(getConfig()).resolves.toMatchObject({
      state: "ok",
      config: { apiKey: "dummy-keychain-key", imapPassword: "dummy-keychain-pw" },
    });
    expect(store.get).toHaveBeenCalledWith("apiKey");
    expect(store.get).toHaveBeenCalledWith("imapPassword");
  });

  it("필드마다 따로 정한다", async () => {
    store.values.set("imapPassword", "dummy-keychain-pw");
    fileWith({ ...BASE, apiKey: "dummy-file-key" });

    await expect(getConfig()).resolves.toMatchObject({
      config: { apiKey: "dummy-file-key", imapPassword: "dummy-keychain-pw" },
    });
    expect(store.get).toHaveBeenCalledTimes(1);
    expect(store.get).toHaveBeenCalledWith("imapPassword");
  });

  it("파일에 apiKey 가 없어도 invalid 로 보지 않는다", async () => {
    store.values.set("apiKey", "dummy-keychain-key");
    fileWith({ ...BASE });

    await expect(getConfig()).resolves.toMatchObject({
      state: "ok",
      config: { apiKey: "dummy-keychain-key" },
    });
  });

  it("파일에도 키체인에도 apiKey 가 없으면 빈 문자열로 채워 설정 미완료로 안내한다", async () => {
    fileWith({ ...BASE });

    await expect(getConfig()).resolves.toEqual({
      state: "ok",
      config: { ...BASE, apiKey: "" },
    });
    await expect(getConfigOrThrow()).rejects.toMatchObject({
      exitCode: EXIT_CONFIG_ERROR,
      message: expect.stringContaining("dooray setup"),
    });
  });

  it("apiKey 가 문자열이 아닌 값이면 여전히 invalid 다", async () => {
    fileWith({ ...BASE, apiKey: 123 });

    await expect(getConfig()).resolves.toMatchObject({
      state: "invalid",
      reason: expect.stringContaining("apiKey"),
    });
    expect(store.get).not.toHaveBeenCalled();
  });

  it("파일이 없으면 키체인을 보지 않고 absent 다", async () => {
    await expect(getConfig()).resolves.toEqual({ state: "absent" });
    expect(store.get).not.toHaveBeenCalled();
  });

  it("키체인 읽기가 실패하면 unreadable 에 source keychain 을 붙인다", async () => {
    store.get.mockRejectedValueOnce(
      new DoorayCliError("키체인이 잠겨 있습니다", EXIT_CONFIG_ERROR),
    );
    fileWith({ ...BASE });

    await expect(getConfig()).resolves.toEqual({
      state: "unreadable",
      reason: "키체인이 잠겨 있습니다",
      source: "keychain",
    });
  });

  it("키체인 읽기 실패에서 getConfigOrThrow 는 파일 권한이 아니라 키체인 이유를 알린다", async () => {
    store.get.mockRejectedValueOnce(
      new DoorayCliError("키체인이 잠겨 있습니다", EXIT_CONFIG_ERROR),
    );
    fileWith({ ...BASE });

    const err = await getConfigOrThrow().catch((e: unknown) => e);
    expect(err).toMatchObject({
      exitCode: EXIT_CONFIG_ERROR,
      message: expect.stringContaining("키체인이 잠겨 있습니다"),
    });
    expect((err as Error).message).not.toContain("파일 권한");
  });
});

describe("키체인 모드 저장", () => {
  it("새 설정의 비밀값은 키체인에 쓰고 config.json 에서는 필드를 뺀다", async () => {
    await saveConfig({
      ...BASE,
      apiKey: "dummy-key",
      imapUsername: "user@example.com",
      imapPassword: "dummy-pw",
    });

    expect(store.set).toHaveBeenCalledWith("apiKey", "dummy-key");
    expect(store.set).toHaveBeenCalledWith("imapPassword", "dummy-pw");
    const written = writtenConfig();
    expect(written).not.toHaveProperty("apiKey");
    expect(written).not.toHaveProperty("imapPassword");
    expect(written).toMatchObject({ ...BASE, imapUsername: "user@example.com" });
    expect(writeFileMock.mock.calls[0][1]).not.toContain("dummy");
  });

  it("바뀌지 않은 비밀 필드는 키체인에 다시 쓰지 않는다", async () => {
    store.values.set("apiKey", "dummy-keychain-key");
    fileWith({ ...BASE });

    await setConfigValue("tenant-name", "example");

    expect(store.set).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
    expect(writtenConfig()).toMatchObject({ tenantName: "example" });
    expect(writtenConfig()).not.toHaveProperty("apiKey");
  });

  it("파일의 구버전 평문은 첫 저장 때 키체인으로 옮기고 파일에서 뺀다", async () => {
    fileWith({ ...BASE, apiKey: "dummy-file-key", imapPassword: "dummy-file-pw" });

    await setConfigValue("track-last-run", "true");

    expect(store.set).toHaveBeenCalledWith("apiKey", "dummy-file-key");
    expect(store.set).toHaveBeenCalledWith("imapPassword", "dummy-file-pw");
    const written = writtenConfig();
    expect(written).not.toHaveProperty("apiKey");
    expect(written).not.toHaveProperty("imapPassword");
    expect(written.trackLastRun).toBe(true);
  });

  it("파일 값이 키체인 값과 다르면 파일 값으로 키체인을 맞춘다", async () => {
    store.values.set("apiKey", "dummy-old-keychain-key");
    fileWith({ ...BASE, apiKey: "dummy-file-key" });

    await setConfigValue("tenant-name", "example");

    expect(store.set).toHaveBeenCalledWith("apiKey", "dummy-file-key");
    expect(store.values.get("apiKey")).toBe("dummy-file-key");
  });

  it("파일의 구버전 값을 키체인에 저장할 수 없으면 파일에 남기고 한 번 경고하며 다른 저장은 성공한다", async () => {
    fileWith({ ...BASE, apiKey: "dummy-file-key", imapPassword: "dummy비밀" });

    await expect(setConfigValue("base-url", "https://api.dooray.co.kr")).resolves.toBeUndefined();

    expect(store.set).toHaveBeenCalledWith("apiKey", "dummy-file-key");
    expect(store.set).not.toHaveBeenCalledWith("imapPassword", expect.anything());
    const written = writtenConfig();
    expect(written.baseUrl).toBe("https://api.dooray.co.kr");
    expect(written.imapPassword).toBe("dummy비밀");
    expect(written).not.toHaveProperty("apiKey");
    const warnings = stderr.filter((line) => line.includes("imapPassword"));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("config.json 에 남겨");
    expect(stderr.join("")).not.toContain("dummy");
  });

  it("구버전 비ASCII 값을 파일에 남길 때 같은 필드의 키체인 항목은 지운다", async () => {
    store.values.set("imapPassword", "dummy-stale-pw");
    fileWith({ ...BASE, apiKey: "dummy-file-key", imapPassword: "dummy비밀" });

    await setConfigValue("tenant-name", "example");

    expect(store.delete).toHaveBeenCalledWith("imapPassword");
    expect(store.values.has("imapPassword")).toBe(false);
    expect(writtenConfig().imapPassword).toBe("dummy비밀");
  });

  it("새로 지정한 값을 키체인에 저장할 수 없으면 어느 쪽에도 쓰기 전에 거절하고 값을 메시지에 넣지 않는다", async () => {
    fileWith({ ...BASE, apiKey: "dummy-file-key" });

    const err = await setConfigValue("imap-password", "dummy\tpw").catch(
      (e: unknown) => e,
    );

    expect(err).toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringContaining("imapPassword"),
    });
    expect((err as Error).message).not.toContain("dummy");
    expect(store.set).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it("비어 있거나 없는 비밀 필드는 키체인에 있던 항목만 지운다", async () => {
    store.values.set("imapPassword", "dummy-old-pw");

    await saveConfig({ ...BASE, apiKey: "" });

    expect(store.delete).toHaveBeenCalledTimes(1);
    expect(store.delete).toHaveBeenCalledWith("imapPassword");
    expect(store.set).not.toHaveBeenCalled();
  });

  it("키체인 저장이 실패하면 config.json 을 고치지 않고 앞서 바꾼 필드를 되돌린다", async () => {
    store.values.set("apiKey", "dummy-old-key");
    store.set
      .mockImplementationOnce(async (name: SecretField, value: string) => {
        store.values.set(name, value);
      })
      .mockRejectedValueOnce(
        new DoorayCliError("키체인 접근 거부", EXIT_CONFIG_ERROR),
      );

    await expect(
      saveConfig({ ...BASE, apiKey: "dummy-new-key", imapPassword: "dummy-pw" }),
    ).rejects.toMatchObject({
      exitCode: EXIT_CONFIG_ERROR,
      message: "키체인 접근 거부",
    });
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(renameMock).not.toHaveBeenCalled();
    expect(store.values.get("apiKey")).toBe("dummy-old-key");
  });

  it("파일 쓰기가 실패하면 키체인을 이전 값으로 되돌리고 없던 필드는 지운다", async () => {
    store.values.set("apiKey", "dummy-old-key");
    renameMock.mockRejectedValueOnce(
      Object.assign(new Error("EACCES"), { code: "EACCES" }),
    );

    await expect(
      saveConfig({ ...BASE, apiKey: "dummy-new-key", imapPassword: "dummy-pw" }),
    ).rejects.toMatchObject({ exitCode: EXIT_IO_ERROR });

    expect(store.values.get("apiKey")).toBe("dummy-old-key");
    expect(store.values.has("imapPassword")).toBe(false);
    expect(store.set).toHaveBeenLastCalledWith("apiKey", "dummy-old-key");
    expect(store.delete).toHaveBeenCalledWith("imapPassword");
  });

  it("되돌리기마저 실패하면 실제로 되돌리지 못한 필드만 나열해 덧붙인다", async () => {
    store.values.set("apiKey", "dummy-old-key");
    renameMock.mockRejectedValueOnce(
      Object.assign(new Error("EACCES"), { code: "EACCES" }),
    );
    // 저장: apiKey set, imapPassword set 성공. 되돌리기: imapPassword delete 성공, apiKey set 실패.
    store.set
      .mockImplementationOnce(async (name: SecretField, value: string) => {
        store.values.set(name, value);
      })
      .mockImplementationOnce(async (name: SecretField, value: string) => {
        store.values.set(name, value);
      })
      .mockRejectedValueOnce(new DoorayCliError("키체인 잠김", EXIT_CONFIG_ERROR));

    const err = await saveConfig({
      ...BASE,
      apiKey: "dummy-new-key",
      imapPassword: "dummy-pw",
    }).catch((e: unknown) => e);

    expect(err).toMatchObject({
      name: "DoorayCliError",
      exitCode: EXIT_IO_ERROR,
      message: expect.stringContaining("EACCES"),
    });
    const message = (err as Error).message;
    expect(message).toContain("키체인 일부(apiKey)가 새 값으로 남았을 수 있습니다");
    expect(message).not.toContain("imapPassword");
    expect(message).not.toContain("dummy");
    expect(store.values.has("imapPassword")).toBe(false);
  });

  it("clearMailCredentials 는 키체인의 imapPassword 를 지운다", async () => {
    store.values.set("apiKey", "dummy-keychain-key");
    store.values.set("imapPassword", "dummy-keychain-pw");
    fileWith({ ...BASE, imapUsername: "user@example.com" });

    await expect(clearMailCredentials()).resolves.toEqual({
      state: "cleared",
      hadCredentials: true,
    });
    expect(store.delete).toHaveBeenCalledWith("imapPassword");
    expect(store.values.has("imapPassword")).toBe(false);
    expect(store.values.get("apiKey")).toBe("dummy-keychain-key");
    expect(store.set).not.toHaveBeenCalled();
    expect(writtenConfig()).not.toHaveProperty("imapUsername");
  });
});
