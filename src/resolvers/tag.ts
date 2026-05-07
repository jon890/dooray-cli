import { DoorayApiClient } from "../api/client.js";
import type { CachedTag } from "../cache/types.js";
import { getTags, setTags, isExpired } from "../cache/store.js";
import { TAGS_TTL_MS, RESOLVER_FETCH_PAGE_SIZE } from "../cache/types.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import { matchByName } from "./match.js";

async function fetchAllTags(client: DoorayApiClient, projectId: string): Promise<CachedTag[]> {
  const all: CachedTag[] = [];
  let page = 0;
  const size = RESOLVER_FETCH_PAGE_SIZE;
  while (true) {
    const res = await client.getProjectTags(projectId, { page, size });
    for (const t of res.result) {
      all.push({
        id: t.id,
        name: t.name ?? "",
        color: t.color ?? "",
        groupId: t.tagGroup?.id ?? null,
        groupName: t.tagGroup?.name ?? null,
        groupMandatory: t.tagGroup?.mandatory ?? false,
        groupSelectOne: t.tagGroup?.selectOne ?? false,
      });
    }
    const total = res.totalCount ?? all.length;
    if (all.length >= total) break;
    page++;
  }
  return all;
}

export async function ensureTags(client: DoorayApiClient, projectId: string): Promise<CachedTag[]> {
  const entry = await getTags(projectId);
  if (entry && !isExpired(entry.updatedAt, TAGS_TTL_MS)) return entry.data;
  const items = await fetchAllTags(client, projectId);
  await setTags(projectId, items);
  return items;
}

/** 누락 그룹별 후보 태그 추출 헬퍼 */
function buildMandatoryHint(allTags: CachedTag[], missingGroupIds: string[]): string {
  const lines: string[] = [];
  for (const gid of missingGroupIds) {
    const groupTags = allTags.filter((t) => t.groupId === gid);
    const gname = groupTags[0]?.groupName ?? gid;
    const candidates = groupTags.map((t) => t.name).join(", ");
    lines.push(`  - "${gname}": ${candidates || "(태그 없음)"}`);
  }
  return lines.join("\n");
}

/**
 * 태그 입력 없이 post create 시 mandatory 그룹 존재 여부를 사전 검증.
 * mandatory 그룹이 있으면 후보 태그를 포함한 에러를 throw.
 */
export async function validateMandatoryTags(
  client: DoorayApiClient,
  projectId: string,
): Promise<void> {
  const allTags = await ensureTags(client, projectId);
  const missingGroupIds: string[] = [];
  const seen = new Set<string>();
  for (const t of allTags) {
    if (t.groupMandatory && t.groupId && !seen.has(t.groupId)) {
      seen.add(t.groupId);
      missingGroupIds.push(t.groupId);
    }
  }
  if (missingGroupIds.length === 0) return;
  throw new DoorayCliError(
    `필수 태그 그룹이 누락되었습니다 (그룹당 1개 이상 필요):\n` +
      buildMandatoryHint(allTags, missingGroupIds) +
      `\n\n다시 시도: --tag "<그룹>: <후보>" 형식으로 추가`,
    EXIT_PARAM_ERROR,
  );
}

/**
 * 입력된 태그 이름들을 CachedTag로 lookup하고 mandatory/selectOne 정책을 검증.
 * 반환값은 tagIds (post create body용).
 */
export async function resolveTags(
  client: DoorayApiClient,
  projectId: string,
  inputs: string[],
): Promise<string[]> {
  const allTags = await ensureTags(client, projectId);

  // 1. 각 input → CachedTag (matchByName 사용, 모호시 에러)
  const selected: CachedTag[] = inputs.map((input) =>
    matchByName(
      allTags,
      input,
      "태그",
      (t) => (t.groupName ? `${t.groupName} / ${t.name} (${t.id})` : `${t.name} (${t.id})`),
    ),
  );

  // 2. mandatory 그룹 충족 검증
  const mandatoryGroups = new Map<string, string>(); // groupId -> groupName
  for (const t of allTags) {
    if (t.groupMandatory && t.groupId) mandatoryGroups.set(t.groupId, t.groupName ?? t.groupId);
  }
  const coveredGroups = new Set(selected.map((t) => t.groupId).filter((g): g is string => !!g));
  const missingIds: string[] = [];
  for (const [gid] of mandatoryGroups) {
    if (!coveredGroups.has(gid)) missingIds.push(gid);
  }
  if (missingIds.length > 0) {
    throw new DoorayCliError(
      `필수 태그 그룹이 누락되었습니다 (그룹당 1개 이상 필요):\n` +
        buildMandatoryHint(allTags, missingIds),
      EXIT_PARAM_ERROR,
    );
  }

  // 3. selectOne 그룹에 2개 이상 선택 시 에러
  const selectOneGroups = new Map<string, { name: string; tags: string[] }>();
  for (const t of selected) {
    if (!t.groupSelectOne || !t.groupId) continue;
    const entry = selectOneGroups.get(t.groupId) ?? { name: t.groupName ?? t.groupId, tags: [] };
    entry.tags.push(t.name);
    selectOneGroups.set(t.groupId, entry);
  }
  const violators: string[] = [];
  for (const [, info] of selectOneGroups) {
    if (info.tags.length > 1) {
      violators.push(`${info.name} (선택: ${info.tags.join(", ")})`);
    }
  }
  if (violators.length > 0) {
    throw new DoorayCliError(
      `다음 태그 그룹은 1개만 선택 가능합니다:\n` +
        violators.map((v) => `  - ${v}`).join("\n"),
      EXIT_PARAM_ERROR,
    );
  }

  return selected.map((t) => t.id);
}
