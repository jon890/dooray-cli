/**
 * 기존 tagIds + 추가/제거/clear 입력을 머지해 최종 tagIds 산출 (pure).
 *
 * 적용 순서: clear → remove → add (중복 제거)
 *
 * @param existing 현재 post 의 tagIds (post.tags.map(t => t.id))
 * @param additions 추가할 tagIds (name → id 변환 후)
 * @param removals 제거할 tagIds
 * @param clear true 면 existing 무시
 */
export function mergeTagIds(
  existing: string[],
  additions: string[],
  removals: string[],
  clear: boolean,
): string[] {
  const base = clear ? [] : existing;
  const afterRemove = removals.length > 0
    ? base.filter((id) => !removals.includes(id))
    : base;
  if (additions.length === 0) return afterRemove;
  return Array.from(new Set([...afterRemove, ...additions]));
}
