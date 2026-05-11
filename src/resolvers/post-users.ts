import type { DoorayApiClient } from "../api/client.js";
import type { CreatePostUser } from "../api/types.js";
import { resolveMember } from "./member.js";
import { resolveMemberGroup } from "./member-group.js";

// PURE — member-id 와 group-id 의 sync 변환. mock 없이 단위 테스트.
export function parseUserSpec(
  memberIds: string[],
  groupIds: string[],
): CreatePostUser[] {
  const users: CreatePostUser[] = [];
  for (const id of memberIds) {
    users.push({ type: "member", member: { organizationMemberId: id } });
  }
  for (const gid of groupIds) {
    users.push({ type: "group", group: { projectMemberGroupId: gid, members: [] } });
  }
  return users;
}

// PURE — 기존 users 와 신규 users 병합. clear 면 existing 무시. dedupe:
//   - member: organizationMemberId
//   - group: projectMemberGroupId
//   - emailUser: emailAddress (보존)
export function mergeUsers(
  existing: CreatePostUser[],
  additions: CreatePostUser[],
  clear: boolean,
): CreatePostUser[] {
  const base = clear ? [] : existing;
  const seen = new Set<string>();
  const result: CreatePostUser[] = [];
  for (const u of [...base, ...additions]) {
    const key = userKey(u);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(u);
  }
  return result;
}

function userKey(u: CreatePostUser): string | null {
  if (u.member?.organizationMemberId) return `m:${u.member.organizationMemberId}`;
  if (u.group?.projectMemberGroupId) return `g:${u.group.projectMemberGroupId}`;
  if (u.emailUser?.emailAddress) return `e:${u.emailUser.emailAddress}`;
  return null;
}

// ASYNC — 이름/코드 입력을 resolveMember / resolveMemberGroup 으로 id 변환 후 parseUserSpec 호출.
export async function resolveUserAdditions(
  client: DoorayApiClient,
  projectId: string,
  names: string[],
  groupCodes: string[],
): Promise<CreatePostUser[]> {
  const memberIds = await Promise.all(
    names.map((n) => resolveMember(client, projectId, n)),
  );
  const groups = await Promise.all(
    groupCodes.map((c) => resolveMemberGroup(client, projectId, c)),
  );
  const groupIds = groups.map((g) => g.id);
  return parseUserSpec(memberIds, groupIds);
}
