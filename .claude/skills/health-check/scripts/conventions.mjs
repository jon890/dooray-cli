#!/usr/bin/env node
// dooray-cli 의 규약 가운데 grep 으로 판정할 수 있는 것을 검사한다.
//
//   node .claude/skills/health-check/scripts/conventions.mjs [--json]
//
// 규칙마다 등급이 있다.
//   error  규약 위반이다. 하나라도 있으면 종료 코드 1
//   warn   고칠 후보다. 종료 코드에 넣지 않는다
//   info   추세를 보는 수치다. 종료 코드에 넣지 않는다
//
// 규칙의 근거는 CLAUDE.md 와 docs/code-architecture.md 다. 규칙을 더할 때는
// 사람이 읽고 지키는 문장으로 남기지 말고 여기에 검사로 더한다.
//
// 종료 코드
//   0  error 등급 위반이 없다
//   1  error 등급 위반이 하나 이상 있다
//   2  저장소 root 나 필요한 파일을 찾지 못했다

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { enterRepoRoot } from "./lib.mjs";

const root = enterRepoRoot();
const asJson = process.argv.includes("--json");

for (const f of ["package.json", "src/index.ts", "tsup.config.ts"]) {
  if (!existsSync(join(root, f))) {
    console.error(`필요한 파일이 없다: ${f}`);
    process.exit(2);
  }
}

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const toPosix = (p) => relative(root, p).split(sep).join("/");
const srcFiles = walk(join(root, "src"))
  .filter((p) => p.endsWith(".ts"))
  .map((p) => ({ path: toPosix(p), text: readFileSync(p, "utf8") }));
const isTest = (p) => /\.test\.ts$/.test(p);
const prodFiles = srcFiles.filter((f) => !isTest(f.path));

function grepLines(files, re, { skip } = {}) {
  const hits = [];
  for (const f of files) {
    if (skip?.(f.path)) continue;
    f.text.split("\n").forEach((line, i) => {
      if (re.test(line)) hits.push({ at: `${f.path}:${i + 1}`, line: line.trim() });
    });
  }
  return hits;
}

const rules = [];
function rule(id, level, title, hits, hint) {
  rules.push({ id, level, title, count: hits.length, hits, hint });
}

