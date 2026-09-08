#!/usr/bin/env node
// 새 명령과 옵션이 사용자 문서에 있는지 본다.
//
// 사용법
//   node doc-sync-check.mjs                              직전 태그 이후 diff 에서 스스로 뽑는다
//   node doc-sync-check.mjs "wiki page move" --search    준 문자열만 검사한다
//
// 인자를 주지 않으면 직전 태그와 HEAD 사이의 `src/` diff 에서 추가된
// `new Command("...")` 와 `.option("--...")` 를 뽑아 검사 대상으로 삼는다.
// 사람이 목록을 뽑아 넘기면 빠뜨린 것은 검사도 통과한다. 무엇을 검사할지를 검사기가 정한다.
//
// 종료 코드
//   0  검사 대상이 모두 한 곳 이상에서 발견됐다 (대상이 0건인 경우를 포함한다)
//   1  0건인 문자열이 있다 (그 목록을 마지막에 나열한다)
//   2  검사 대상 경로가 없거나 diff 를 읽지 못했다
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

// 직전 태그 이후 `src/` diff 에서 새로 추가된 명령과 옵션을 뽑는다.
// 추가된 줄만 본다. 지워진 줄까지 세면 이미 없앤 것을 문서에서 찾게 된다.
function extractFromDiff() {
  const tag = spawnSync("git", ["describe", "--tags", "--abbrev=0"], { encoding: "utf8" });
  if (tag.status !== 0) {
    console.error("직전 태그를 찾지 못했다. 검사할 문자열을 인자로 준다.");
    process.exit(2);
  }
  const range = tag.stdout.trim() + "..HEAD";
  const diff = spawnSync("git", ["diff", "-U0", range, "--", "src/"], { encoding: "utf8" });
  if (diff.status !== 0) {
    console.error("diff 를 읽지 못했다: " + range);
    process.exit(2);
  }

  const commands = new Set();
  const options = new Set();
  for (const line of diff.stdout.split("\n")) {
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    for (const m of line.matchAll(/new Command\(\s*["'`]([^"'`]+)["'`]/g)) commands.add(m[1]);
    for (const m of line.matchAll(/\.option\(\s*["'`](--[a-z0-9-]+)/gi)) options.add(m[1]);
  }
  return { range, targets: [...commands, ...options] };
}

// process.argv 로 받으므로 앞의 `--` 없이도 `--search` 가 그대로 들어온다.
let targets = process.argv.slice(2);
let source = "인자";
if (targets.length === 0) {
  const found = extractFromDiff();
  targets = found.targets;
  source = found.range + " 의 src/ diff";
  if (targets.length === 0) {
    console.log(source + " 에 새 명령과 옵션이 없다. 문서 동기화 검사를 통과로 본다.");
    process.exit(0);
  }
}
console.log("검사 대상 " + targets.length + "건 (출처: " + source + ")");
for (const t of targets) console.log("  " + t);
console.log("---------------");

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
  // 발견 위치는 앞의 몇 건만 낸다. 전역 옵션처럼 문서 곳곳에 있는 문자열은
  // 수십 건이 잡혀, 정작 0건인 항목이 출력에 파묻힌다.
  const SHOW = 3;
  console.log(`${hits.length}건  ${needle}`);
  for (const h of hits.slice(0, SHOW)) {
    const text = h.text.length > 140 ? `${h.text.slice(0, 137)}...` : h.text;
    console.log(`      ${h.file}:${h.line}: ${text}`);
  }
  if (hits.length > SHOW) console.log(`      ... 그 밖 ${hits.length - SHOW}건`);
}

console.log("---------------");
if (missing.length === 0) {
  console.log("모두 문서에 있다");
  process.exit(0);
}
console.log(`문서에 없는 항목: ${missing.join(", ")}`);
console.log("넣을 위치를 사용자에게 보고하고 보완 커밋을 따로 만든다.");
process.exit(1);
