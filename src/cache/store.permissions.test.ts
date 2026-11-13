/** chmod 실패는 무시하지만 쓰기 실패는 전파하고 자기 tmp 를 지우는지 실제 임시 파일로 확인한다. */
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ home: "", failRename: false, tmpNames: [] as string[] }));
vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()), homedir: () => fake.home,
}));
vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return {
    ...fs,
    chmod: vi.fn().mockRejectedValue(new Error("POSIX modes unsupported")),
    rename: vi.fn(async (from: string, to: string) => {
      fake.tmpNames.push(from);
      if (fake.failRename) throw new Error("rename failed");
      await fs.rename(from, to);
    }),
  };
});

beforeEach(async () => {
  fake.home = await mkdtemp(join(tmpdir(), "dooray-cache-permission-"));
  fake.failRename = false;
  fake.tmpNames = [];
  vi.resetModules();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(fake.home, { recursive: true, force: true });
});

it("chmod 가 실패해도 캐시를 저장하고 출력하지 않는다", async () => {
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  const { CACHE_DIR, setProjects, getProjects } = await import("./store.js");
  expect(CACHE_DIR).toBe(join(fake.home, ".dooray", "cache"));
  await expect(setProjects([])).resolves.toBeUndefined();
  expect((await getProjects())?.data).toEqual([]);
  expect(stdout).not.toHaveBeenCalled();
  expect(stderr).not.toHaveBeenCalled();
});

it("rename 실패를 전파하고 자기 tmp 를 지운다", async () => {
  const { CACHE_DIR, setProjects } = await import("./store.js");
  expect(CACHE_DIR).toBe(join(fake.home, ".dooray", "cache"));
  fake.failRename = true;
  await expect(setProjects([])).rejects.toThrow("rename failed");
  expect(await readdir(CACHE_DIR)).toEqual([]);
  expect(fake.tmpNames[0]).toMatch(new RegExp(`\\.${process.pid}\\.[0-9a-f-]{36}\\.tmp$`));
});
