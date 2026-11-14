// ADR-057: 본문에 삽입된 파일도 download-all 의 대상으로 삼는다.
// 마크다운과 HTML 을 구별하지 않는다. 두 형식 모두 `/files/<id>` 문자열을 담는다.
const INLINE_FILE_REF = /\/files\/(\d+)/g;

/** 본문에서 `/files/<id>` 형태로 참조된 파일 id 를 뽑는다. 순서를 유지하고 중복을 없앤다. */
export function extractInlineFileIds(body: string): string[] {
  if (!body) return [];

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const match of body.matchAll(INLINE_FILE_REF)) {
    const id = match[1];
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}
