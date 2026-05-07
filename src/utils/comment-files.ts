/**
 * Dooray 댓글/post 본문에 첨부 파일을 inline 으로 표시하는 markdown 형식.
 * 형식: `![filename](/files/<fileId>)`
 *
 * Dooray 가 댓글 전용 attachment endpoint 를 제공하지 않으므로 (ADR-024)
 * `dooray post comment file upload` 는 post-level 파일 업로드 후 이 헬퍼로
 * 댓글 본문에 reference 를 append, `delete` 는 reference 를 제거하는 방식
 * 으로 동작한다.
 */

export function appendFileReference(body: string, fileName: string, fileId: string): string {
  const safeName = fileName.replace(/[\[\]]/g, "");
  const ref = `![${safeName}](/files/${fileId})`;
  if (body.length === 0) return ref;
  const trailing = body.endsWith("\n") ? "" : "\n";
  return `${body}${trailing}\n${ref}`;
}

/**
 * 댓글 본문에서 특정 fileId 의 markdown reference 를 제거.
 * `![*](/files/<fileId>)` 패턴을 줄 단위로 매치하여 그 줄 전체 제거.
 * 같은 줄에 다른 텍스트가 있으면 reference 만 빈 문자열로 치환.
 */
export function removeFileReference(body: string, fileId: string): string {
  const escaped = fileId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const refSource = `!\\[[^\\]]*\\]\\(/files/${escaped}\\)`;
  const lineRe = new RegExp(`^[ \\t]*${refSource}[ \\t]*$\\n?`, "gm");
  const inlineRe = new RegExp(refSource, "g");
  return body.replace(lineRe, "").replace(inlineRe, "");
}
