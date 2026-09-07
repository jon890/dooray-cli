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
 * placeholder 이름과 쿼리 문자열, 앞의 `/` 를 떼어 대조할 수 있는 형태로 만든다.
 */
function normalizePath(path) {
  return path
    .replace(/\?.*$/, "")
    .replace(/\{[^}]*\}/g, "{id}")
    .replace(/^\/+/, "");
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
 * @returns {string[]} `"<METHOD> <경로>"` 형태의 고유 목록
 */
export function extractImplEndpoints(source) {
  const found = new Set();

  const kyCall = new RegExp(String.raw`this\.api\s*\.\s*(${METHOD_NAMES.join("|")})\s*\(`, "g");
  for (const match of source.matchAll(kyCall)) {
    const path = readFirstStringArgument(source, match.index + match[0].length);
    if (path == null) continue;
    found.add(`${match[1].toUpperCase()} ${normalizePath(path)}`);
  }

  const rawFetchUrl = /`\$\{this\.baseUrl\}([^`]*)`/g;
  for (const match of source.matchAll(rawFetchUrl)) {
    const tail = source.slice(match.index + match[0].length, match.index + match[0].length + 500);
    const method = /\bmethod\s*:\s*["'`]([A-Za-z]+)["'`]/.exec(tail);
    if (method == null) continue;
    const path = replaceInterpolations(match[1]);
    found.add(`${method[1].toUpperCase()} ${normalizePath(path)}`);
  }

  return [...found].sort();
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

  const implEndpoints = extractImplEndpoints(implSource);
  const officialEndpoints = parseOfficialEndpoints(officialContent);
  const result = compareEndpoints(implEndpoints, officialEndpoints);

  if (argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result, implEndpoints.length, officialEndpoints.length);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
