#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const METHOD_NAMES = ["get", "post", "put", "delete", "patch"];

/**
 * `${...}` 를 `{id}` 로 바꾼다. 중괄호가 중첩된 표현식도 하나로 센다.
 */
function replaceInterpolations(raw) {
  let out = "";
  let i = 0;

  while (i < raw.length) {
    if (raw[i] === "$" && raw[i + 1] === "{") {
      let depth = 1;
      i += 2;
      while (i < raw.length && depth > 0) {
        if (raw[i] === "{") depth += 1;
        else if (raw[i] === "}") depth -= 1;
        i += 1;
      }
      out += "{id}";
      continue;
    }
    out += raw[i];
    i += 1;
  }

  return out;
}

/**
 * placeholder 이름과 쿼리 문자열, 앞뒤의 `/` 를 떼어 대조할 수 있는 형태로 만든다.
 *
 * 뒤 `/` 를 떼는 이유가 있다. 공식 문서가 같은 경로를 슬래시 유무로 두 번 싣는 경우가 있어,
 * 그대로 두면 한쪽만 매칭되고 다른 쪽이 미구현 목록에 남는다.
 */
function normalizePath(path) {
  return path
    .replace(/\?.*$/, "")
    .replace(/\{[^}]*\}/g, "{id}")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

/**
 * `source` 의 `start` 위치부터 첫 문자열 리터럴 인자 하나를 읽는다.
 * 평문(따옴표)과 템플릿 리터럴(백틱) 두 형태를 각각 처리한다.
 * 리터럴이 아니면 `null` 을 낸다.
 */
function readFirstStringArgument(source, start) {
  let i = start;
  while (i < source.length && /\s/.test(source[i])) i += 1;

  const quote = source[i];
  if (quote !== '"' && quote !== "'" && quote !== "`") return null;

  i += 1;
  let raw = "";
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\") {
      raw += source[i + 1] ?? "";
      i += 2;
      continue;
    }
    if (ch === quote) break;
    if (quote === "`" && ch === "$" && source[i + 1] === "{") {
      let depth = 1;
      raw += "${";
      i += 2;
      while (i < source.length && depth > 0) {
        if (source[i] === "{") depth += 1;
        else if (source[i] === "}") depth -= 1;
        raw += source[i];
        i += 1;
      }
      continue;
    }
    raw += ch;
    i += 1;
  }

  return quote === "`" ? replaceInterpolations(raw) : raw;
}

/**
 * `src/api/client.ts` 소스에서 호출하는 endpoint 를 뽑는다.
 * 두 자리를 본다.
 *
 * - `this.api` 뒤에 줄바꿈을 건너 나오는 첫 메서드 호출의 첫 인자
 * - `${this.baseUrl}` 로 시작하는 템플릿 리터럴 경로와 그 뒤 raw `fetch` 의 `method`
 *
 * 경로를 변수나 함수 호출로 만든 호출은 읽을 수 없다. 그 수를 함께 낸다.
 * 감사에 구멍이 있다는 것을 부르는 쪽이 알아야 한다.
 *
 * @returns {{ endpoints: string[], nonLiteral: number }}
 */
export function extractImplEndpoints(source) {
  const found = new Set();
  let nonLiteral = 0;

  const kyCall = new RegExp(String.raw`this\.api\s*\.\s*(${METHOD_NAMES.join("|")})\s*\(`, "g");
  for (const match of source.matchAll(kyCall)) {
    const path = readFirstStringArgument(source, match.index + match[0].length);
    // 변수나 함수 호출로 경로를 만든 호출은 읽을 수 없다. 조용히 빠지지 않게 센다.
    if (path == null) {
      nonLiteral += 1;
      continue;
    }
    found.add(`${match[1].toUpperCase()} ${normalizePath(path)}`);
  }

  const rawFetchUrl = /`\$\{this\.baseUrl\}([^`]*)`/g;
  for (const match of source.matchAll(rawFetchUrl)) {
    const after = match.index + match[0].length;

    // 탐색 범위를 다음 raw fetch URL 이 나오기 전까지로 자른다.
    // 고정 길이로 자르면 재시도 경로처럼 raw fetch 가 나란히 있을 때
    // 인접 블록의 method 를 집어와 조용히 오분류한다.
    rawFetchUrl.lastIndex = after;
    const next = rawFetchUrl.exec(source);
    rawFetchUrl.lastIndex = after;
    const end = next == null ? source.length : next.index;

    const tail = source.slice(after, end);
    const method = /\bmethod\s*:\s*["'`]([A-Za-z]+)["'`]/.exec(tail);
    if (method == null) continue;
    const path = replaceInterpolations(match[1]);
    found.add(`${method[1].toUpperCase()} ${normalizePath(path)}`);
  }

  return { endpoints: [...found].sort(), nonLiteral };
}

