#!/usr/bin/env node
// 의존성 갱신을 임시 워크트리에서 시험한다. 작업 중인 checkout 은 건드리지 않는다.
//
//   node .claude/skills/health-check/scripts/trial-update.mjs --range
//   node .claude/skills/health-check/scripts/trial-update.mjs --pkg imapflow@^2 --pkg nodemailer@^10
//   node .claude/skills/health-check/scripts/trial-update.mjs --range --dev-pkg vite@^8.3.0 --keep
//
// 옵션
//   --range         pnpm update 로 package.json 범위 안 최신까지 올린다
//   --pkg NAME@SPEC 그 패키지를 SPEC 으로 바꾼다. 여러 번 줄 수 있다.
//                   package.json 에서 devDependencies 에 있으면 -D 로 설치한다
//   --dev-pkg NAME@SPEC
//                   package.json 에 없는 패키지를 devDependencies 로 더한다.
//                   peer 로 자동 설치되어 옛 버전에 머무는 개발 도구를 직접 선언할 때 쓴다
//   --out DIR       로그와 patch 를 둘 디렉터리. 기본은 OS 임시 디렉터리 아래 새 디렉터리
//   --keep          끝난 뒤 임시 워크트리를 지우지 않는다
//
// HEAD 커밋에서 워크트리를 만든다. 커밋하지 않은 변경은 시험에 들어가지 않는다.
//
// 검사: pnpm tsc --noEmit, pnpm test, pnpm run build, pnpm audit.
// 로그는 검사마다 파일로 남긴다. 실패 원인을 tail 로 잘라 보면 어느 assertion 이 깨졌는지가 사라진다.
// 갱신 결과는 changes.patch 로 남긴다. 적용은 작업 브랜치에서 git apply 로 한다.
//
// 종료 코드
//   0  갱신과 검사가 모두 통과했다 (audit 은 결과만 보고하고 판정에 넣지 않는다)
//   1  갱신이나 검사 중 하나 이상 실패했다
//   2  인자가 잘못됐거나 워크트리를 만들지 못했다

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enterRepoRoot, parseJsonOrNull, run } from "./lib.mjs";

const argv = process.argv.slice(2);
const pkgs = [];
const devPkgs = [];
let range = false;
let keep = false;
let outDir = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--range") range = true;
  else if (a === "--keep") keep = true;
  else if (a === "--pkg") pkgs.push(argv[++i]);
  else if (a === "--dev-pkg") devPkgs.push(argv[++i]);
  else if (a === "--out") outDir = argv[++i];
  else {
    console.error(`알 수 없는 인자: ${a}`);
    process.exit(2);
  }
}
if (!range && pkgs.length === 0 && devPkgs.length === 0) {
  console.error("--range, --pkg, --dev-pkg 중 하나 이상을 준다.");
  process.exit(2);
}
if ([...pkgs, ...devPkgs].some((p) => !p || !/^(@[^/]+\/)?[^@]+@.+$/.test(p))) {
  console.error("--pkg 와 --dev-pkg 는 NAME@SPEC 형식이다. 예: --pkg imapflow@^2.0.5");
  process.exit(2);
}

const root = enterRepoRoot();
const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const devNames = new Set(Object.keys(rootPkg.devDependencies ?? {}));

outDir = outDir ?? mkdtempSync(join(tmpdir(), "health-check-"));
mkdirSync(outDir, { recursive: true });
const wt = join(outDir, "worktree");
if (existsSync(wt)) {
  console.error(`워크트리 경로가 이미 있다: ${wt}`);
  process.exit(2);
}

const add = run("git", ["worktree", "add", "--detach", wt, "HEAD"]);
if (add.status !== 0) {
  console.error(`워크트리를 만들지 못했다\n${add.stderr}`);
  process.exit(2);
}

const steps = [];
function step(name, cmd, args, { judge = true } = {}) {
  const r = run(cmd, args, { cwd: wt });
  const log = join(outDir, `${steps.length + 1}-${name.replace(/[^\w-]+/g, "_")}.log`);
  writeFileSync(log, `$ ${cmd} ${args.join(" ")}\n\n${r.stdout}\n${r.stderr}`);
  steps.push({ name, status: r.status, log, judge });
  return r;
}

let failed = false;
try {
  if (step("install", "pnpm", ["install", "--frozen-lockfile"]).status !== 0) failed = true;

  if (!failed && range && step("update-range", "pnpm", ["update"]).status !== 0) failed = true;

  const prod = pkgs.filter((p) => !devNames.has(p.slice(0, p.lastIndexOf("@"))));
  const dev = [...pkgs.filter((p) => devNames.has(p.slice(0, p.lastIndexOf("@")))), ...devPkgs];
  if (!failed && prod.length > 0 && step("add", "pnpm", ["add", ...prod]).status !== 0) failed = true;
  if (!failed && dev.length > 0 && step("add-dev", "pnpm", ["add", "-D", ...dev]).status !== 0) failed = true;

  if (!failed) {
    for (const [name, args] of [
      ["tsc", ["exec", "tsc", "--noEmit"]],
      ["test", ["test"]],
      ["build", ["run", "build"]],
    ]) {
      if (step(name, "pnpm", args).status !== 0) failed = true;
    }
  }

  const audit = step("audit", "pnpm", ["audit", "--json"], { judge: false });
  const vulns = parseJsonOrNull(audit.stdout)?.metadata?.vulnerabilities ?? null;

  const diff = run("git", ["diff", "--", "package.json", "pnpm-lock.yaml"], { cwd: wt });
  const patch = join(outDir, "changes.patch");
  writeFileSync(patch, diff.stdout);
  const pkgDiff = run("git", ["diff", "--", "package.json"], { cwd: wt }).stdout
    .split("\n")
    .filter((l) => /^[+-]\s+"/.test(l));

  const lines = ["# 갱신 시험", ""];
  lines.push(`- 대상: ${[range ? "범위 안 전체" : null, ...pkgs, ...devPkgs.map((p) => `${p} (dev)`)].filter(Boolean).join(", ")}`);
  lines.push(`- 로그와 patch: \`${outDir}\``);
  lines.push("");
  lines.push("| 단계 | 종료 코드 | 로그 |");
  lines.push("| --- | --- | --- |");
  for (const s of steps) {
    const mark = s.judge ? (s.status === 0 ? "통과" : "실패") : "보고만";
    lines.push(`| ${s.name} | ${s.status} (${mark}) | \`${s.log}\` |`);
  }
  lines.push("");
  if (vulns) {
    const v = Object.entries(vulns).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(", ");
    lines.push(`갱신 후 취약점: ${v || "없음"}`);
    lines.push("");
  }
  if (pkgDiff.length > 0) {
    lines.push("package.json 변경:");
    lines.push("");
    lines.push("```diff");
    lines.push(...pkgDiff);
    lines.push("```");
  }
  console.log(lines.join("\n"));
} finally {
  if (!keep) {
    const rm = run("git", ["worktree", "remove", "--force", wt]);
    if (rm.status !== 0) console.error(`임시 워크트리를 지우지 못했다: ${wt}\n${rm.stderr}`);
  } else {
    console.log(`\n임시 워크트리를 남겼다: ${wt}\n지울 때: git worktree remove --force "${wt}"`);
  }
}

process.exit(failed ? 1 : 0);
