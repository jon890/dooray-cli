/** 실행 기록은 임시 HOME 에서만 쓰고, 신설·교체 권한과 동시 쓰기를 검증한다. */
import { mkdtemp, rm, stat, mkdir, chmod, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ home: "", failRename: false, failChmod: false }));
vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()), homedir: () => fake.home,
}));
vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return {
    ...fs,
    chmod: async (...args: Parameters<typeof fs.chmod>) => {
      if (fake.failChmod) throw new Error("unsupported chmod");
      await fs.chmod(...args);
    },
    rename: async (...args: Parameters<typeof fs.rename>) => {
      if (fake.failRename) throw new Error("rename failed");
      await fs.rename(...args);
    },
  };
});

const record = { argv: ["project", "list"], exitCode: 0, errorMessage: "", timestamp: "2026-01-01T00:00:00.000Z" };
let store: typeof import("./last-run.js");
let dir: string;

beforeEach(async () => {
  fake.home = await mkdtemp(join(tmpdir(), "dooray-last-run-"));
  fake.failRename = false;
  fake.failChmod = false;
  dir = join(fake.home, ".dooray");
  vi.resetModules();
  store = await import("./last-run.js");
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(fake.home, { recursive: true, force: true });
});

describe("직전 실행 기록 보호", () => {
  it(".dooray 없는 HOME 에 0700 폴더와 0600 파일을 만든다", async () => {
    await expect(stat(dir)).rejects.toMatchObject({ code: "ENOENT" });
    await store.writeLastRun(record);
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    expect((await stat(join(dir, "last-run.json"))).mode & 0o777).toBe(0o600);
    expect(await store.readLastRun()).toEqual(record);
  });

  it("기존의 넓은 권한도 저장할 때 맞춘다", async () => {
    await mkdir(dir);
    await chmod(dir, 0o755);
    const file = join(dir, "last-run.json");
    await writeFile(file, "{}");
    await chmod(file, 0o644);
    await store.writeLastRun(record);
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it("동시에 저장해도 JSON 이 깨지지 않고 tmp 를 남기지 않는다", async () => {
    const records = [record, { ...record, argv: ["config", "get"] }];
    await Promise.all(records.map((data) => store.writeLastRun(data)));
    expect(records).toContainEqual(await store.readLastRun());
    expect(await readdir(dir)).toEqual(["last-run.json"]);
  });

  it("chmod 실패는 무시하고 rename 실패 시 tmp 를 지우며 이전 기록은 유지한다", async () => {
    fake.failChmod = true;
    await store.writeLastRun(record);
    fake.failRename = true;
    await expect(store.writeLastRun({ ...record, exitCode: 1 })).rejects.toThrow("rename failed");
    expect(await store.readLastRun()).toEqual(record);
    expect(await readdir(dir)).toEqual(["last-run.json"]);
  });
});
