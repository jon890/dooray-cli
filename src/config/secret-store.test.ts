import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { userInfo } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXIT_CONFIG_ERROR, EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import {
  createKeychainSecretStore,
  getSecretStore,
  keychainAccount,
  securityEnv,
} from "./secret-store.js";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

// 실제 security 를 띄우지 않는다. 이 파일의 어떤 테스트도 키체인에 닿으면 안 된다.
vi.mock("node:child_process", () => ({ spawn: spawnMock }));

/** security 는 계정의 실제 홈을 HOME 으로 받는다. */
const SPAWN_OPTIONS = {
  stdio: ["pipe", "pipe", "pipe"],
  env: expect.objectContaining({ HOME: userInfo().homedir }),
};

interface FakeRun {
  code?: number | null;
  stdout?: string;
  stderr?: string;
  error?: Error;
}

/** spawn 이 돌려줄 가짜 프로세스를 만들고, stdin 에 쓰인 내용을 모은다. */
function queueRun(run: FakeRun): { stdin: () => string } {
  let written = "";
  spawnMock.mockImplementationOnce(() => {
    const child = new EventEmitter() as EventEmitter & {
      stdin: PassThrough;
      stdout: PassThrough;
      stderr: PassThrough;
    };
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin.on("data", (chunk: Buffer) => {
      written += chunk.toString("utf8");
    });
    child.stdin.on("finish", () => {
      if (run.error) {
        child.emit("error", run.error);
        return;
      }
      child.stdout.end(run.stdout ?? "");
      child.stderr.end(run.stderr ?? "");
      setImmediate(() => child.emit("close", run.code ?? 0));
    });
    return child;
  });
  return { stdin: () => written };
}

function allArgv(): string[] {
  return spawnMock.mock.calls.flatMap(([cmd, args]) => [cmd, ...args]);
}

beforeEach(() => {
  spawnMock.mockReset();
});

