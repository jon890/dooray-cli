import { DoorayApiClient } from "../api/client.js";
import type { CachedMilestone } from "../cache/types.js";
import { getMilestones, setMilestones, isExpired } from "../cache/store.js";
import { MILESTONES_TTL_MS, RESOLVER_FETCH_PAGE_SIZE } from "../cache/types.js";
import { matchByName } from "./match.js";

async function fetchAllMilestones(client: DoorayApiClient, projectId: string): Promise<CachedMilestone[]> {
  const all: CachedMilestone[] = [];
  let page = 0;
  const size = RESOLVER_FETCH_PAGE_SIZE;
  while (true) {
    const res = await client.getProjectMilestones(projectId, { page, size });
    for (const m of res.result) all.push({ id: m.id, name: m.name });
    const total = res.totalCount ?? all.length;
    if (all.length >= total) break;
    page++;
  }
  return all;
}

export async function ensureMilestones(
  client: DoorayApiClient,
  projectId: string,
): Promise<CachedMilestone[]> {
  const entry = await getMilestones(projectId);
  if (entry && !isExpired(entry.updatedAt, MILESTONES_TTL_MS)) return entry.data;
  const items = await fetchAllMilestones(client, projectId);
  await setMilestones(projectId, items);
  return items;
}

export async function resolveMilestone(
  client: DoorayApiClient,
  projectId: string,
  input: string,
): Promise<string> {
  const all = await ensureMilestones(client, projectId);
  const match = matchByName(all, input, "마일스톤", (m) => `${m.name} (${m.id})`);
  return match.id;
}
