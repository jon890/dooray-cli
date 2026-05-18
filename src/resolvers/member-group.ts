import { DoorayApiClient } from "../api/client.js";
import type { CachedMemberGroup } from "../cache/types.js";
import { getMemberGroups, setMemberGroups, isExpired } from "../cache/store.js";
import { MEMBER_GROUPS_TTL_MS, RESOLVER_FETCH_PAGE_SIZE } from "../cache/types.js";
import { matchByName } from "./match.js";

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

// code 가 string 이며 비어있지 않음을 좁히는 type predicate
// → filter 결과 항목에서 `as string` 단언 없이 code 를 사용 가능
function hasValidCode(g: CachedMemberGroup): g is CachedMemberGroup & { code: string } {
  return typeof g.code === "string" && g.code.length > 0;
}

export async function resolveMemberGroup(
  client: DoorayApiClient,
  projectId: string,
  input: string,
): Promise<{ id: string; code: string }> {
  const groups = await ensureMemberGroups(client, projectId);
  // code 가 없는 그룹은 매칭 불가 — 사전 필터 (Dooray API 응답 mismatch, ADR-026)
  const valid = groups.filter(hasValidCode);
  const skipped = groups.length - valid.length;
  if (skipped > 0) {
    process.stderr.write(
      `⚠  ${skipped}개 그룹에 code 가 없어 매칭에서 제외했습니다 (Dooray API 응답 mismatch — ADR-026).\n`,
    );
  }
  // CachedMemberGroup은 { id, code } — name 필드 없음. matchByName은 name 필드 사용
  // → 어댑터: code를 name처럼 사용 (predicate 로 code 가 string 임이 좁혀짐)
  const adapter = valid.map((g) => ({ name: g.code, id: g.id, code: g.code }));
  const match = matchByName(adapter, input, "그룹", (g) => `${g.code} (${g.id})`, {
    helpHint: "dooray project groups <project>",
  });
  return { id: match.id, code: match.code };
}