describe("keychain set", () => {
  it("/usr/bin/security -i 를 띄우고 stdin 으로 명령 한 줄을 넘긴다", async () => {
    const run = queueRun({ code: 0 });

    await createKeychainSecretStore().set("apiKey", "dummy-key");

    expect(spawnMock).toHaveBeenCalledWith("/usr/bin/security", ["-i"], SPAWN_OPTIONS);
    expect(run.stdin()).toBe(
      'add-generic-password -U -s dooray-cli -a apiKey -w "dummy-key"\n',
    );
    expect(allArgv().join(" ")).not.toContain("dummy-key");
  });

  it("큰따옴표와 역슬래시를 이스케이프한다", async () => {
    const run = queueRun({ code: 0 });

    await createKeychainSecretStore().set("imapPassword", `a b"c\\d$e'f`);

    expect(run.stdin()).toBe(
      `add-generic-password -U -s dooray-cli -a imapPassword -w "a b\\"c\\\\d$e'f"\n`,
    );
  });

  it.each([
    ["한글", "dummy키"],
    ["줄바꿈", "dummy\nkey"],
    ["탭", "dummy\tkey"],
    ["제어 문자", "dummy\u0000key"],
  ])("%s 이 있으면 security 를 띄우지 않고 거절하며 값을 메시지에 넣지 않는다", async (_label, value) => {
    const err = await createKeychainSecretStore()
      .set("apiKey", value)
      .catch((e: unknown) => e);

    expect(err).toMatchObject({
      name: "DoorayCliError",
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringContaining("apiKey"),
    });
    expect((err as Error).message).not.toContain("dummy");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("실패하면 DoorayCliError 로 알리고 stderr 의 비밀값은 가린다", async () => {
    queueRun({ code: 1, stderr: 'add-generic-password: "dummy-key" rejected' });

    const err = await createKeychainSecretStore()
      .set("apiKey", "dummy-key")
      .catch((e: unknown) => e);

    expect(err).toMatchObject({
      name: "DoorayCliError",
      exitCode: EXIT_CONFIG_ERROR,
      message: expect.stringContaining("잠겨 있거나"),
    });
    expect((err as Error).message).toContain("rejected");
    expect((err as Error).message).not.toContain("dummy-key");
  });
});

describe("keychain get", () => {
  it("find-generic-password 를 argv 로 부르고 끝 개행 하나만 뗀다", async () => {
    queueRun({ code: 0, stdout: "  dummy key \n" });

    await expect(createKeychainSecretStore().get("apiKey")).resolves.toBe(
      "  dummy key ",
    );
    expect(spawnMock).toHaveBeenCalledWith(
      "/usr/bin/security",
      ["find-generic-password", "-s", "dooray-cli", "-a", "apiKey", "-w"],
      SPAWN_OPTIONS,
    );
  });

  it("종료 코드 44 는 항목 없음이라 undefined 다", async () => {
    queueRun({ code: 44, stderr: "The specified item could not be found in the keychain." });

    await expect(createKeychainSecretStore().get("imapPassword")).resolves.toBeUndefined();
  });

  it("그 밖의 실패는 DoorayCliError 로 알린다", async () => {
    queueRun({ code: 51, stderr: "User interaction is not allowed." });

    await expect(createKeychainSecretStore().get("apiKey")).rejects.toMatchObject({
      name: "DoorayCliError",
      exitCode: EXIT_CONFIG_ERROR,
      message: expect.stringContaining("User interaction is not allowed."),
    });
  });

  it("security 를 띄우지 못해도 DoorayCliError 로 알린다", async () => {
    queueRun({ error: Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }) });

    await expect(createKeychainSecretStore().get("apiKey")).rejects.toMatchObject({
      name: "DoorayCliError",
      exitCode: EXIT_CONFIG_ERROR,
      message: expect.stringContaining("ENOENT"),
    });
  });

  it("같은 인스턴스는 읽은 값과 쓴 값을 기억해 security 를 다시 띄우지 않는다", async () => {
    const store = createKeychainSecretStore();
    queueRun({ code: 0, stdout: "dummy-key\n" });
    queueRun({ code: 44 });

    expect(await store.get("apiKey")).toBe("dummy-key");
    expect(await store.get("apiKey")).toBe("dummy-key");
    expect(await store.get("imapPassword")).toBeUndefined();
    expect(await store.get("imapPassword")).toBeUndefined();
    expect(spawnMock).toHaveBeenCalledTimes(2);

    queueRun({ code: 0 });
    await store.set("apiKey", "dummy-new");
    expect(await store.get("apiKey")).toBe("dummy-new");
    expect(spawnMock).toHaveBeenCalledTimes(3);
  });

  it("실패는 기억하지 않는다", async () => {
    const store = createKeychainSecretStore();
    queueRun({ code: 51, stderr: "locked" });
    queueRun({ code: 0, stdout: "dummy-key\n" });

    await expect(store.get("apiKey")).rejects.toBeInstanceOf(Error);
    await expect(store.get("apiKey")).resolves.toBe("dummy-key");
  });
});

describe("keychain delete", () => {
  it("delete-generic-password 를 부른다", async () => {
    queueRun({ code: 0 });

    await createKeychainSecretStore().delete("imapPassword");

    expect(spawnMock).toHaveBeenCalledWith(
      "/usr/bin/security",
      ["delete-generic-password", "-s", "dooray-cli", "-a", "imapPassword"],
      SPAWN_OPTIONS,
    );
  });

  it("종료 코드 44 는 지울 항목이 없던 것이라 정상이다", async () => {
    queueRun({ code: 44 });

    await expect(createKeychainSecretStore().delete("apiKey")).resolves.toBeUndefined();
  });

  it("그 밖의 실패는 DoorayCliError 로 알린다", async () => {
    queueRun({ code: 1, stderr: "denied" });

    await expect(createKeychainSecretStore().delete("apiKey")).rejects.toMatchObject({
      name: "DoorayCliError",
      exitCode: EXIT_CONFIG_ERROR,
    });
  });
});

