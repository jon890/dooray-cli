#!/usr/bin/env node
// 개인 식별 정보와 사내 식별자가 git 추적 파일에 들어갔는지 검사한다.
//
// 정책과 대체 표기는 CLAUDE.md "개인 식별 정보 / 사내 식별자 노출 금지" 가 소유한다.
// 이 스크립트는 그 정책의 실행 경로다 — 화이트리스트는 여기가 단일 소스다.
//
// 사용법: node scripts/check-pii.mjs   (cwd 는 저장소 루트)
// 위반을 stdout 으로 출력하고 종료 코드 1, 깨끗하면 0, 검사 경로 오류면 2.
//
// 셸 배열 확장 차이로 검사 범위가 조용히 줄어든 적이 있어 Node 스크립트로 옮겼다.

import { access, readdir, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SCAN = ["README.md", "skills/", "docs/", "CLAUDE.md", ".claude/", ".github/", "scripts/", "tasks/", "src/"];

// 공개 도메인. 이 목록 밖의 도메인은 사내 도메인일 수 있다고 본다.
export const OK_DOMAINS = [
  "anthropic.com",
  "api.dooray.co.kr",
  "api.dooray.com",
  "api.gov-dooray.co.kr",
  "api.gov-dooray.com",
  "b.example.com",
  "claude.com",
  "cli.github.com",
  "dooray.com",
  "example.com",
  "example.dooray.com",
  "github.com",
  "helpdesk.dooray.com",
  "my-org.dooray.com",
  "other.example.com",
  "www.anthropic.com",
  "www.npmjs.com",
  "www.youtube.com",
  "x.com",
  "x.dooray.com",
  "y.example.com",
];

// 문서에 써도 되는 dummy ID 와 공개 helpdesk 페이지 ID.
export const OK_IDS = [
  "1234567890123456789",
  "9876543210987654321",
  "2939987647631384419",
  "1111222233334444555",
  "2222333344445555666",
  "3333444455556666777",
  "4444555566667777888",
  "9999888877776666555",
  "9999999999999999999",
  "1111111111111111111",
  "2222222222222222222",
  "123456789012345",
];

// CLI 예시의 project 자리에 와도 되는 값.
// 앞 셋은 가상 예시이고, 뒤 셋은 명령 패턴이 잘못 잡아내는 단어다.
// `<project>` 같은 placeholder 는 아래 정규식이 `<` 로 시작하는 값을 보지 않아 애초에 안 잡힌다.
export const OK_PROJECTS = ["my-project", "testproj", "NONEXIST", "body", "https", "meta"];

export const SUBCOMMANDS = ["create", "group", "list", "edit", "delete", "add", "update"];

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "worktrees"]);
const DOMAIN_PATTERN = /(https?:\/\/|@)([A-Za-z0-9.-]+\.(?:com|co\.kr|net)[A-Za-z0-9.-]*)/g;
const LONG_ID_PATTERN = /[0-9]{15,}/g;
const PROJECT_PATTERN = /(?:post (?:create|list|get|search)|project (?:list|members|groups|tags|templates|workflows)|wiki (?:pages|tree)) ([A-Za-z][A-Za-z0-9_-]{2,})/g;

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

export function findForeignDomains(text, okDomains) {
  const allowed = new Set(okDomains);
  const matches = [];

  // https:// 또는 @ 접두를 요구해 코드의 property 접근(.com/.net)을 배제한다.
  //
  // 화이트리스트는 호스트 경계에 앵커한다. 앵커가 없으면 `dooray.com` 이
  // `evil-dooray.com` 안에서도 매치되어 typosquat 이 그대로 통과한다.
  for (const match of text.matchAll(DOMAIN_PATTERN)) {
    const host = match[2];
    if (!allowed.has(host)) {
      matches.push(match[0]);
    }
  }

  return matches;
}

