#!/usr/bin/env node
// 릴리스 전 검증을 한 번에 돌린다. CI 의 release 워크플로와 같은 집합이다.
//
// 종료 코드
//   0  전부 통과
//   1  하나 이상 실패 (실패한 검사 이름을 마지막에 나열한다)
//   2  저장소 root 를 찾지 못했거나 필요한 파일이 없다
//
// 검사마다 자식 프로세스의 종료 코드를 그 자리에서 읽는다.
// 셸에서 파이프로 이어 붙이면 $? 가 파이프 마지막 명령의 것이 되어 실패가 0 으로 보인다.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function repoRoot() {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (r.status !== 0) return null;
  return r.stdout.trim() || null;
}

const root = repoRoot();
if (!root) {
  console.error("git 저장소 안에서 실행한다.");
  process.exit(2);
}
process.chdir(root);

const REQUIRED = ["package.json", "scripts/check-pii.mjs", "scripts/check-public-refs.mjs"];
const missing = REQUIRED.filter((f) => !existsSync(join(root, f)));
if (missing.length > 0) {
  console.error(`필요한 파일이 없다: ${missing.join(", ")}`);
  process.exit(2);
}

const CHECKS = [
  { name: "개인 식별 정보 검사", cmd: "node", args: ["scripts/check-pii.mjs"] },
  { name: "공개 문서 내부 참조", cmd: "node", args: ["scripts/check-public-refs.mjs"] },
  { name: "타입 검사", cmd: "pnpm", args: ["exec", "tsc", "--noEmit"] },
  { name: "테스트", cmd: "pnpm", args: ["test"] },
  { name: "빌드", cmd: "pnpm", args: ["run", "build"] },
  { name: "패키지 산출물 검증", cmd: "pnpm", args: ["run", "verify:package"] },
];

const failed = [];

for (const { name, cmd, args } of CHECKS) {
  console.log(`\n=== ${name} ===`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (r.error) {
    console.log(`실패: ${name} (${r.error.message})`);
    failed.push(name);
  } else if (r.status !== 0) {
    console.log(`실패: ${name} (종료 코드 ${r.status})`);
    failed.push(name);
  } else {
    console.log(`통과: ${name}`);
  }
}

// 버전 일치. 올릴 대상은 package.json 의 version 하나이고 CLI 버전은 빌드 시 거기서
// 주입된다. 문서에 적힌 다른 버전 숫자는 기능의 최소 버전 하한일 수 있어 대상이 아니다.
console.log("\n=== 버전 일치 ===");
const pkgVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const built = spawnSync("node", ["dist/index.js", "--version"], { encoding: "utf8" });
const builtVersion = built.status === 0 ? built.stdout.trim() : "읽지 못함";
console.log(`package.json=${pkgVersion}  dist=${builtVersion}`);
if (pkgVersion !== builtVersion) {
  console.log("실패: 버전 일치");
  failed.push("버전 일치");
} else {
  console.log("통과: 버전 일치");
}

console.log("\n===============");
if (failed.length === 0) {
  console.log("전부 통과");
  process.exit(0);
}
console.log(`실패한 검사: ${failed.join(", ")}`);
process.exit(1);
