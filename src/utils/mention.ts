import type { CachedMe } from "../cache/types.js";

export interface MentionMember {
  memberId: string;
  name: string;
}

export interface MentionGroup {
  groupId: string;
  code: string;
  projectCode: string;
}

export function buildMemberMention(m: MentionMember, me: CachedMe): string {
  const title = m.memberId === me.id ? "me" : "member";
  return `[@${m.name}](dooray://${me.orgId}/members/${m.memberId} "${title}")`;
}

export function buildGroupMention(g: MentionGroup, me: CachedMe): string {
  return `[@${g.projectCode}/${g.code}](dooray://${me.orgId}/member-groups/${g.groupId})`;
}

/**
 * 멤버·그룹 멘션을 본문 앞에 prepend.
 * 멤버가 먼저, 그룹이 다음. 각각 공백 1칸 구분. 본문이 비어있어도 형식 유지.
 */
export function prependMentions(
  body: string,
  members: MentionMember[],
  groups: MentionGroup[],
  me: CachedMe,
): string {
  const parts: string[] = [];
  for (const m of members) parts.push(buildMemberMention(m, me));
  for (const g of groups) parts.push(buildGroupMention(g, me));
  if (parts.length === 0) return body;
  return parts.join(" ") + " " + body;
}
