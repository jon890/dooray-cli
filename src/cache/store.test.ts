import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  });

  afterEach(async () => {
    process.env.HOME = origHome;
    process.env.USERPROFILE = origProfile;
    await rm(home, { recursive: true, force: true });
  });

  it("캐시 디렉터리가 없어도 setMe 가 중첩 dir 을 만들고 파일을 쓴다", async () => {
    // homedir() 가 import 시점에 평가되므로 env 설정 후 동적 import.
    const { setMe, getMe } = await import("./store.js");

    await setMe({ id: "1", name: "홍길동" } as never);

    const filePath = join(home, ".dooray", "cache", "me.json");
    const s = await stat(filePath);
    expect(s.isFile()).toBe(true);

    const entry = await getMe();
    expect(entry?.data).toMatchObject({ id: "1", name: "홍길동" });
  });
});