describe("securityEnv", () => {
  it("HOME 이 다른 경로여도 security 에는 계정의 실제 홈을 넘긴다", () => {
    vi.stubEnv("HOME", "/tmp/dooray-fake-home");
    try {
      const env = securityEnv();
      expect(env.HOME).toBe(userInfo().homedir);
      expect(env.HOME).not.toBe("/tmp/dooray-fake-home");
      // HOME 외의 환경은 그대로 넘긴다.
      expect(env.PATH).toBe(process.env.PATH);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("keychainAccount", () => {
  it("계정 홈의 기본 config 경로면 필드 이름 그대로다", () => {
    const defaultPath = join(userInfo().homedir, ".dooray", "config.json");

    expect(keychainAccount("apiKey", defaultPath)).toBe("apiKey");
    expect(keychainAccount("imapPassword", defaultPath)).toBe("imapPassword");
  });

  it("다른 경로면 <field>:<경로 sha256 앞 16자> 다", () => {
    const configPath = "/tmp/other home/.dooray/config.json";
    const hash = createHash("sha256").update(configPath).digest("hex").slice(0, 16);

    expect(keychainAccount("apiKey", configPath)).toBe(`apiKey:${hash}`);
    expect(keychainAccount("imapPassword", configPath)).toBe(`imapPassword:${hash}`);
  });

  it("경로는 resolve 로 정규화해 비교한다", () => {
    const messy = join(userInfo().homedir, ".dooray", "..", ".dooray", "config.json");

    expect(keychainAccount("apiKey", messy)).toBe("apiKey");
  });
});

describe("경로별 account", () => {
  const otherPath = "/tmp/other-home/.dooray/config.json";
  const account = keychainAccount("apiKey", otherPath);

  it("-i 명령 줄에 해시 account 가 들어간다", async () => {
    const run = queueRun({ code: 0 });

    await createKeychainSecretStore((field) => keychainAccount(field, otherPath)).set(
      "apiKey",
      "dummy-key",
    );

    expect(account).toMatch(/^apiKey:[0-9a-f]{16}$/);
    expect(run.stdin()).toBe(
      `add-generic-password -U -s dooray-cli -a ${account} -w "dummy-key"\n`,
    );
  });

  it("읽기와 지우기 argv 에도 해시 account 를 쓴다", async () => {
    const store = createKeychainSecretStore((field) => keychainAccount(field, otherPath));
    queueRun({ code: 44 });
    queueRun({ code: 0 });

    await store.get("apiKey");
    await store.delete("apiKey");

    expect(spawnMock.mock.calls[0][1]).toEqual([
      "find-generic-password", "-s", "dooray-cli", "-a", account, "-w",
    ]);
    expect(spawnMock.mock.calls[1][1]).toEqual([
      "delete-generic-password", "-s", "dooray-cli", "-a", account,
    ]);
  });

  it.runIf(process.platform === "darwin")(
    "getSecretStore 는 넘긴 config 경로의 account 로 저장소를 만든다",
    async () => {
      queueRun({ code: 44 });

      await getSecretStore(otherPath)?.get("apiKey");

      expect(spawnMock.mock.calls[0][1]).toContain(account);
    },
  );
});

describe("키체인 실패 안내", () => {
  it("잠금 해제와 항목 삭제 후 setup 을 안내한다", async () => {
    queueRun({ code: 51, stderr: "User interaction is not allowed." });

    const err = await createKeychainSecretStore().get("apiKey").catch((e: unknown) => e);

    const message = (err as Error).message;
    expect(message).toContain("security unlock-keychain");
    expect(message).toContain("dooray-cli");
    expect(message).toContain("dooray setup");
  });
});
