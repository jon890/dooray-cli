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
