#!/usr/bin/env node
/**
 * 문서와 ADR 에 적힌 `src/…` 경로가 지금 있는 파일이나 폴더를 가리키는지 본다 (ADR-082).
 * 코드 구조 정리에서 파일을 옮기면 옛 문서의 경로가 낡는다. 그것을 찾는 검사다.
 *
 *   node scripts/check-doc-paths.mjs            # 낡은 경로를 보고하고 종료 코드 0
 *   node scripts/check-doc-paths.mjs --strict   # 낡은 경로가 있으면 종료 코드 1
 *
 * 경로는 `src/` 로 시작하고 경로 문자(영문·숫자·`_` `.` `-` `/`)가 이어지는 부분이다.
 * `<영역>` 이나 `{a,b}` 처럼 자리표시가 시작되면 그 앞까지만 본다. `*` 가 든 glob 은 건너뛴다.
 * `.js` 로 적힌 경로는 같은 이름의 `.ts` 도 찾는다. 확장자가 없으면 `.ts` 를 붙여 본다.
 * `node:` 빌트인만 쓴다 (ADR-048).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const TARGETS = ["docs", "CLAUDE.md", "README.md", "CONTRIBUTING.md", ".claude", "skills"];
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "worktrees"]);
const PATH_PATTERN = /(?<![\w./-])src\/[\w./-]*/g;

export function extractSrcPaths(line) {
  const paths = [];
  for (const match of line.matchAll(PATH_PATTERN)) {
    const rest = line.slice(match.index + match[0].length);
    if (rest.startsWith("*")) continue;
    // 문장 끝의 마침표와 쉼표는 경로가 아니다.
    const path = match[0].replace(/[.,]+$/, "");
    if (path === "src" || path === "src/") continue;
    paths.push(path);
  }
  return paths;
}

export function pathExists(root, path) {
  const candidates = [path];
  if (path.endsWith(".js")) candidates.push(path.replace(/\.js$/, ".ts"));
  if (!/\.[a-z]+$/.test(path) && !path.endsWith("/")) candidates.push(`${path}.ts`);
  return candidates.some((candidate) => existsSync(join(root, candidate)));
}

function collectMarkdown(path, out) {
  if (!existsSync(path)) return;
  const stat = statSync(path);
  if (stat.isFile()) {
    if (path.endsWith(".md")) out.push(path);
    return;
  }
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    collectMarkdown(join(path, entry.name), out);
  }
}

/** 낡은 경로 목록. 원소는 `{ file, line, path }` 이고 file 은 root 기준이다. */
export function findStalePaths(root) {
  const files = [];
  for (const target of TARGETS) collectMarkdown(join(root, target), files);
  const stale = [];
  for (const file of files.sort()) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((text, index) => {
      for (const path of extractSrcPaths(text)) {
        if (!pathExists(root, path)) stale.push({ file: relative(root, file).split(sep).join("/"), line: index + 1, path });
      }
    });
  }
  return stale;
}

function main() {
  const strict = process.argv.includes("--strict");
  const stale = findStalePaths(process.cwd());
  for (const item of stale) console.log(`${item.file}:${item.line}: ${item.path}`);
  const files = new Set(stale.map((item) => item.file)).size;
  console.error(stale.length === 0 ? "낡은 src 경로 없음" : `낡은 src 경로 ${stale.length}건 (문서 ${files}개)`);
  if (strict && stale.length > 0) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
