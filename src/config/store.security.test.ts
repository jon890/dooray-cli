/** 임시 홈과 가짜 저장소로 읽기 경고·저장 후 해소를 검증한다. 실제 키체인에는 접근하지 않는다. */
import { mkdtemp, rm, stat, writeFile, readFile, mkdir, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SecretField, SecretStore } from "./secret-store.js";

const fake = vi.hoisted(() => ({ home: "", store: null as SecretStore | null }));
vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()), homedir: () => fake.home,
}));
vi.mock("./secret-store.js", async (original) => ({
  ...(await original<typeof import("./secret-store.js")>()), getSecretStore: () => fake.store,
}));

let store: typeof import("./store.js");
let configPath: string;
let stderr: ReturnType<typeof vi.spyOn>;
let stdout: ReturnType<typeof vi.spyOn>;
let set: ReturnType<typeof vi.fn<SecretStore["set"]>>;
let remove: ReturnType<typeof vi.fn<SecretStore["delete"]>>;
let values: Map<SecretField, string>;
const base = { version: 1, apiKey: "dummy-token", baseUrl: "https://api.dooray.com" };

async function fixture(data: Record<string, unknown> = base, mode = 0o600) {
  await writeFile(configPath, JSON.stringify(data));
  await chmod(configPath, mode);
}

beforeEach(async () => {
  fake.home = await mkdtemp(join(tmpdir(), "dooray-security-"));
  await mkdir(join(fake.home, ".dooray"));
  configPath = join(fake.home, ".dooray", "config.json");
  values = new Map();
  set = vi.fn(async (field: SecretField, value: string) => { values.set(field, value); });
  remove = vi.fn(async (field: SecretField) => { values.delete(field); });
  fake.store = { get: vi.fn(async (field) => values.get(field)), set, delete: remove };
  vi.resetModules();
  store = await import("./store.js");
  stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  stdout = vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(fake.home, { recursive: true, force: true });
});

describe("설정 파일 읽기 경고", () => {
  it("경고는 한 번만 내며 비밀값과 파일·저장소를 바꾸지 않는다", async () => {
    await fixture(base, 0o644);
    const before = await stat(configPath);
    const content = await readFile(configPath, "utf8");
    await expect(store.getConfigOrThrow()).resolves.toEqual(base);
    await expect(store.getConfigOrThrow()).resolves.toEqual(base);
    expect(stderr).toHaveBeenCalledTimes(1);
    const warning = stderr.mock.calls.flat().join("");
    expect(warning).toContain("apiKey");
    expect(warning).toContain("dooray config set track-last-run false");
    expect(warning.match(/dooray config set/g)).toHaveLength(1);
    expect(warning).toContain("다시 저장하면 비밀값이 키체인으로 옮겨지고 파일 권한이 0600 이 됩니다.");
    expect(warning).not.toContain(base.apiKey);
    expect(stdout).not.toHaveBeenCalled();
    expect(await readFile(configPath, "utf8")).toBe(content);
    const after = await stat(configPath);
    expect(after.mode).toBe(before.mode);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(set).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(values.size).toBe(0);
  });

  it("동시에 읽어도 경고는 한 번만 낸다", async () => {
    await fixture();
    await Promise.all([store.getConfigOrThrow(), store.getConfigOrThrow()]);
    expect(stderr).toHaveBeenCalledTimes(1);
  });

  it("호출부에서 경고를 끌 수 있다", async () => {
    await fixture();
    await store.getConfigOrThrow({ securityWarning: false });
    expect(stderr).not.toHaveBeenCalled();
  });

  it("설정 미완료 오류보다 먼저 경고한다", async () => {
    await fixture({ ...base, baseUrl: "" });
    await expect(store.getConfigOrThrow()).rejects.toThrow("설정이 완료되지 않았습니다");
    expect(stderr).toHaveBeenCalledTimes(1);
  });

  it("저장소가 없으면 0600 평문은 경고하지 않는다", async () => {
    fake.store = null;
    await fixture();
    await store.getConfigOrThrow();
    expect(stderr).not.toHaveBeenCalled();
  });

  it("저장소가 있어도 옮길 수 없는 값만 있으면 0600에서는 경고하지 않는다", async () => {
    values.set("apiKey", base.apiKey);
    await fixture({ version: 1, baseUrl: base.baseUrl, imapPassword: "가짜암호" });
    await store.getConfigOrThrow();
    expect(stderr).not.toHaveBeenCalled();
    expect(await store.readConfigFileSecurity()).toMatchObject([{ kind: "plaintext-unstorable", status: "warn" }]);
  });

  it("저장소 없는 0644 평문은 권한만 경고한다", async () => {
    fake.store = null;
    await fixture(base, 0o644);
    await store.getConfigOrThrow();
    expect(stderr.mock.calls.flat().join("")).toContain("0600");
    expect(stderr.mock.calls.flat().join("")).not.toContain("평문");
    expect(stderr.mock.calls.flat().join("")).not.toContain("키체인");
    expect(stderr.mock.calls.flat().join("")).toContain("다시 저장하면 파일 권한이 0600 이 됩니다.");
    expect(await store.readConfigFileSecurity()).toMatchObject([
      { kind: "plaintext-no-store", status: "warn" }, { kind: "wide-permission", status: "fail" },
    ]);
  });

  it("비밀값 없는 0644 파일은 경고하지 않는다", async () => {
    values.set("apiKey", base.apiKey);
    await fixture({ version: 1, baseUrl: base.baseUrl }, 0o644);
    await store.getConfigOrThrow();
    expect(stderr).not.toHaveBeenCalled();
  });

  it("config get 도 같은 경고를 낸다", async () => {
    await fixture();
    const { configCommand } = await import("../commands/config.js");
    await configCommand.parseAsync(["get", "api-key"], { from: "user" });
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(stdout).toHaveBeenCalledWith("api-key: dumm****oken");
  });

  it("안내한 config set 으로 저장하면 fail 이 사라진다", async () => {
    await fixture({ ...base, trackLastRun: true }, 0o644);
    const { configCommand } = await import("../commands/config.js");
    await configCommand.parseAsync(["set", "track-last-run", "true"], { from: "user" });
    expect(stderr).not.toHaveBeenCalled();
    expect((await store.readConfigFileSecurity()).filter((f) => f.status === "fail")).toEqual([]);
    expect((await stat(configPath)).mode & 0o777).toBe(0o600);
    expect((await store.getConfigOrThrow()).trackLastRun).toBe(true);
    expect(values.get("apiKey")).toBe(base.apiKey);
  });
});
