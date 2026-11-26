/**
 * 본문을 직접 조립한 업무 링크를 찾아 형식 문제를 판정하고 고친 꼴을 만든다 (ADR-085).
 *
 * 업무 조회가 필요한 판정(번호 대조, 웹 주소 변환의 workflow)은 `resolvers/link-check.ts` 가 맡는다.
 * 이 파일은 API 를 모르고 문자열만 다룬다.
 */

import { parseDoorayTaskUrl } from "@/utils/dooray-url.js";
import { buildLink } from "./body-markup.js";
import { MARKDOWN_MIME } from "./body-input.js";

export type TaskLinkKind = "dooray" | "web";

/** 본문에서 찾은 업무 링크 하나. `start`·`end` 는 `[` 부터 `)` 까지의 위치다. */
export interface FoundTaskLink {
  start: number;
  end: number;
  raw: string;
  text: string;
  url: string;
  title?: string;
  postId: string;
  kind: TaskLinkKind;
}

// `](url)` 또는 `](url "title")`. 표시 글의 시작 `[` 는 뒤에서 앞으로 짝을 맞춰 찾는다.
// 표시 글에 대괄호가 섞이면 정규식 하나로는 시작을 정할 수 없어서다.
const LINK_TAIL_RE = /\]\(\s*([^\s)"]+)(?:\s+"([^"]*)")?\s*\)/g;
const DOORAY_TASK_URL_RE = /^dooray:\/\/\d+\/tasks\/(\d+)$/;

/**
 * `tenantName` 이 있으면 그 테넌트의 웹 주소만 업무 링크로 본다.
 * 다른 테넌트의 업무는 내 orgId 로 바꿀 수 없어서다. 없으면 `*.dooray.com` 을 모두 본다.
 */
export function findTaskLinks(body: string, tenantName?: string): FoundTaskLink[] {
  const links: FoundTaskLink[] = [];
  for (const m of body.matchAll(LINK_TAIL_RE)) {
    const closeIdx = m.index;
    const url = m[1];
    const target = classifyTaskUrl(url, tenantName);
    if (!target) continue;
    const openIdx = findOpenBracket(body, closeIdx);
    if (openIdx < 0) continue;
    // 이미지 링크(`![..](..)`)는 업무 링크가 아니다.
    if (openIdx > 0 && body[openIdx - 1] === "!") continue;
    const end = closeIdx + m[0].length;
    links.push({
      start: openIdx,
      end,
      raw: body.slice(openIdx, end),
      text: body.slice(openIdx + 1, closeIdx),
      url,
      ...(m[2] !== undefined && { title: m[2] }),
      postId: target.postId,
      kind: target.kind,
    });
  }
  return links;
}

function classifyTaskUrl(
  url: string,
  tenantName?: string,
): { postId: string; kind: TaskLinkKind } | null {
  const dooray = DOORAY_TASK_URL_RE.exec(url);
  if (dooray) return { postId: dooray[1], kind: "dooray" };
  const postId = parseDoorayTaskUrl(url);
  if (!postId) return null;
  if (tenantName) {
    const host = /^https?:\/\/([^/]+)/i.exec(url)?.[1]?.toLowerCase();
    if (host !== `${tenantName.toLowerCase()}.dooray.com`) return null;
  }
  return { postId, kind: "web" };
}

/**
 * `closeIdx` 의 `]` 와 짝인 `[` 를 같은 줄 안에서 찾는다.
 * 짝이 맞지 않으면(표시 글에 `]` 만 더 있으면) 앞 링크가 끝난 뒤의 첫 `[` 를 쓴다.
 */
function findOpenBracket(body: string, closeIdx: number): number {
  const lineStart = body.lastIndexOf("\n", closeIdx - 1) + 1;
  let depth = 0;
  for (let i = closeIdx; i >= lineStart; i--) {
    const ch = body[i];
    if (ch === "]") depth++;
    else if (ch === "[") {
      depth--;
      if (depth === 0) return i;
    }
  }
  const segmentStart = Math.max(lineStart, body.lastIndexOf(")", closeIdx) + 1);
  const first = body.indexOf("[", segmentStart);
  return first >= 0 && first < closeIdx ? first : -1;
}

/** 표시 글에 이스케이프하지 않은 대괄호가 있는지. */
export function hasUnescapedBrackets(text: string): boolean {
  return /[[\]]/.test(text);
}

/** 대괄호만 엔티티로 바꾼다. 이미 쓴 `&#91;` 같은 엔티티를 다시 바꾸지 않으려고 `&` 는 두지 않는다. */
export function escapeBrackets(text: string): string {
  return text.replace(/\[/g, "&#91;").replace(/\]/g, "&#93;");
}

/** 표시 글 앞의 「프로젝트/번호」. 그 꼴로 시작하지 않으면 null 이다. */
export function parseLinkTextRef(text: string): { projectCode: string; number: number } | null {
  const m = /^\s*([^\s/[\]]+)\/(\d+)(?=\s|$)/.exec(text);
  if (!m) return null;
  return { projectCode: m[1], number: Number(m[2]) };
}

/** 업무 링크 한 줄을 `dooray://` 꼴로 만든다. */
export function buildDoorayTaskLink(
  text: string,
  orgId: string,
  postId: string,
  workflowClass?: string,
): string {
  return buildLink(MARKDOWN_MIME, {
    text,
    url: `dooray://${orgId}/tasks/${postId}`,
    title: workflowClass || undefined,
  });
}

export interface BodyReplacement {
  start: number;
  end: number;
  replacement: string;
}

/** 위치가 겹치지 않는 치환을 뒤에서부터 적용한다. */
export function applyReplacements(body: string, replacements: BodyReplacement[]): string {
  return [...replacements]
    .sort((a, b) => b.start - a.start)
    .reduce((acc, r) => acc.slice(0, r.start) + r.replacement + acc.slice(r.end), body);
}
