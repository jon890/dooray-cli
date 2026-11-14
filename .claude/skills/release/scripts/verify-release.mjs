#!/usr/bin/env node
// 릴리스가 제대로 나갔는지 확인한다.
//
// 사용법
//   node verify-release.mjs 0.19.0
//   node verify-release.mjs 0.19.0 --no-wait
//
// 넷을 본다.
//   1. 태그가 저장소와 origin 양쪽에 있다
//   2. GitHub Release 가 그 태그를 가리키고 draft 가 아니다
//   3. Release 본문에 backslash 잔재가 없다
//   4. npm 이 그 버전을 최신으로 낸다
//
// 3번은 heredoc 으로 본문을 넘길 때 덧붙인 escape 가 리터럴로 남는 사고를 잡는다.
// 본문은 파일로 쓰고 `--notes-file` 로 넘기면 이 항목이 항상 통과한다.
//
// 4번은 npm 의 로컬 캐시를 건너뛰고(`--prefer-online`) 레지스트리에 묻는다.
// `npm publish` 는 202 로 접수만 하고 몇 분 뒤에 최신 버전으로 반영한다.
// 그래서 기대 버전이 보일 때까지 15초 간격으로 최대 10분 기다린다. `--no-wait` 은 한 번만 묻는다.
//
// 종료 코드
//   0  넷 다 통과
//   1  하나 이상 실패
//   2  인자가 없거나 저장소 root 를 찾지 못했다

import { readFileSync } from "node:fs";
import { repoRoot, run } from "./lib.mjs";

const version = process.argv[2]?.replace(/^v/, "");
const waitForNpm = !process.argv.includes("--no-wait");
const NPM_WAIT_MS = 10 * 60 * 1000;
const NPM_POLL_MS = 15 * 1000;
if (!version) {
  console.error("버전을 인자로 준다.  node verify-release.mjs 0.19.0");
  process.exit(2);
}
const tag = `v${version}`;

const root = repoRoot();
if (!root) {
  console.error("git 저장소 안에서 실행한다.");
  process.exit(2);
}
process.chdir(root);
const failed = [];

const check = (name, ok, detail) => {
  console.log(`${ok ? "통과" : "실패"}: ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed.push(name);
};

// 1. 태그
const localTag = run("git", ["tag", "--list", tag]).stdout.trim();
const remoteTag = run("git", ["ls-remote", "--tags", "origin", `refs/tags/${tag}`]).stdout.trim();
check("로컬 태그", localTag === tag, localTag || "없음");
check("origin 태그", remoteTag.includes(tag), remoteTag ? "있음" : "없음");

// 2. Release
const rel = run("gh", ["release", "view", tag, "--json", "tagName,isDraft,body"]);
if (rel.status !== 0) {
  check("GitHub Release", false, (rel.stderr || "").trim() || "조회 실패");
} else {
  const { tagName, isDraft, body } = JSON.parse(rel.stdout);
  check("GitHub Release", tagName === tag && isDraft === false, `tag=${tagName} draft=${isDraft}`);

  // 3. backslash 잔재
  const backslashes = (body.match(/\\/g) || []).length;
  check(
    "Release 본문 escape 잔재",
    backslashes === 0,
    backslashes === 0 ? "없음" : `backslash ${backslashes}개 — 같은 노트 파일로 gh release edit 을 다시 돌린다`,
  );
}

// 4. npm
const pkgName = JSON.parse(readFileSync("package.json", "utf8")).name;
const npmLatest = () => run("npm", ["view", pkgName, "version", "--prefer-online"]).stdout.trim();
let npmVersion = npmLatest();
const deadline = Date.now() + NPM_WAIT_MS;
while (waitForNpm && npmVersion !== version && Date.now() < deadline) {
  console.error(`npm 최신 버전: ${npmVersion || "조회 실패"}. ${NPM_POLL_MS / 1000}초 뒤 다시 묻는다.`);
  await new Promise((resolve) => setTimeout(resolve, NPM_POLL_MS));
  npmVersion = npmLatest();
}
check(
  "npm 최신 버전",
  npmVersion === version,
  npmVersion
    ? `${npmVersion} (기대 ${version})${npmVersion === version || !waitForNpm ? "" : ". 10분 동안 반영되지 않았다. 게시 로그를 확인한다"}`
    : "조회 실패",
);

console.log("---------------");
if (failed.length === 0) {
  console.log(`${tag} 릴리스 확인 완료`);
  process.exit(0);
}
console.log(`실패: ${failed.join(", ")}`);
process.exit(1);