// 1. 명령 안의 process.exit 는 전역 catch 를 건너뛰어 last-run 기록과 오류 형식이 빠진다.
rule(
  "process-exit",
  "error",
  "src/index.ts 밖의 process.exit",
  grepLines(prodFiles, /\bprocess\.exit\(/, { skip: (p) => p === "src/index.ts" }),
  "DoorayCliError(message, exitCode) 를 던진다",
);

// 2. 전역 fetch 는 ky 의 토큰 버킷, 재시도, 큰 정수 파서를 거치지 않는다.
rule(
  "raw-fetch",
  "warn",
  "ky 를 거치지 않는 전역 fetch",
  grepLines(prodFiles, /(^|[^.\w])fetch\(/),
  "요청 수 제한, 재시도, parseJsonPreservingLargeIntegers, timeout 을 같은 경로로 모은다",
);

// 3. 평범한 Error 는 전역 핸들러에서 종료 코드 1 이 되어 규약의 종료 코드를 잃는다.
rule(
  "plain-error",
  "warn",
  "throw new Error",
  grepLines(prodFiles, /throw new Error\(/),
  "사용자에게 닿는 오류면 DoorayCliError 로 바꾸고 종료 코드를 정한다",
);

// 4. 토큰이나 개인 정보가 든 파일은 소유자 전용 권한으로 쓴다.
const sensitiveWrites = [];
for (const f of prodFiles.filter((f) => /^src\/(config|cache)\//.test(f.path))) {
  const lines = f.text.split("\n");
  lines.forEach((line, i) => {
    if (!/\bwriteFile(Sync)?\(/.test(line)) return;
    const call = lines.slice(i, i + 4).join(" ");
    if (!/\bmode\s*:/.test(call)) sensitiveWrites.push({ at: `${f.path}:${i + 1}`, line: line.trim() });
  });
}
rule(
  "sensitive-write-mode",
  "error",
  "src/config, src/cache 의 mode 없는 writeFile",
  sensitiveWrites,
  "{ mode: 0o600 } 로 tmp 파일에 쓰고 rename 한다. mode 는 파일을 새로 만들 때만 적용된다",
);

// 5. 무거운 라이브러리를 정적으로 import 하면 그 명령을 쓰지 않아도 시작할 때마다 로드한다.
const HEAVY = ["imapflow", "nodemailer", "mailparser", "@inquirer/prompts"];
rule(
  "static-heavy-import",
  "warn",
  "무거운 라이브러리의 정적 import",
  grepLines(
    prodFiles,
    new RegExp(`^import (?!type )[^;]*from "(${HEAVY.map((h) => h.replace("/", "\\/")).join("|")})"`),
  ),
  "타입만 import type 으로 두고 실행 시점에 await import() 로 불러온다",
);

// 6. 지원한다고 선언한 Node 버전, CI 가 검증하는 버전, 빌드 target 이 같아야 한다.
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const enginesMin = /(\d+)/.exec(pkg.engines?.node ?? "")?.[1] ?? null;
const tsupTarget = /target:\s*["']node(\d+)["']/.exec(readFileSync(join(root, "tsup.config.ts"), "utf8"))?.[1] ?? null;
const ciVersions = new Set();
const wfDir = join(root, ".github", "workflows");
if (existsSync(wfDir)) {
  for (const f of readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f))) {
    const text = readFileSync(join(wfDir, f), "utf8");
    for (const m of text.matchAll(/NODE_VERSION:\s*["']?(\d+)/g)) ciVersions.add(m[1]);
    for (const m of text.matchAll(/node-version:\s*["']?(\d+)/g)) ciVersions.add(m[1]);
  }
}
const nodeHits = [];
if (enginesMin && tsupTarget && tsupTarget !== enginesMin) {
  nodeHits.push({ at: "tsup.config.ts", line: `target node${tsupTarget} ≠ engines.node 최소 ${enginesMin}` });
}
if (enginesMin && ciVersions.size > 0 && !ciVersions.has(enginesMin)) {
  nodeHits.push({ at: ".github/workflows", line: `CI 가 Node ${[...ciVersions].join(", ")} 만 검증한다. engines.node 최소 ${enginesMin} 은 검증하지 않는다` });
}
rule("node-version-alignment", "warn", "engines.node, CI, 빌드 target 불일치", nodeHits, "세 값을 맞추거나 CI 행렬에 최소 버전을 더한다");

// 7. .gitattributes 가 없으면 Windows Git 의 autocrlf 로 CRLF 체크아웃이 된다.
rule(
  "gitattributes",
  "warn",
  ".gitattributes 없음",
  existsSync(join(root, ".gitattributes")) ? [] : [{ at: ".gitattributes", line: "파일 없음" }],
  "* text=auto eol=lf",
);

// 8. 명령 파일에 붙은 테스트 비율. 추세만 본다.
const commandFiles = prodFiles.filter((f) => f.path.startsWith("src/commands/"));
const testSet = new Set(srcFiles.filter((f) => isTest(f.path)).map((f) => f.path));
const untested = commandFiles
  .filter((f) => !testSet.has(f.path.replace(/\.ts$/, ".test.ts")))
  .map((f) => ({ at: f.path, line: "" }));
rule(
  "command-tests",
  "info",
  `테스트 없는 명령 파일 (${commandFiles.length}개 중)`,
  untested,
  "입력 해석과 종료 코드는 표 기반 테스트로 여러 명령을 한 번에 검사한다",
);

// 9. 큰 파일. 추세만 본다.
const big = prodFiles
  .map((f) => ({ at: f.path, n: f.text.split("\n").length }))
  .filter((f) => f.n >= 400)
  .sort((a, b) => b.n - a.n)
  .map((f) => ({ at: f.at, line: `${f.n}줄` }));
rule("large-files", "info", "400줄 이상인 파일", big, "나누기 전에 반복 코드를 먼저 줄인다");

const errors = rules.filter((r) => r.level === "error" && r.count > 0);

if (asJson) {
  console.log(JSON.stringify({ rules }, null, 2));
} else {
  const lines = ["# 규약 검사", "", "| 규칙 | 등급 | 건수 | 대응 |", "| --- | --- | --- | --- |"];
  for (const r of rules) lines.push(`| ${r.title} (\`${r.id}\`) | ${r.level} | ${r.count} | ${r.count > 0 ? r.hint : ""} |`);
  for (const r of rules.filter((r) => r.count > 0 && r.level !== "info")) {
    lines.push("", `## ${r.id}`, "");
    for (const h of r.hits) lines.push(`- \`${h.at}\`${h.line ? ` ${h.line}` : ""}`);
  }
  const infos = rules.filter((r) => r.level === "info" && r.count > 0);
  for (const r of infos) {
    lines.push("", `## ${r.id} (${r.count}건)`, "");
    const shown = r.hits.slice(0, 15);
    for (const h of shown) lines.push(`- \`${h.at}\`${h.line ? ` ${h.line}` : ""}`);
    if (r.hits.length > shown.length) lines.push(`- 외 ${r.hits.length - shown.length}건. 전체는 --json`);
  }
  console.log(lines.join("\n"));
}

process.exit(errors.length > 0 ? 1 : 0);
