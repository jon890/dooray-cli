#!/usr/bin/env node
/**
 * 파일 이동과 import·문서 경로 수정을 분리한다 (ADR-082).
 * node scripts/move-paths.mjs <표.json> --step move|rewrite
 * 표는 src 기준 [{ "from": "utils/old.ts", "to": "body/new.ts" }] 이다.
 * move 는 짝 *.test.ts 도 git mv 하며 내용을 고치지 않는다.
 * rewrite 는 move 직후, 내용 수정 전에 같은 표로 실행한다.
 * 타입 선언 분할은 파일 이동이 아니므로 빈 표([])로 실행할 수 있다.
 */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DOC_TARGETS = ["docs", "CLAUDE.md", "README.md", "CONTRIBUTING.md", ".claude", "skills"];
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "worktrees"]);

function filesUnder(file, extension) {
  if (!existsSync(file) || lstatSync(file).isSymbolicLink()) return [];
  if (lstatSync(file).isFile()) return file.endsWith(extension) ? [file] : [];
  return readdirSync(file).sort().flatMap((name) => SKIP_DIRS.has(name) ? [] : filesUnder(join(file, name), extension));
}

function sourcePath(value) {
  if (typeof value !== "string" || !/^[\w./-]+\.ts$/.test(value) || value.startsWith("/") || value.startsWith("src/") || value.split("/").some((part) => part === ".." || part === "." || part === "")) {
    throw new Error(`src 기준 .ts 파일 경로가 아니다: ${value}`);
  }
  return value;
}

/** 짝 테스트는 move 전·후 어느 자리에서든 찾아 같은 표를 복원한다. */
export function expandMoves(root, table) {
  if (!Array.isArray(table)) throw new Error("이동 표는 { from, to } 배열이어야 한다");
  const moves = table.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("이동 표 원소는 { from, to } 여야 한다");
    return { from: sourcePath(entry.from), to: sourcePath(entry.to) };
  });
  for (const { from, to } of [...moves]) {
    if (from.endsWith(".test.ts")) continue;
    const testFrom = from.replace(/\.ts$/, ".test.ts");
    const testTo = to.replace(/\.ts$/, ".test.ts");
    if (existsSync(join(root, "src", testFrom)) || existsSync(join(root, "src", testTo))) {
      if (!moves.some((entry) => entry.from === testFrom && entry.to === testTo)) moves.push({ from: testFrom, to: testTo });
    }
  }
  const froms = new Set();
  const tos = new Set();
  for (const { from, to } of moves) {
    if (froms.has(from) || tos.has(to) || from === to) throw new Error(`중복되거나 같은 이동 경로: ${from} -> ${to}`);
    froms.add(from); tos.add(to);
    for (const file of [from, to]) {
      // src 와 하위 폴더의 symlink 를 따라 저장소 밖으로 쓰지 않는다.
      let candidate = join(root, "src");
      for (const part of ["", ...file.split("/")]) {
        candidate = join(candidate, part);
        if (existsSync(candidate) && lstatSync(candidate).isSymbolicLink()) throw new Error(`심볼릭 링크 경로는 이동할 수 없다: ${file}`);
      }
    }
  }
  if ([...tos].some((to) => froms.has(to))) throw new Error("서로 겹치는 출발·도착 경로는 나눠 실행한다");
  return moves;
}

/** 주석과 문자열 안의 import 예시를 실제 코드와 구분하기 위한 토큰이다. */
function tokensOf(source) {
  const tokens = [];
  const pattern = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|[A-Za-z_$][\w$]*|[^\s]/g;
  for (const match of source.matchAll(pattern)) {
    const value = match[0];
    if (value.startsWith("//") || value.startsWith("/*") || value.startsWith("`")) continue;
    tokens.push({ value, start: match.index, end: match.index + value.length, string: value[0] === '"' || value[0] === "'" });
  }
  return tokens;
}

function moduleStrings(source) {
  const tokens = tokensOf(source);
  const found = new Set();
  const add = (token) => { if (token?.string) found.add(token); };
  for (let i = 0; i < tokens.length; i++) {
    const value = tokens[i].value;
    if ((value === "import" || value === "export") && tokens[i - 1]?.value !== ".") {
      const next = tokens[i + 1];
      if (value === "import" && next?.string) add(next);
      else if (value === "import" && next?.value === "(") add(tokens[i + 2]);
      else if (value === "import" || next?.value === "{" || next?.value === "*" || (next?.value === "type" && ["{", "*"].includes(tokens[i + 2]?.value))) {
        for (let j = i + 1; j < tokens.length && tokens[j].value !== ";"; j++) {
          if (tokens[j].value === "from" && tokens[j + 1]?.string) { add(tokens[j + 1]); break; }
        }
      }
    }
    if (value === "vi" && tokens[i + 1]?.value === "." && ["mock", "doMock", "importActual"].includes(tokens[i + 2]?.value)) {
      let j = i + 3;
      if (tokens[j]?.value === "<") {
        let depth = 0;
        do {
          if (tokens[j].value === "<") depth++;
          if (tokens[j].value === ">") depth--;
          j++;
        } while (j < tokens.length && depth > 0);
      }
      if (tokens[j]?.value === "(") add(tokens[j + 1]);
    }
  }
  return [...found].sort((a, b) => b.start - a.start);
}

