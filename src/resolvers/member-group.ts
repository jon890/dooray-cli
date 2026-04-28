import { DoorayApiClient } from "../api/client.js";
import type { CachedMemberGroup } from "../cache/types.js";
import { getMemberGroups, setMemberGroups, isExpired } from "../cache/store.js";
import { MEMBER_GROUPS_TTL_MS, RESOLVER_FETCH_PAGE_SIZE } from "../cache/types.js";

async function fetchAllMemberGroups(client: DoorayApiClient, projectId: string): Promise<CachedMemberGroup[]> {
  const all: CachedMemberGroup[] = [];
  let page = 0;
  const size = RESOLVER_FETCH_PAGE_SIZE;
  while (true) {
    const res = await client.getProjectMemberGroups(projectId, { page, size });
    for (const g of res.result) {
      all.push({ id: g.id, code: g.code });
    }
    const total = res.totalCount ?? all.length;
    if (all.length >= total) break;
    page++;
  }
  return all;
}

export async function ensureMemberGroups(
  client: DoorayApiClient,
  projectId: string,
): Promise<CachedMemberGroup[]> {
  const entry = await getMemberGroups(projectId);
  if (entry && !isExpired(entry.updatedAt, MEMBER_GROUPS_TTL_MS)) return entry.data;
  const items = await fetchAllMemberGroups(client, projectId);
  await setMemberGroups(projectId, items);
  return items;
}