export function findLongIds(text, okIds) {
  const allowed = new Set(okIds);
  const matches = [];

  // `-o` 처럼 매치 단위로 뽑는다. 줄 단위로 거르면 허용 ID 와 실제 ID 가
  // 한 줄에 같이 있을 때 그 줄 전체가 걸러져 실제 ID 가 빠져나간다.
  for (const match of text.matchAll(LONG_ID_PATTERN)) {
    if (!allowed.has(match[0])) {
      matches.push(match[0]);
    }
  }

  return matches;
}

export function findUnknownProjects(text, okProjects, subcommands) {
  const allowed = new Set([...okProjects, ...subcommands]);
  const projects = new Set();

  // 프로젝트 코드는 임의 문자열이라 패턴으로 못 거른다. 허용 목록 밖이면 사람이 확인한다.
  // project 자리에 하위 명령 이름이 오는 형태(`project tags create <project>`)는 검출에서 뺀다.
  // 같은 이름의 프로젝트를 놓치지만, 하위 명령이 늘 때마다 오탐이 나는 편이 나쁘다.
  for (const match of text.matchAll(PROJECT_PATTERN)) {
    const project = match[1];
    if (!allowed.has(project)) {
      projects.add(project);
    }
  }

  return Array.from(projects).sort();
}

function collectLineMatches(text, filePath, cwd, finder) {
  const lines = text.split(/\r?\n/);
  const hits = [];

  for (const [index, line] of lines.entries()) {
    for (const match of finder(line)) {
      hits.push(`${relativePath(filePath, cwd)}:${index + 1}:${match}`);
    }
  }

  return hits;
}

function relativePath(filePath, cwd) {
  return filePath.startsWith(`${cwd}/`) ? filePath.slice(cwd.length + 1) : filePath;
}

function report(failures, message, matches) {
  if (matches.length === 0) {
    return;
  }

  failures.push(`\n[위반] ${message}\n${matches.join("\n")}`);
}

export async function main(options = {}) {
  const cwd = options.cwd ?? process.cwd();

  let files;
  try {
    files = await walkFiles(SCAN, { cwd });
  } catch (error) {
    console.error(`개인 식별 정보 검사 실패: 필수 검사 경로를 읽을 수 없다: ${error.message}`);
    return 2;
  }

  const domainMatches = [];
  const idMatches = [];
  // 도메인·ID 검사와 같은 `파일:줄:매치` 형태로 낸다.
  // 전체 텍스트를 이어 붙이면 어느 파일 어느 줄인지가 사라진다.
  const projectMatches = [];
  try {
    for (const file of files) {
      const text = await readFile(file, "utf8");
      domainMatches.push(
        ...collectLineMatches(text, file, cwd, (line) => findForeignDomains(line, OK_DOMAINS)),
      );
      idMatches.push(...collectLineMatches(text, file, cwd, (line) => findLongIds(line, OK_IDS)));
      projectMatches.push(
        ...collectLineMatches(text, file, cwd, (line) =>
          findUnknownProjects(line, OK_PROJECTS, SUBCOMMANDS),
        ),
      );
    }
  } catch (error) {
    console.error(`개인 식별 정보 검사 실패: 파일을 읽을 수 없다: ${error.message}`);
    return 2;
  }

  const failures = [];

  report(
    failures,
    "화이트리스트 밖 도메인 — placeholder 로 바꾸거나 이 스크립트의 OK_DOMAINS 를 검토한다",
    domainMatches,
  );
  report(failures, "허용 목록 밖의 긴 숫자 — 실제 ID 인지 확인하고 placeholder 나 dummy 로 바꾼다", idMatches);
  report(
    failures,
    "예시에 쓰인 낯선 project 값 — 사내 코드면 placeholder 로 바꾸고, 가상 예시면 이 스크립트의 OK_PROJECTS 에 추가한다",
    projectMatches,
  );

  if (failures.length > 0) {
    console.log(failures.join("\n"));
    return 1;
  }

  console.log("개인 식별 정보 검사 통과");
  return 0;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  process.exitCode = await main();
}
