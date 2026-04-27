import { DoorayApiClient } from "../api/client.js";
import type { CachedMember } from "../cache/types.js";
import { getMembers, setMembers, isExpired } from "../cache/store.js";
import { MEMBERS_TTL_MS } from "../cache/types.js";
import { matchByName } from "./match.js";

async function fetchAllMembers(
  client: DoorayApiClient,
  projectId: string,
): Promise<CachedMember[]> {
  // Step 1: collect all member IDs from project member API (only returns id + role)
  const memberIds: string[] = [];
  let page = 0;
  const size = 100;

  while (true) {
    const res = await client.getProjectMembers(projectId, { page, size });
    for (const m of res.result) {
      memberIds.push(m.organizationMemberId);
    }
    const total = res.totalCount ?? memberIds.length;
    if (memberIds.length >= total) break;
    page++;
  }

  // Step 2: enrich with /common/v1/members/{id} (all parallel)
  const all = await Promise.all(
    memberIds.map(async (id) => {
      try {
        const detail = await client.getMemberDetail(id);
        return {
          organizationMemberId: id,
          name: detail.result.name,
        };
      } catch {
        return {
          organizationMemberId: id,
          name: "",
        };
      }
    }),
  );

  return all;
}

export async function ensureMembers(
  client: DoorayApiClient,
  projectId: string,
): Promise<CachedMember[]> {
  const entry = await getMembers(projectId);
  if (entry && !isExpired(entry.updatedAt, MEMBERS_TTL_MS)) {
    return entry.data;
  }
  const items = await fetchAllMembers(client, projectId);
  await setMembers(projectId, items);
  return items;
}

/**
 * organizationMemberId → 표시명.
 * 1. project 캐시에서 hit하면 해당 name 반환 (캐시 신선도는 resolveMember와 동일)
 * 2. miss 또는 캐시 stale이면 getMemberDetail 직접 호출 (결과 캐시는 안 함 — ADR-021)
 * 3. API도 실패하면 빈 문자열 반환 (호출자가 fallback 표시)
 *
 * `buildMemberNameMap`은 같은 projectId의 여러 id를 한 번의 ensureMembers로 lookup.
 */
export async function lookupMemberName(
  client: DoorayApiClient,
  projectId: string,
  organizationMemberId: string,
): Promise<string> {
  const members = await ensureMembers(client, projectId);
  const cached = members.find((m) => m.organizationMemberId === organizationMemberId);
  if (cached?.name) return cached.name;
  try {
    const detail = await client.getMemberDetail(organizationMemberId);
    return detail.result.name ?? "";
  } catch {
    return "";
  }
}

/**
 * 한 projectId 컨텍스트에서 여러 organizationMemberId의 표시명을 한 번에 조회.
 * 단일 ensureMembers 호출 후 in-memory map으로 반환. 캐시 miss는
 * 추가 API 호출하지 않음 — 호출자가 빈 문자열을 보고 표시 처리.
 */
export async function buildMemberNameMap(
  client: DoorayApiClient,
  projectId: string,
): Promise<Map<string, string>> {
  const members = await ensureMembers(client, projectId);
  const map = new Map<string, string>();
  for (const m of members) {
    if (m.name) map.set(m.organizationMemberId, m.name);
  }
  return map;
}

export async function resolveMember(
  client: DoorayApiClient,
  projectId: string,
  input: string,
): Promise<string> {
  const members = await ensureMembers(client, projectId);
  const match = matchByName(
    members,
    input,
    "멤버",
    (m) => `${m.name} (${m.organizationMemberId})`,
  );
  return match.organizationMemberId;
}
