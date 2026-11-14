#!/usr/bin/env node
/**
 * 빌드한 CLI 의 모든 명령 경로에서 `--help` 를 모아 한 텍스트로 낸다.
 * 코드 구조 정리 PR 이 사용자에게 보이는 명령·옵션을 바꾸지 않았는지 전후 스냅숏을 비교하는 데 쓴다 (ADR-082).
 *
 *   node scripts/help-snapshot.mjs [--bin dist/index.js] [--out <파일>]
 *   node scripts/help-snapshot.mjs [--bin dist/index.js] --check <기준 파일>
 *
 * `--check` 는 기준과 다르면 처음 어긋난 줄을 보이고 종료 코드 1 로 끝난다.
 * `--out` 과 `--check` 는 함께 줄 수 없다.
 * 설정과 캐시를 읽지 않도록 빈 임시 HOME 으로 실행하고 색을 끈다.
 * 줄 폭은 stdout 이 파이프라 Commander 기본 폭 80 으로 고정된다.
 * `node:` 빌트인만 쓴다 (ADR-048).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Commander 도움말의 「Commands:」 절에서 하위 명령 이름을 뽑는다. `help` 는 뺀다. */
export function parseSubcommands(helpText) {
  const lines = helpText.split("\n");
  const start = lines.findIndex((line) => line.trim() === "Commands:");
  if (start === -1) return [];
  const names = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "") break;
    // 설명이 다음 줄로 넘어간 줄은 명령 칸보다 깊게 들여 쓰여 있다.
    const match = /^ {2}(\S+)/.exec(line);
    if (!match) continue;
    const name = match[1].split("|")[0];
    if (name !== "help") names.push(name);
  }
  return names;
}

/** 명령 경로를 깊이 우선으로 돌며 `[경로, 도움말]` 목록을 만든다. */
export function collectHelp(runHelp, path = []) {
  const text = runHelp(path);
  const entries = [[path, text]];
  for (const name of parseSubcommands(text)) {
    entries.push(...collectHelp(runHelp, [...path, name]));
  }
  return entries;
}

export function renderSnapshot(entries) {
  return entries.map(([path, text]) => `===== dooray ${path.join(" ")}`.trimEnd() + `\n${text.trimEnd()}\n`).join("\n");
}

/** 두 스냅숏이 처음 어긋나는 줄 번호(1부터). 같으면 0 이다. */
export function firstDifference(expected, actual) {
  const a = expected.split("\n");
  const b = actual.split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return i + 1;
  }
  return 0;
}

export function parseArgs(argv) {
  const options = { bin: "dist/index.js" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--bin" || arg === "--out" || arg === "--check") {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} 에 값이 없다`);
      options[arg.slice(2)] = value;
    } else {
      throw new Error(`모르는 인자: ${arg}`);
    }
  }
  if (options.out !== undefined && options.check !== undefined) {
    throw new Error("--out 과 --check 는 함께 줄 수 없다");
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const bin = resolve(options.bin);
  const home = mkdtempSync(join(tmpdir(), "dooray-help-"));
  try {
    const env = { ...process.env, HOME: home, NO_COLOR: "1", FORCE_COLOR: "0" };
    delete env.XDG_DATA_HOME;
    const runHelp = (path) => execFileSync(process.execPath, [bin, ...path, "--help"], { env, encoding: "utf8" });
    const snapshot = renderSnapshot(collectHelp(runHelp));
    if (options.check !== undefined) {
      const expected = readFileSync(options.check, "utf8");
      const line = firstDifference(expected, snapshot);
      if (line === 0) {
        console.log(`같음: ${snapshot.split("\n===== ").length} 개 명령 경로`);
        return;
      }
      console.error(`다름: ${line} 번째 줄`);
      console.error(`  기준: ${expected.split("\n")[line - 1] ?? "(없음)"}`);
      console.error(`  지금: ${snapshot.split("\n")[line - 1] ?? "(없음)"}`);
      process.exitCode = 1;
      return;
    }
    if (options.out !== undefined) writeFileSync(options.out, snapshot);
    else process.stdout.write(snapshot);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
