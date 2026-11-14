/**
 * 본문 형식(`mimeType`)별 링크 문법과 지원 판정 (ADR-055).
 *
 * `mention.ts` 와 `task-link.ts` 와 `comment-files.ts` 가 이 모듈을 쓴다.
 * 세 파일이 같은 판정을 따로 가지면 갈라지므로 여기 한곳에 둔다.
 */

import { HTML_MIME, MARKDOWN_MIME } from "./body-input.js";

export type BodyMarkupKind =
  | "member-mention"
  | "group-mention"
  | "task-link"
  | "file-reference";

const KIND_LABEL: Record<BodyMarkupKind, string> = {
  "member-mention": "멤버 멘션",
  "group-mention": "그룹 멘션",
  "task-link": "업무 링크",
  "file-reference": "첨부 파일 reference",
};

/**
 * `text/html` 본문에서 표기가 확인된 종류.
 *
 * 공식 API 문서는 본문 `mimeType` 이 받는 값만 정의하고 네 종류의 표기는
 * 어느 형식에서도 정의하지 않는다. 확인되지 않은 표기를 추측해 넣으면
 * 링크로 렌더링되지 않는 문자열이 본문에 남고 그 사실이 출력에 드러나지 않아,
 * ADR-055 는 그런 조합을 거절하기로 정했다.
 *
 * 나중에 표기를 확인하면 여기에 종류를 더하고 `buildLink` 의 HTML 분기를 만든다.
 * ADR-055 의 실측 표가 이 목록의 단일 소스다.
 */
const HTML_SUPPORTED_KINDS: readonly BodyMarkupKind[] = [];

/** markdown link 텍스트 안의 특수문자 escape */
export function escapeLinkText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/\[/g, "&#91;")
    .replace(/\]/g, "&#93;")
    .replace(/—/g, "&mdash;");
}

export type MarkupSupport =
  | { supported: true }
  | { supported: false; message: string };

/**
 * 이 형식에서 이 마크업을 만들 수 있는지 본다.
 *
 * 만들 수 없으면 `--mime-type` 으로 형식을 바꾸는 방법을 함께 담은 거절 문구를 돌려준다.
 * 호출부는 링크를 만들기 전에, 이름과 업무를 해석하기 전에 이 판정을 거친다.
 */
export function checkMarkupSupport(
  mimeType: string,
  kind: BodyMarkupKind,
): MarkupSupport {
  if (mimeType !== HTML_MIME) return { supported: true };
  if (HTML_SUPPORTED_KINDS.includes(kind)) return { supported: true };
  return {
    supported: false,
    message:
      `${mimeType} 본문에는 ${KIND_LABEL[kind]}을 넣을 수 없습니다. 이 형식의 표기가 확인되지 않았습니다.\n` +
      `  본문 형식을 바꾸려면: --mime-type ${MARKDOWN_MIME}`,
  };
}

export interface BuildLinkOptions {
  /** 링크 텍스트. 마크다운에서는 호출부가 필요한 escape 를 이미 마친 값이다. */
  text: string;
  url: string;
  /** 호버 title. 없으면 title 을 붙이지 않는다. */
  title?: string;
  /** 참이면 이미지 링크로 만든다. */
  image?: boolean;
}

/**
 * 링크 하나를 그 형식의 문법으로 만든다.
 *
 * `BODY_MIME_TYPES` 밖의 값은 마크다운으로 본다. `resolveBodyMimeType` 이
 * 목록 밖의 값을 걸러 주지만 이 함수만 따로 불릴 수 있어 기본값이 필요하다.
 */
export function buildLink(mimeType: string, opts: BuildLinkOptions): string {
  if (mimeType === HTML_MIME) {
    // HTML 표기를 확인한 종류가 아직 없다. checkMarkupSupport 가 먼저 거절하므로
    // 여기 닿는 것은 그 판정을 건너뛴 호출이라는 뜻이다.
    throw new Error(
      `${HTML_MIME} 본문의 링크 표기가 아직 정해지지 않았습니다. ` +
        "checkMarkupSupport 로 먼저 판정하세요.",
    );
  }
  const prefix = opts.image ? "!" : "";
  if (opts.title != null) {
    const safeTitle = opts.title.replace(/"/g, "&quot;");
    return `${prefix}[${opts.text}](${opts.url} "${safeTitle}")`;
  }
  return `${prefix}[${opts.text}](${opts.url})`;
}
