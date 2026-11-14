import { buildLink } from "./body-markup.js";
import { MARKDOWN_MIME } from "./body-input.js";

/** 멘션에 필요한 조직과 본인의 식별자. */
export interface MentionContext {
  id: string;
  orgId: string;
}

export interface MentionMember {
  memberId: string;
  name: string;
}

export interface MentionGroup {
  groupId: string;
  code: string;
  projectCode: string;
}

export function buildMemberMention(
  m: MentionMember,
  me: MentionContext,
  mimeType: string = MARKDOWN_MIME,
): string {
  return buildLink(mimeType, {
    text: `@${m.name}`,
    url: `dooray://${me.orgId}/members/${m.memberId}`,
    title: m.memberId === me.id ? "me" : "member",
  });
}

export function buildGroupMention(
  g: MentionGroup,
  me: MentionContext,
  mimeType: string = MARKDOWN_MIME,
): string {
  return buildLink(mimeType, {
    text: `@${g.projectCode}/${g.code}`,
    url: `dooray://${me.orgId}/member-groups/${g.groupId}`,
  });
}

/**
 * 멤버·그룹 멘션을 본문 앞에 prepend.
 * 멤버가 먼저, 그룹이 다음. 각각 공백 1칸 구분. 본문이 비어있어도 형식 유지.
 */
export function prependMentions(
  body: string,
  members: MentionMember[],
  groups: MentionGroup[],
  me: MentionContext,
  mimeType: string = MARKDOWN_MIME,
): string {
  const parts: string[] = [];
  for (const m of members) parts.push(buildMemberMention(m, me, mimeType));
  for (const g of groups) parts.push(buildGroupMention(g, me, mimeType));
  if (parts.length === 0) return body;
  return parts.join(" ") + " " + body;
}
