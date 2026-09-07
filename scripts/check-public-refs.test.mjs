import { chmod, mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

import { findInternalRefs, walkFiles } from "./check-public-refs.mjs";

const scriptPath = resolve("scripts/check-public-refs.mjs");
const tempRoots = [];

async function makeTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "dooray-check-public-refs-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("findInternalRefs", () => {
  it("ADR 번호를 잡는다", () => {
    expect(findInternalRefs("참고: ADR-030")).toEqual(["ADR-030"]);
  });

  it("Issue 번호를 잡는다", () => {
    expect(findInternalRefs("Fixed by Issue #154")).toEqual(["Issue #154"]);
  });

  it("task 번호를 잡는다", () => {
    expect(findInternalRefs("see task 12")).toEqual(["task 12"]);
  });

  it("내부 참조가 없는 문장은 통과시킨다", () => {
    expect(findInternalRefs("사용법만 설명한다")).toEqual([]);
  });
});

describe("walkFiles", () => {
  it("node_modules, .git, dist, worktrees 를 건너뛴다", async () => {
    const root = await makeTempRoot();
    await mkdir(join(root, "skills", "dooray-cli"), { recursive: true });
    await mkdir(join(root, "skills", "node_modules"), { recursive: true });
    await mkdir(join(root, "skills", ".git"), { recursive: true });
    await mkdir(join(root, "skills", "dist"), { recursive: true });
    await mkdir(join(root, "skills", "worktrees"), { recursive: true });
    await writeFile(join(root, "README.md"), "public\n");
    await writeFile(join(root, "skills", "dooray-cli", "SKILL.md"), "skill\n");
    await writeFile(join(root, "skills", "node_modules", "skip.md"), "skip\n");
    await writeFile(join(root, "skills", ".git", "skip.md"), "skip\n");
    await writeFile(join(root, "skills", "dist", "skip.md"), "skip\n");
    await writeFile(join(root, "skills", "worktrees", "skip.md"), "skip\n");
    await symlink(join(root, "skills", "dooray-cli"), join(root, "skills", "linked-skill"), "dir");

    const files = await walkFiles(["README.md", "skills/"], { cwd: root });

    expect(files.map((file) => file.slice(root.length + 1))).toEqual([
      "README.md",
      "skills/dooray-cli/SKILL.md",
    ]);
  });
});

describe("check-public-refs CLI", () => {
  it("깨끗한 필수 root 는 종료 코드 0과 성공 메시지를 낸다", async () => {
    const root = await makeTempRoot();
    await mkdir(join(root, "skills"));
    await writeFile(join(root, "README.md"), "readme\n");
    await writeFile(join(root, "skills", "SKILL.md"), "skill\n");

    const result = spawnSync(process.execPath, [scriptPath], { cwd: root, encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("공개 문서 내부 참조 검사 통과");
  });

  it("위반이 있으면 종료 코드 1과 파일:줄:내용을 출력한다", async () => {
    const root = await makeTempRoot();
    await mkdir(join(root, "skills"));
    await writeFile(join(root, "README.md"), "첫 줄\n둘째 줄 ADR-030\n");

    const result = spawnSync(process.execPath, [scriptPath], { cwd: root, encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("[위반] 공개 문서에 내부 추적 번호가 있다");
    expect(result.stdout).toContain("README.md:2:둘째 줄 ADR-030");
  });

  it("필수 root 가 없으면 종료 코드 2로 실패한다", async () => {
    const root = await makeTempRoot();

    const result = spawnSync(process.execPath, [scriptPath], { cwd: root, encoding: "utf8" });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("필수 검사 경로를 읽을 수 없다");
    expect(result.stdout).not.toContain("검사 통과");
  });

  it("파일을 읽을 수 없으면 종료 코드 2로 실패한다", async () => {
    const root = await makeTempRoot();
    await mkdir(join(root, "skills"));
    await writeFile(join(root, "README.md"), "readme\n");
    await writeFile(join(root, "skills", "unreadable.md"), "unreadable\n", { mode: 0o000 });

    const result = spawnSync(process.execPath, [scriptPath], { cwd: root, encoding: "utf8" });
    await chmod(join(root, "skills", "unreadable.md"), 0o600);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("파일을 읽을 수 없다");
    expect(result.stdout).not.toContain("검사 통과");
  });
});
