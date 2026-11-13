import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, stat, mkdir, writeFile, chmod, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CachedMe } from "./types.js";

// writeJson 은 내부 함수라 public setter (setMe) 를 통해 검증한다.
// 재현 대상: Windows 에서 캐시 디렉터리가 생성되지 않아 write 가 실패하던 문제 (#89).
// 근본 원인은 dir 도출을 수동 "/" 파싱으로 해서 join() 이 만든 플랫폼 구분자와 어긋난 것.
// 여기서는 중첩 캐시 디렉터리가 없을 때 setMe 가 dir 을 만들고 write 에 성공하는지 확인한다.
describe("cache store writeJson 디렉터리 생성", () => {
  let home: string;
  const origHome = process.env.HOME;
  const origProfile = process.env.USERPROFILE;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "dooray-cache-test-"));
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    vi.resetModules();
  });

  afterEach(async () => {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    if (origProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = origProfile;
    await rm(home, { recursive: true, force: true });
  });

  it("캐시 디렉터리가 없어도 setMe 가 중첩 dir 을 만들고 파일을 쓴다", async () => {
    // homedir() 가 import 시점에 평가되므로 env 설정 후 동적 import.
    const { setMe, getMe, CACHE_DIR } = await import("./store.js");
    expect(CACHE_DIR).toBe(join(home, ".dooray", "cache"));

    await setMe({ id: "1", name: "홍길동", orgId: "test-org" } satisfies CachedMe);

    const filePath = join(home, ".dooray", "cache", "me.json");
    const s = await stat(filePath);
    expect(s.isFile()).toBe(true);

    const entry = await getMe();
    expect(entry?.data).toMatchObject({ id: "1", name: "홍길동" });
    expect(s.mode & 0o777).toBe(0o600);
    expect((await stat(CACHE_DIR)).mode & 0o777).toBe(0o700);
  });

  it.each(["projects", "members"])("기존 %s 캐시의 넓은 폴더·파일 권한을 다시 쓸 때 맞춘다", async (kind) => {
    const { CACHE_DIR, setProjects, setMembers } = await import("./store.js");
    expect(CACHE_DIR).toBe(join(home, ".dooray", "cache"));
    const dir = kind === "projects" ? CACHE_DIR : join(CACHE_DIR, "members");
    await mkdir(dir, { recursive: true });
    await chmod(CACHE_DIR, 0o755);
    await chmod(dir, 0o755);
    const file = join(dir, kind === "projects" ? "projects.json" : "example-project.json");
    await writeFile(file, "{}");
    await chmod(file, 0o644);
    if (kind === "projects") await setProjects([]);
    else await setMembers("example-project", []);
    expect((await stat(CACHE_DIR)).mode & 0o777).toBe(0o700);
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect((await readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });
});
