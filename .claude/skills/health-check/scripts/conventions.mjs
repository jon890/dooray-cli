#!/usr/bin/env node
// dooray-cli 의 규약 가운데 정적으로 판정할 수 있는 것을 검사한다.
//
//   node .claude/skills/health-check/scripts/conventions.mjs [--json]
//   node --test .claude/skills/health-check/scripts/conventions.node-test.mjs
//
// 규칙마다 등급이 있다.
//   error  규약 위반이다. 하나라도 있으면 종료 코드 1
//   warn   고칠 후보다. 종료 코드에 넣지 않는다
//   info   추세를 보는 수치다. 종료 코드에 넣지 않는다
//
// 규칙의 근거는 CLAUDE.md 와 docs/code-architecture.md 다. 규칙을 더할 때는
// 사람이 읽고 지키는 문장으로 남기지 말고 여기에 검사와 대조 표본을 더한다.
//
// 종료 코드
//   0  error 등급 위반이 없다
//   1  error 등급 위반이 하나 이상 있다
//   2  저장소 root 나 필요한 파일을 찾지 못했거나 파일을 읽지 못했다

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { enterRepoRoot } from "./lib.mjs";

function main() {
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

  function uncommentedLines(text) {
    let inBlock = false;
    return text.split("\n").map((line) => {
      const trimmed = line.trimStart();
      if (inBlock) {
        if (trimmed.includes("*/")) inBlock = false;
        return null;
      }
      if (trimmed.startsWith("/*")) {
        if (!trimmed.includes("*/")) inBlock = true;
        return null;
      }
      return trimmed.startsWith("//") ? null : line;
    });
  }

  function grepLines(files, re, { skip, skipComments = false } = {}) {
    const hits = [];
    for (const f of files) {
      if (skip?.(f.path)) continue;
      const lines = skipComments ? uncommentedLines(f.text) : f.text.split("\n");
      lines.forEach((line, i) => {
        if (line !== null && re.test(line)) hits.push({ at: `${f.path}:${i + 1}`, line: line.trim() });
      });
    }
    return hits;
  }

  const rules = [];
  function rule(id, level, title, hits, hint) {
    rules.push({ id, level, title, count: hits.length, hits, hint });
  }

  rule(
    "process-exit",
    "error",
    "src/index.ts 밖의 process.exit",
    grepLines(prodFiles, /\bprocess\.exit\s*\(/, { skip: (p) => p === "src/index.ts", skipComments: true }),
    "DoorayCliError(message, exitCode) 를 던진다",
  );

  rule(
    "raw-fetch",
    "warn",
    "ky 를 거치지 않는 전역 fetch",
    grepLines(prodFiles, /(?:^|[^.\w])(?:globalThis\.)?fetch\s*\(/, { skipComments: true }),
    "요청 수 제한, 재시도, parseJsonPreservingLargeIntegers, timeout 을 같은 경로로 모은다",
  );

  rule(
    "plain-error",
    "warn",
    "throw Error",
    grepLines(prodFiles, /\bthrow\s+(?:new\s+)?Error\s*\(/, { skipComments: true }),
    "사용자에게 닿는 오류면 DoorayCliError 로 바꾸고 종료 코드를 정한다",
  );

  function callText(text, openParen) {
    let depth = 0;
    let quote = null;
    let escaped = false;
    for (let i = openParen; i < text.length; i++) {
      const ch = text[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (quote) {
        if (ch === "\\") escaped = true;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        continue;
      }
      if (ch === "(") depth++;
      else if (ch === ")" && --depth === 0) return text.slice(openParen, i + 1);
    }
    return text.slice(openParen);
  }

  const sensitiveWrites = [];
  const writeCall = /\b(?:writeFile(?:Sync)?|appendFile(?:Sync)?|createWriteStream)\s*\(/g;
  for (const f of prodFiles.filter((file) => /^src\/(config|cache)\//.test(file.path))) {
    for (const match of f.text.matchAll(writeCall)) {
      const openParen = match.index + match[0].lastIndexOf("(");
      const call = callText(f.text, openParen);
      if (!/\bmode\s*:/.test(call)) {
        const lineNumber = f.text.slice(0, match.index).split("\n").length;
        sensitiveWrites.push({ at: `${f.path}:${lineNumber}`, line: f.text.split("\n")[lineNumber - 1].trim() });
      }
    }
  }
  rule(
    "sensitive-write-mode",
    "error",
    "src/config, src/cache 의 mode 없는 파일 쓰기",
    sensitiveWrites,
    "{ mode: 0o600 } 로 tmp 파일에 쓰고 rename 한다. mode 는 파일을 새로 만들 때만 적용된다",
  );

  const HEAVY = ["imapflow", "nodemailer", "mailparser", "@inquirer/prompts"];
  const heavyImports = [];
  const staticImport = /^\s*(?:import\s+(?!type\b)(?:[^;]*?\sfrom\s*)?|export\s+(?!type\b)[^;]*?\sfrom\s*)["']([^"']+)["']/gm;
  for (const f of prodFiles) {
    for (const match of f.text.matchAll(staticImport)) {
      const source = match[1];
      if (!HEAVY.some((name) => source === name || source.startsWith(`${name}/`))) continue;
      const lineNumber = f.text.slice(0, match.index).split("\n").length;
      heavyImports.push({ at: `${f.path}:${lineNumber}`, line: match[0].trim().replace(/\s+/g, " ") });
    }
  }
  rule(
    "static-heavy-import",
    "warn",
    "무거운 라이브러리의 정적 import",
    heavyImports,
    "타입만 import type 으로 두고 실행 시점에 await import() 로 불러온다",
  );

  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const enginesMin = /(\d+)/.exec(pkg.engines?.node ?? "")?.[1] ?? null;
  const tsupText = readFileSync(join(root, "tsup.config.ts"), "utf8");
  const tsupTarget = /target\s*:\s*(?:\[\s*)?["']node(\d+)["']/.exec(tsupText)?.[1] ?? null;
  const ciVersions = new Set();
  const wfDir = join(root, ".github", "workflows");
  if (existsSync(wfDir)) {
    for (const f of readdirSync(wfDir).filter((name) => /\.ya?ml$/.test(name))) {
      const text = readFileSync(join(wfDir, f), "utf8");
      for (const line of text.split("\n")) {
        if (!/^\s*(?:NODE_VERSION|node-version)\s*:/.test(line)) continue;
        for (const m of line.matchAll(/\d+/g)) ciVersions.add(m[0]);
      }
    }
  }
  const nodeHits = [];
  if (!enginesMin) nodeHits.push({ at: "package.json", line: "engines.node 읽지 못함" });
  if (!tsupTarget) nodeHits.push({ at: "tsup.config.ts", line: "빌드 target 읽지 못함" });
  if (ciVersions.size === 0) nodeHits.push({ at: ".github/workflows", line: "CI Node 버전 읽지 못함" });
  if (enginesMin && tsupTarget && tsupTarget !== enginesMin) {
    nodeHits.push({ at: "tsup.config.ts", line: `target node${tsupTarget} ≠ engines.node 최소 ${enginesMin}` });
  }
  if (enginesMin && ciVersions.size > 0 && !ciVersions.has(enginesMin)) {
    nodeHits.push({ at: ".github/workflows", line: `CI 가 Node ${[...ciVersions].join(", ")} 만 검증한다. engines.node 최소 ${enginesMin} 은 검증하지 않는다` });
  }
  rule("node-version-alignment", "warn", "engines.node, CI, 빌드 target 불일치", nodeHits, "세 값을 맞추거나 CI 행렬에 최소 버전을 더한다");

  rule(
    "gitattributes",
    "warn",
    ".gitattributes 없음",
    existsSync(join(root, ".gitattributes")) ? [] : [{ at: ".gitattributes", line: "파일 없음" }],
    "* text=auto eol=lf",
  );

  const commandFiles = prodFiles.filter(
    (f) => f.path.startsWith("src/commands/") && basename(f.path) !== "index.ts",
  );
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
}

try {
  main();
} catch (error) {
  console.error(`규약 검사를 실행하지 못했다: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
