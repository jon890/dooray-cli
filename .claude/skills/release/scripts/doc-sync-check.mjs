#!/usr/bin/env node
// 새 명령과 옵션이 사용자 문서에 있는지 본다.
//
// 사용법
//   node doc-sync-check.mjs "wiki page move" --search --no-children
//
// 종료 코드
//   0  준 문자열이 모두 한 곳 이상에서 발견됐다
//   1  0건인 문자열이 있다 (그 목록을 마지막에 나열한다)
//   2  인자가 없거나 검사 대상 경로가 없다
//
// 인자를 셸의 grep 에 넘기지 않고 파일을 직접 읽어 고정 문자열로 찾는다.
// grep 에 넘기면 `--search` 같은 값을 grep 자기 옵션으로 해석해
// 오류를 내거나 0건을 내고, 그것이 문서 누락으로 오독된다.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

function repoRoot() {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() || null : null;
}

const root = repoRoot();
if (!root) {
  console.error("git 저장소 안에서 실행한다.");
  process.exit(2);
}
process.chdir(root);

// process.argv 로 받으므로 앞의 `--` 없이도 `--search` 가 그대로 들어온다.
const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error("검사할 명령이나 옵션 문자열을 인자로 준다.");
  console.error('  node doc-sync-check.mjs "wiki page move" --search');
  process.exit(2);
}

const SCAN = ["README.md", "skills"].filter((p) => existsSync(join(root, p)));
if (SCAN.length === 0) {
  console.error("README.md 도 skills/ 도 없다.");
  process.exit(2);
}

const DOC_EXT = /\.(md|txt)$/i;

function collectFiles(p, out = []) {
  const abs = join(root, p);
  const st = statSync(abs);
  if (st.isFile()) {
    if (DOC_EXT.test(p)) out.push(p);
    return out;
  }
  for (const entry of readdirSync(abs)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    collectFiles(join(p, entry), out);
  }
  return out;
}

const files = SCAN.flatMap((p) => collectFiles(p));
const contents = new Map(files.map((f) => [f, readFileSync(join(root, f), "utf8").split("\n")]));

const missing = [];

for (const needle of targets) {
  const hits = [];
  for (const [file, lines] of contents) {
    lines.forEach((line, i) => {
      if (line.includes(needle)) hits.push({ file: relative(".", file), line: i + 1, text: line.trim() });
    });
  }
  if (hits.length === 0) {
    console.log(`0건  ${needle}`);
    missing.push(needle);
    continue;
  }
  console.log(`${hits.length}건  ${needle}`);
  for (const h of hits) {
    const text = h.text.length > 140 ? `${h.text.slice(0, 137)}...` : h.text;
    console.log(`      ${h.file}:${h.line}: ${text}`);
  }
}

console.log("---------------");
if (missing.length === 0) {
  console.log("모두 문서에 있다");
  process.exit(0);
}
console.log(`문서에 없는 항목: ${missing.join(", ")}`);
console.log("넣을 위치를 사용자에게 보고하고 보완 커밋을 따로 만든다.");
process.exit(1);
