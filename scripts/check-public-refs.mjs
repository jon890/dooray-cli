#!/usr/bin/env node
// 공개 문서에 내부 추적 번호가 남았는지 검사한다.
//
// 이유: 공개 문서에 내부 ADR·이슈·task 번호가 나오면 외부 독자는 그 번호를 따라갈 수 없다.
// 사용자는 ADR 맥락을 모르고, 이 문서를 그대로 에이전트에 붙여 실행을 요청하기도 한다.
// 다시 쓰는 법: 괄호 참조(`(ADR-027)`)는 지우고, 문장에 녹은 참조는 번호를 빼고 다시 쓴다.
// "왜 이렇게 설계했는가" 는 docs/adr/ 에만 둔다. 검사 범위는 아래 TARGETS 가 소유한다.
// docs/ 의 내부 문서(CLAUDE.md, docs/adr 등)는 내부 참조를 그대로 둔다.
//
// 사용법: node scripts/check-public-refs.mjs   (cwd 는 저장소 루트)
// 위반을 stdout 으로 출력하고 종료 코드 1, 깨끗하면 0, 검사 경로 오류면 2.

import { access, readdir, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TARGETS = ["README.md", "CONTRIBUTING.md", "docs/guide/", "skills/"];
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "worktrees"]);
const INTERNAL_REF_PATTERN = /ADR-[0-9]+|Issue #[0-9]+|task [0-9]+/g;

export async function walkFiles(roots, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const skipDirs = options.skipDirs ?? SKIP_DIRS;
  const files = [];

  for (const root of roots) {
    const absoluteRoot = resolve(cwd, root);
    await access(absoluteRoot, constants.R_OK);
    await collectFiles(absoluteRoot, files, skipDirs);
  }

  return files.sort();
}

async function collectFiles(path, files, skipDirs) {
  const entryStat = await stat(path);

  if (entryStat.isDirectory()) {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory() && skipDirs.has(entry.name)) {
        continue;
      }
      await collectFiles(resolve(path, entry.name), files, skipDirs);
    }
    return;
  }

  if (entryStat.isFile()) {
    files.push(path);
  }
}

export function findInternalRefs(text) {
  return Array.from(text.matchAll(INTERNAL_REF_PATTERN), (match) => match[0]);
}

function collectLineMatches(text, filePath, cwd) {
  const lines = text.split(/\r?\n/);
  const hits = [];

  for (const [index, line] of lines.entries()) {
    if (findInternalRefs(line).length > 0) {
      hits.push(`${relativePath(filePath, cwd)}:${index + 1}:${line}`);
    }
  }

  return hits;
}

function relativePath(filePath, cwd) {
  return filePath.startsWith(`${cwd}/`) ? filePath.slice(cwd.length + 1) : filePath;
}

export async function main(options = {}) {
  const cwd = options.cwd ?? process.cwd();

  let files;
  try {
    files = await walkFiles(TARGETS, { cwd });
  } catch (error) {
    console.error(`공개 문서 내부 참조 검사 실패: 필수 검사 경로를 읽을 수 없다: ${error.message}`);
    return 2;
  }

  const hits = [];
  try {
    for (const file of files) {
      const text = await readFile(file, "utf8");
      hits.push(...collectLineMatches(text, file, cwd));
    }
  } catch (error) {
    console.error(`공개 문서 내부 참조 검사 실패: 파일을 읽을 수 없다: ${error.message}`);
    return 2;
  }

  if (hits.length > 0) {
    console.log("[위반] 공개 문서에 내부 추적 번호가 있다 — 번호를 빼고 문장을 다시 쓴다");
    console.log(hits.join("\n"));
    return 1;
  }

  console.log("공개 문서 내부 참조 검사 통과");
  return 0;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  process.exitCode = await main();
}
