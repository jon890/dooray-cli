/**
 * wiki inline_image 본문 삽입용 markdown reference.
 * plain 출력과 --json markdownSnippet 필드가 동일 문자열이 되도록 단일화.
 */
export function wikiInlineImageSnippet(
  wikiId: string,
  attachFileId: string,
  name: string,
): string {
  return `![${name}](/wikis/${wikiId}/files/${attachFileId})`;
}
