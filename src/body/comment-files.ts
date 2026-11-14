/**
 * Dooray 댓글/post 본문에 첨부 파일을 표시하는 reference.
 * 이미지: `![filename](/files/<fileId>)`, 그 외: `[filename](/files/<fileId>)`
 *
 * Dooray 가 댓글 전용 attachment endpoint 를 제공하지 않으므로 (ADR-024)
 * `dooray post comment file upload` 는 post-level 파일 업로드 후 이 헬퍼로
 * 댓글 본문에 reference 를 append, `delete` 는 reference 를 제거하는 방식
 * 으로 동작한다.
 *
 * 본문 형식별 문법은 `body-markup.ts` 가 소유한다 (ADR-055).
 */

import { buildLink } from "./body-markup.js";
import { MARKDOWN_MIME } from "./body-input.js";

const IMAGE_FILE_EXTENSION_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic)$/i;

export function appendFileReference(
  body: string,
  fileName: string,
  fileId: string,
  mimeType: string = MARKDOWN_MIME,
): string {
  const safeName = fileName.replace(/[\[\]]/g, "");
  const ref = buildLink(mimeType, {
    text: safeName,
    url: `/files/${fileId}`,
    image: IMAGE_FILE_EXTENSION_RE.test(safeName),
  });
  if (body.length === 0) return ref;
  const trailing = body.endsWith("\n") ? "" : "\n";
  return `${body}${trailing}\n${ref}`;
}

export interface RemoveFileReferenceResult {
  body: string;
  /** 본문에서 실제로 참조를 지웠는지. 호출부는 이 값으로 다음 단계를 정한다. */
  removed: boolean;
}

/** `![*](/files/<fileId>)` 와 `[*](/files/<fileId>)` 를 찾는 정규식 조각. */
function markdownRefSource(escapedFileId: string): string {
  return `!?\\[[^\\]]*\\]\\(/files/${escapedFileId}\\)`;
}

/**
 * reference 를 본문에서 뺀다.
 * 줄 전체가 reference 면 그 줄을 지우고, 같은 줄에 다른 글이 있으면 reference 만 지운다.
 */
function stripRef(body: string, refSource: string): string {
  const lineRe = new RegExp(`^[ \\t]*${refSource}[ \\t]*$\\n?`, "gm");
  const inlineRe = new RegExp(refSource, "g");
  return body.replace(lineRe, "").replace(inlineRe, "");
}

/**
 * 댓글 본문에서 특정 fileId 의 reference 를 제거한다.
 *
 * `text/html` 본문에도 마크다운 정규식을 쓴다. ADR-055 가 HTML 앵커 표기를
 * `확인 못함` 으로 적었고, 그 결정 전의 CLI 가 `text/html` 댓글에 마크다운
 * reference 를 평문으로 남겨 왔다. 그 본문을 지울 경로가 여기뿐이라
 * 빼는 쪽에는 형식 거절을 두지 않는다.
 *
 * `mimeType` 은 그래서 지금 분기에 쓰이지 않는다. HTML 앵커 표기를 확인하면
 * 이 값으로 갈라, 그 정규식을 먼저 시도하고 못 찾으면 마크다운으로 넘어간다.
 */
export function removeFileReference(
  body: string,
  fileId: string,
  mimeType: string = MARKDOWN_MIME,
): RemoveFileReferenceResult {
  const escaped = fileId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const next = stripRef(body, markdownRefSource(escaped));
  return { body: next, removed: next !== body };
}
