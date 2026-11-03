import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

import {
  findForeignDomains,
  findLongIds,
  findUnknownProjects,
  OK_DOMAINS,
  OK_IDS,
  OK_PROJECTS,
  SUBCOMMANDS,
} from "./check-pii.mjs";

const scriptPath = resolve("scripts/check-pii.mjs");
const tempRoots = [];
async function makeTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "dooray-check-pii-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createCleanPiiRoot() {
  const root = await makeTempRoot();
  await Promise.all([
    mkdir(join(root, "skills")),
    mkdir(join(root, "docs")),
    mkdir(join(root, ".claude")),
    mkdir(join(root, ".github")),
    mkdir(join(root, "scripts")),
    mkdir(join(root, "tasks")),
    mkdir(join(root, "src")),
  ]);
  await writeFile(join(root, "README.md"), "readme\n");
  await writeFile(join(root, "CLAUDE.md"), "claude\n");
  return root;
}

  // root uid 는 mode 0o000 파일도 읽으므로 이 검사가 성립하지 않는다.
  // self-hosted 나 컨테이너 러너에서 flake 로 남지 않게 건너뛴다.
  const skipAsRoot = process.getuid?.() === 0;

describe("findForeignDomains", () => {
  // 목록 내용은 scripts/check-pii.mjs 의 OK_DOMAINS 한 곳이 소유한다. 추가와 삭제는 그 파일의 diff 로 리뷰한다.
  // 여기서는 항목을 다시 적지 않고, 완전 일치 비교가 기대는 형식만 고정한다.
  it("허용 도메인은 scheme·경로·와일드카드 없는 소문자 호스트다", () => {
    for (const domain of OK_DOMAINS) {
      expect(domain).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
    }
  });

  it("허용 도메인은 중복 없이 정렬돼 있다", () => {
    expect(new Set(OK_DOMAINS).size).toBe(OK_DOMAINS.length);
    expect([...OK_DOMAINS].sort()).toEqual(OK_DOMAINS);
  });

  it("화이트리스트 안의 URL 도메인을 통과시킨다", () => {
    expect(findForeignDomains("https://github.com/x", OK_DOMAINS)).toEqual([]);
  });

  it("허용 도메인의 URL 과 이메일을 모두 통과시킨다", () => {
    const text = OK_DOMAINS.flatMap((domain) => [`https://${domain}/x`, `user@${domain}`]).join("\n");

    expect(findForeignDomains(text, OK_DOMAINS)).toEqual([]);
  });

  it("호스트 경계 앵커가 빠지면 통과할 도메인을 위반으로 잡는다", () => {
    const host = "evil-" + "dooray.com";

    expect(findForeignDomains(`https://${host}/x`, OK_DOMAINS)).toEqual([`https://${host}`]);
  });

  it("허용 도메인 뒤에 붙은 나머지 host 문자까지 비교한다", () => {
    const host = "github.com" + ".evil";

    expect(findForeignDomains(`https://${host}/x`, OK_DOMAINS)).toEqual([`https://${host}`]);
  });

  it("@ 접두 이메일에서 목록 밖 도메인을 잡는다", () => {
    const host = "mail." + "invalid" + ".com";

    expect(findForeignDomains(`user@example.com\nuser@${host}`, OK_DOMAINS)).toEqual([`@${host}`]);
  });

  it("코드의 property 접근은 검사하지 않는다", () => {
    expect(findForeignDomains("obj.com\nx.net", OK_DOMAINS)).toEqual([]);
  });

  it("허용 도메인에 임의 tenant 접두가 붙은 하위 도메인은 위반으로 잡는다", () => {
    const host = "tenant." + "dooray.com";

    expect(findForeignDomains(`https://${host}/x`, OK_DOMAINS)).toEqual([`https://${host}`]);
  });
});

describe("findLongIds", () => {
  it("허용 ID 를 통과시킨다", () => {
    expect(findLongIds(OK_IDS[0], OK_IDS)).toEqual([]);
  });

  it("허용 목록 밖의 15자리 이상 숫자를 잡는다", () => {
    const id = "55555" + "66666" + "77777";

    expect(findLongIds(id, OK_IDS)).toEqual([id]);
  });

  it("한 줄에 허용 ID 와 실제 ID 가 같이 있어도 실제 ID 를 잡는다", () => {
    const id = "55555" + "66666" + "77777";

    expect(findLongIds(`${OK_IDS[0]} ${id}`, OK_IDS)).toEqual([id]);
  });

  it("14자리 이하 숫자는 잡지 않는다", () => {
    expect(findLongIds("12345678901234", OK_IDS)).toEqual([]);
  });
});

describe("findUnknownProjects", () => {
  it("허용 project 를 통과시킨다", () => {
    expect(findUnknownProjects("dooray post list my-project", OK_PROJECTS, SUBCOMMANDS)).toEqual([]);
  });

  it("허용 목록 밖의 project 를 잡는다", () => {
    const project = "unknown" + "proj";

    expect(findUnknownProjects(`dooray post list ${project}`, OK_PROJECTS, SUBCOMMANDS)).toEqual([project]);
  });

  it("project 자리에 하위 명령 이름이 온 형태를 잡지 않는다", () => {
    expect(findUnknownProjects("dooray project tags create my-project", OK_PROJECTS, SUBCOMMANDS)).toEqual([]);
  });

  it("<project> placeholder 는 잡지 않는다", () => {
    expect(findUnknownProjects("dooray post list <project>", OK_PROJECTS, SUBCOMMANDS)).toEqual([]);
  });
});

describe("check-pii CLI", () => {
  it("깨끗한 필수 root 는 종료 코드 0과 성공 메시지를 낸다", async () => {
    const root = await createCleanPiiRoot();

    const result = spawnSync(process.execPath, [scriptPath], { cwd: root, encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("개인 식별 정보 검사 통과");
  });

  it("위반이 있으면 종료 코드 1과 파일:줄:매치를 출력한다", async () => {
    const root = await createCleanPiiRoot();
    const host = "bad-domain" + ".com";
    await writeFile(join(root, "scripts", "bad.md"), `첫 줄\nhttps://${host}/x\n`);

    const result = spawnSync(process.execPath, [scriptPath], { cwd: root, encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("화이트리스트 밖 도메인");
    expect(result.stdout).toContain(`scripts/bad.md:2:https://${host}`);
  });

  it("필수 root 가 없으면 종료 코드 2로 실패한다", async () => {
    const root = await makeTempRoot();

    const result = spawnSync(process.execPath, [scriptPath], { cwd: root, encoding: "utf8" });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("필수 검사 경로를 읽을 수 없다");
    expect(result.stdout).not.toContain("검사 통과");
  });

  it.skipIf(skipAsRoot)("필수 파일을 읽을 수 없으면 종료 코드 2로 실패한다", async () => {
    const root = await createCleanPiiRoot();
    await writeFile(join(root, "scripts", "unreadable.md"), "unreadable\n", { mode: 0o000 });

    const result = spawnSync(process.execPath, [scriptPath], { cwd: root, encoding: "utf8" });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("파일을 읽을 수 없다");
    expect(result.stdout).not.toContain("검사 통과");
  });
});
