import type { PostComment } from "../api/types.js";

/**
 * PostComment[]의 creator.member.name 비어있는 항목을 nameMap으로 채워서 반환.
 * 원본 변경 없음 (immutable). table 출력 직전에 호출.
 */
export function enrichCommentCreators(
  comments: PostComment[],
  nameMap: Map<string, string>,
): PostComment[] {
  return comments.map((c) => {
    const id = c.creator?.member?.organizationMemberId;
    const existing = c.creator?.member?.name;
    if (existing || !id) return c;
    const filled = nameMap.get(id);
    if (!filled) return c;
    return {
      ...c,
      creator: {
        ...c.creator,
        member: { ...c.creator.member!, name: filled },
      },
    };
  });
}
