export type CommentFileSource = "attachment" | "body-link" | "both";

export interface MergedCommentFile {
  id: string;
  name: string | null;
  size: number | null;
  mimeType: string | null;
  source: CommentFileSource;
}

interface CommentFileMergeInput {
  commentFiles: ReadonlyArray<{ id: string; name: string | null; size: number | null }>;
  bodyRefs: ReadonlyArray<{ id: string; label: string }>;
  postFiles: ReadonlyArray<{ id: string; name: string; size: number; mimeType: string }>;
}

/**
 * 마크다운 라벨을 이름 fallback 으로 쓸 때의 변환.
 * 빈 라벨(`![](/files/id)`)은 값 없음으로 취급한다 — 그대로 두면 표 셀이 비어
 * 조회 실패와 구분되지 않는다. `??` 로 바꾸면 빈 문자열이 그대로 통과한다.
 */
function labelOrNull(label: string | undefined): string | null {
  if (label === undefined || label.length === 0) return null;
  return label;
}

export function mergeCommentFiles(input: CommentFileMergeInput): MergedCommentFile[] {
  const postFilesById = new Map(input.postFiles.map((file) => [file.id, file]));
  const bodyRefsById = new Map<string, { id: string; label: string }>();
  for (const reference of input.bodyRefs) {
    if (!bodyRefsById.has(reference.id)) bodyRefsById.set(reference.id, reference);
  }

  const merged: MergedCommentFile[] = [];
  const seen = new Set<string>();

  for (const commentFile of input.commentFiles) {
    if (seen.has(commentFile.id)) continue;
    seen.add(commentFile.id);

    const postFile = postFilesById.get(commentFile.id);
    const bodyRef = bodyRefsById.get(commentFile.id);
    merged.push({
      id: commentFile.id,
      name: postFile?.name ?? commentFile.name ?? labelOrNull(bodyRef?.label),
      size: postFile?.size ?? null,
      mimeType: postFile?.mimeType ?? null,
      source: bodyRef ? "both" : "attachment",
    });
  }

  for (const bodyRef of input.bodyRefs) {
    if (seen.has(bodyRef.id)) continue;
    seen.add(bodyRef.id);

    const postFile = postFilesById.get(bodyRef.id);
    merged.push({
      id: bodyRef.id,
      name: postFile?.name ?? labelOrNull(bodyRef.label),
      size: postFile?.size ?? null,
      mimeType: postFile?.mimeType ?? null,
      source: "body-link",
    });
  }

  return merged;
}
