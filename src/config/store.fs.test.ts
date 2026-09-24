import { mkdtemp, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// store.ts 는 모듈을 읽을 때 homedir() 로 경로를 정하므로 import 전에 가짜 홈을 준비한다.
const { fakeHome } = vi.hoisted(() => ({
  fakeHome: { dir: "" },
}));

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => fakeHome.dir };
});

fakeHome.dir = await mkdtemp(join(tmpdir(), "dooray-config-mode-"));
const { saveConfig } = await import("./store.js");

afterAll(async () => {
  await rm(fakeHome.dir, { recursive: true, force: true });
});

describe("config.json 실제 파일 권한", () => {
  it("이미 0o644 로 있던 config.json 도 저장하면 0o600 이 된다", async () => {
    const dir = join(fakeHome.dir, ".dooray");
    const path = join(dir, "config.json");
    await mkdir(dir, { recursive: true });
    await writeFile(path, "{}\n", { mode: 0o644 });
    expect((await stat(path)).mode & 0o777).toBe(0o644);

    await saveConfig({
      version: 1,
      apiKey: "api-key",
      baseUrl: "https://api.dooray.com",
    });

    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });
});
