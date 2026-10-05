/**
 * `post replace` 와 `wiki page replace` 의 `--dry-run` 출력.
 *
 * 바뀌는 줄만 diff 형식으로 보인다. 본문 전체는 내지 않고, 긴 줄은 바뀐 곳 주변만 남긴다 (ADR-065).
 */
import type { ReplaceHunk, ReplaceResult } from "../utils/body-replace.js";
import { sanitizeMultilineForTerminal } from "../utils/sanitize.js";
import { printJson, type OutputOptions } from "./table.js";

/**
 * 미리보기에서 CR 을 보일 표기. 원문의 `?` 나 본문에 글자 그대로 적힌 `\r` 과
 * 헷갈리지 않게 하고, 터미널 폰트에 따라 깨지는 유니코드 기호는 피해 ASCII 로 둔다.
 */
export const CR_MARKER = "<CR>";

function sanitizePreview(text: string): string {
  // 정확 일치 명령이라 사용자가 미리보기를 복사해 다음 --old 를 만든다. 탭을 `?` 로 바꾸면 그 복사본이
  // 일치하지 않으므로 탭은 그대로 두고, CR 은 보이는 표기로 남긴다.
  return sanitizeMultilineForTerminal(text, { keepTab: true, crMarker: CR_MARKER });
}

/** 긴 줄을 줄일 때 바뀐 곳 앞뒤로 남기는 글자 수. */
const CONTEXT = 80;

/**
 * 생략 표기. CR_MARKER 와 같은 이유로 유니코드 말줄임표 대신 ASCII 로 둔다.
 */
const ELLIPSIS = "...";

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

function commonSuffixLength(a: string, b: string, limit: number): number {
  let i = 0;
  while (i < limit && a.charCodeAt(a.length - 1 - i) === b.charCodeAt(b.length - 1 - i)) i++;
  return i;
}

/**
 * 줄바꿈 없는 긴 본문이면 hunk 가 본문 전체라 미리보기가 본문을 두 번 낸다.
 * before 와 after 의 공통 접두·접미 가운데 바뀐 곳과 같은 줄에 있는 부분만,
 * 바뀐 곳 앞뒤 CONTEXT 자를 남기고 `...` 로 줄인다.
 *
 * - 줄을 넘어 자르지 않으므로 줄 수와 `N번째 줄` 표기는 그대로다
 * - 공통 부분이라 before 와 after 에 같은 잘림을 적용한다
 * - 두 변경 사이(공통 접두·접미 바깥)는 자르지 않는다
 * - 서로게이트 쌍 가운데를 자르지 않는다
 *
 * `--json` 의 hunks 는 줄이지 않는다. 표시용 규칙이다 (ADR-065).
 */
export function abbreviateHunk(h: ReplaceHunk): { before: string; after: string } {
  const { before, after } = h;
  const prefixLen = commonPrefixLength(before, after);
  const suffixLen = commonSuffixLength(before, after, Math.min(before.length, after.length) - prefixLen);

  // 접두에서 첫 변경이 있는 줄의 앞머리만 줄인다.
  let headCut = 0;
  const lineHead = before.lastIndexOf("\n", prefixLen - 1) + 1;
  if (prefixLen - lineHead > CONTEXT * 2) {
    headCut = prefixLen - CONTEXT;
    if (isLowSurrogate(before.charCodeAt(headCut))) headCut++;
  }

  // 접미에서 마지막 변경이 있는 줄의 뒷부분만 줄인다.
  let tailKeep = -1;
  const suffixStart = before.length - suffixLen;
  const nl = before.indexOf("\n", suffixStart);
  const lineTailLen = (nl === -1 ? before.length : nl) - suffixStart;
  if (lineTailLen > CONTEXT * 2) {
    tailKeep = CONTEXT;
    if (isLowSurrogate(before.charCodeAt(suffixStart + tailKeep))) tailKeep--;
  }

  const cut = (text: string): string => {
    let head = "";
    let body = text;
    let tail = "";
    if (tailKeep >= 0) {
      const tailStart = text.length - suffixLen + tailKeep;
      const tailEnd = text.length - suffixLen + lineTailLen;
      tail = ELLIPSIS + text.slice(tailEnd);
      body = text.slice(0, tailStart);
    }
    if (headCut > 0) {
      head = text.slice(0, lineHead) + ELLIPSIS;
      body = body.slice(headCut);
    }
    return head + body + tail;
  };
  return { before: cut(before), after: cut(after) };
}

/** 사람용 diff. 서버 본문 조각이라 제어문자를 치환한다. 긴 줄은 바뀐 곳 주변만 남긴다. */
export function formatHunks(hunks: ReplaceHunk[]): string {
  const out: string[] = [];
  hunks.forEach((h, i) => {
    const { before, after } = abbreviateHunk(h);
    out.push(`@@ ${i + 1}/${hunks.length} — ${h.line}번째 줄 @@`);
    for (const l of sanitizePreview(before).split("\n")) out.push(`-${l}`);
    for (const l of sanitizePreview(after).split("\n")) out.push(`+${l}`);
  });
  return out.join("\n") + "\n";
}

/**
 * `--dry-run` 결과를 출력 모드에 맞게 낸다.
 *
 * - `--json`: `{ dryRun, <대상 id>, replaced, mimeType, hunks }`
 * - `--quiet`: 바뀔 군데 수 한 줄
 * - 기본: diff 와 요약 한 줄
 */
export function printReplacePreview(
  globalOpts: OutputOptions,
  target: Record<string, string>,
  result: ReplaceResult,
  mimeType: string,
): void {
  if (globalOpts.json) {
    printJson({ dryRun: true, ...target, replaced: result.replaced, mimeType, hunks: result.hunks });
  } else if (globalOpts.quiet) {
    process.stdout.write(`${result.replaced}\n`);
  } else {
    process.stdout.write(formatHunks(result.hunks));
    process.stdout.write(`${result.replaced}군데가 바뀝니다 (dry-run, 수정하지 않음).\n`);
  }
}
