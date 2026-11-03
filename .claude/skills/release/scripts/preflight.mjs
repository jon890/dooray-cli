#!/usr/bin/env node
// 릴리스 전에 코드, 문서, 패키지 산출물과 빌드된 CLI 버전을 검사한다.
// 로컬에서 게시할 릴리스면 npm 로그인도 검사한다.
// CI release 워크플로의 태그-버전 일치와 pre-release 거부는 게시 단계에서 따로 검사한다.
//
// 종료 코드
//   0  전부 통과
//   1  하나 이상 실패 (실패한 검사 이름을 마지막에 나열한다)
//   2  저장소 root 를 찾지 못했거나 필요한 파일이 없다
//
// 검사마다 자식 프로세스의 종료 코드를 그 자리에서 읽는다.
// 셸에서 파이프로 이어 붙이면 $? 가 파이프 마지막 명령의 것이 되어 실패가 0 으로 보인다.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot, run } from "./lib.mjs";

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
  const r = run(cmd, args, { stdio: "inherit" });
  if (r.error) {
    console.log(`실패: ${name} (${r.error.message})`);
    failed.push(name);
  } else if (r.status !== 0) {
    console.log(`실패: ${name} (${r.signal ? `시그널 ${r.signal}` : `종료 코드 ${r.status}`})`);
    failed.push(name);
  } else {
    console.log(`통과: ${name}`);
  }
}

// 버전 일치. 올릴 대상은 package.json 의 version 하나이고 CLI 버전은 빌드 시 거기서
// 주입된다. 문서에 적힌 다른 버전 숫자는 기능의 최소 버전 하한일 수 있어 대상이 아니다.
console.log("\n=== 버전 일치 ===");
const pkgVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const built = run(process.execPath, ["dist/index.js", "--version"]);
const builtVersion = built.status === 0 ? built.stdout.trim() : "읽지 못함";
console.log(`package.json=${pkgVersion}  dist=${builtVersion}`);
if (pkgVersion !== builtVersion) {
  console.log("실패: 버전 일치");
  failed.push("버전 일치");
} else {
  console.log("통과: 버전 일치");
}

// npm 로그인. 로그인이 만료된 채 게시하면 태그를 민 뒤에 PUT 404 로 실패하므로 여기서 막는다.
// NPM_TRUSTED_PUBLISHING 이 true 면 CI 가 게시하므로 보지 않는다. 변수를 읽지 못하면 로컬 게시로 본다.
console.log("\n=== npm 로그인 ===");
const trusted = run("gh", ["variable", "get", "NPM_TRUSTED_PUBLISHING"]);
if (trusted.status === 0 && trusted.stdout.trim() === "true") {
  console.log("건너뜀: npm 로그인 (NPM_TRUSTED_PUBLISHING=true 라 CI 가 게시한다)");
} else {
  const whoami = run("npm", ["whoami"]);
  if (whoami.status === 0) {
    console.log(`통과: npm 로그인 (${whoami.stdout.trim()})`);
  } else {
    console.log("실패: npm 로그인 (npm whoami 실패). 사용자에게 `npm login` 을 요청한 뒤 다시 돌린다.");
    failed.push("npm 로그인");
  }
}

console.log("\n===============");
if (failed.length === 0) {
  console.log("전부 통과");
  process.exit(0);
}
console.log(`실패한 검사: ${failed.join(", ")}`);
process.exit(1);