function resolveImport(root, from, spec, forward) {
  if (!spec.startsWith(".") && !spec.startsWith("@/")) return undefined;
  const candidate = spec.startsWith("@/") ? spec.slice(2) : posix.normalize(posix.join(posix.dirname(from), spec));
  const choices = [candidate.replace(/\.js$/, ".ts"), candidate, `${candidate}.ts`, `${candidate}/index.ts`];
  return choices.find((file) => forward.has(file) || existsSync(join(root, "src", file)));
}

export function rewriteSource(root, source, currentFile, moves) {
  const forward = new Map(moves.map(({ from, to }) => [from, to]));
  const originalFile = moves.find(({ to }) => to === currentFile)?.from ?? currentFile;
  for (const token of moduleStrings(source)) {
    const spec = token.value.slice(1, -1);
    const target = resolveImport(root, originalFile, spec, forward);
    if (!target) continue;
    if (!forward.has(target) && !(originalFile !== currentFile && spec.startsWith("."))) continue;
    const destination = forward.get(target) ?? target;
    const next = posix.dirname(currentFile) === posix.dirname(destination)
      ? `./${posix.basename(destination).replace(/\.ts$/, ".js")}`
      : `@/${destination.replace(/\.ts$/, ".js")}`;
    source = source.slice(0, token.start + 1) + next + source.slice(token.end - 1);
  }
  return source;
}

function rewriteDoc(source, moves) {
  return source.replace(/(?<![\w./-])src\/[\w./-]*/g, (match) => {
    const suffix = match.match(/[.,]+$/)?.[0] ?? "";
    const file = match.slice(4, suffix ? -suffix.length : undefined);
    for (const { from, to } of moves) {
      if (file === from) return `src/${to}${suffix}`;
      if (file === from.replace(/\.ts$/, ".js")) return `src/${to.replace(/\.ts$/, ".js")}${suffix}`;
      if (file === from.replace(/\.ts$/, "")) return `src/${to.replace(/\.ts$/, "")}${suffix}`;
    }
    return match;
  });
}

export function runMoves(root, table, step) {
  if (!["move", "rewrite"].includes(step)) throw new Error("--step move|rewrite 를 지정한다");
  const moves = expandMoves(root, table);
  if (step === "move") {
    const tracked = new Set(execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" }).split("\0"));
    for (const { from, to } of moves) {
      if (!tracked.has(`src/${from}`) || !existsSync(join(root, "src", from))) throw new Error(`git 추적 파일이 없다: ${from}`);
      if (existsSync(join(root, "src", to))) throw new Error(`도착 파일이 이미 있다: ${to}`);
    }
    for (const { from, to } of moves) {
      mkdirSync(dirname(join(root, "src", to)), { recursive: true });
      execFileSync("git", ["-C", root, "mv", "--", `src/${from}`, `src/${to}`]);
    }
    return;
  }
  for (const { from, to } of moves) {
    if (existsSync(join(root, "src", from)) || !existsSync(join(root, "src", to))) throw new Error(`먼저 move 단계를 실행한다: ${from} -> ${to}`);
  }
  const updates = [];
  for (const file of filesUnder(join(root, "src"), ".ts")) {
    const source = readFileSync(file, "utf8");
    const current = file.slice(join(root, "src").length + 1).split("\\").join("/");
    const next = rewriteSource(root, source, current, moves);
    if (next !== source) updates.push([file, next]);
  }
  for (const file of [...new Set(DOC_TARGETS.flatMap((target) => filesUnder(join(root, target), ".md")))]) {
    const source = readFileSync(file, "utf8");
    const next = rewriteDoc(source, moves);
    if (next !== source) updates.push([file, next]);
  }
  for (const [file, content] of updates) writeFileSync(file, content);
}

function main() {
  const [table, flag, step, ...extra] = process.argv.slice(2);
  if (!table || flag !== "--step" || extra.length || !["move", "rewrite"].includes(step)) throw new Error("사용법: node scripts/move-paths.mjs <표.json> --step move|rewrite");
  runMoves(process.cwd(), JSON.parse(readFileSync(table, "utf8")), step);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