/**
 * 공식 목록 스냅샷 본문을 파싱한다. `#` 로 시작하는 줄과 빈 줄은 건너뛴다.
 *
 * @returns {string[]} `"<METHOD> <경로>"` 형태의 고유 목록
 */
export function parseOfficialEndpoints(content) {
  const found = new Set();

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const match = /^([A-Z]+)\s+(\S+)$/.exec(trimmed);
    if (match == null) continue;
    found.add(`${match[1]} ${normalizePath(match[2])}`);
  }

  return [...found].sort();
}

/**
 * 구현 목록과 공식 목록을 대조한다.
 */
export function compareEndpoints(implEndpoints, officialEndpoints) {
  const impl = new Set(implEndpoints);
  const official = new Set(officialEndpoints);

  return {
    matched: [...impl].filter((entry) => official.has(entry)).length,
    missingInImpl: [...official].filter((entry) => !impl.has(entry)).sort(),
    missingInOfficial: [...impl].filter((entry) => !official.has(entry)).sort(),
  };
}

function areaOf(entry) {
  const path = entry.split(" ")[1] ?? "";
  return path.split("/")[0] || "(기타)";
}

function printHuman(result, implCount, officialCount) {
  console.log(`구현 endpoint: ${implCount}건`);
  console.log(`공식 endpoint: ${officialCount}건`);
  console.log(`양쪽에 있는 것: ${result.matched}건`);
  console.log("");

  console.log(`공식에 있고 구현에 없는 것: ${result.missingInImpl.length}건`);
  const byArea = new Map();
  for (const entry of result.missingInImpl) {
    const area = areaOf(entry);
    if (!byArea.has(area)) byArea.set(area, []);
    byArea.get(area).push(entry);
  }
  for (const area of [...byArea.keys()].sort()) {
    console.log(`  [${area}]`);
    for (const entry of byArea.get(area)) console.log(`    ${entry}`);
  }
  console.log("");

  console.log(`구현에 있고 공식에 없는 것: ${result.missingInOfficial.length}건`);
  console.log("  비공식 endpoint 를 쓰고 있다는 뜻이거나, 스냅샷이 낡았다는 뜻이다.");
  for (const entry of result.missingInOfficial) console.log(`    ${entry}`);
}

function main(argv) {
  const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
  const implSource = readFileSync(join(repoRoot, "src/api/client.ts"), "utf8");
  const officialContent = readFileSync(join(repoRoot, "docs/api/official-endpoints.txt"), "utf8");

  const { endpoints: implEndpoints, nonLiteral } = extractImplEndpoints(implSource);
  const officialEndpoints = parseOfficialEndpoints(officialContent);
  const result = compareEndpoints(implEndpoints, officialEndpoints);

  if (argv.includes("--json")) {
    console.log(JSON.stringify({ ...result, nonLiteral }, null, 2));
  } else {
    printHuman(result, implEndpoints.length, officialEndpoints.length);
    // 감사에 구멍이 있다는 것을 알린다. 경로를 변수나 함수 호출로 만든 호출은 읽을 수 없다.
    if (nonLiteral > 0) {
      console.warn(`\n주의: 경로가 리터럴이 아닌 호출 ${nonLiteral}건은 감사 대상에서 제외됐다.`);
      console.warn("그 호출의 endpoint 는 이 대조에 나타나지 않는다.");
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
