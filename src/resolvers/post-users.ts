import type { DoorayApiClient } from "../api/client.js";
import type { CreatePostUser } from "../api/types.js";
import { resolveMember } from "./member.js";
import { resolveMemberGroup } from "./member-group.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_API_ERROR } from "../utils/exit-codes.js";

/**
 * 어느 이름에서 실패했는지 접두사를 붙이되 종료 코드는 원래 오류의 것을 이어받는다.
 * 인증 실패(2)나 입력 오류(3)가 1 로 바뀌면 호출하는 스크립트가 원인을 구분하지 못한다.
 */
export function wrapLookupError(prefix: string, err: unknown): DoorayCliError {
  const msg = err instanceof Error ? err.message : String(err);
  const exitCode = err instanceof DoorayCliError ? err.exitCode : EXIT_API_ERROR;
  return new DoorayCliError(`${prefix}: ${msg}`, exitCode, { cause: err });
}

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
    names.map((n) =>
      resolveMember(client, projectId, n).catch((err: unknown) => {
        throw wrapLookupError(`멤버 '${n}' 조회 실패`, err);
      }),
    ),
  );
  const groups = await Promise.all(
    groupCodes.map((c) =>
      resolveMemberGroup(client, projectId, c).catch((err: unknown) => {
        throw wrapLookupError(`그룹 '${c}' 조회 실패`, err);
      }),
    ),
  );
  const groupIds = groups.map((g) => g.id);
  return parseUserSpec(memberIds, groupIds);
}
