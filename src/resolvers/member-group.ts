import { DoorayApiClient } from "../api/client.js";
import type { MemberGroup } from "../api/types.js";
import type { CachedMemberGroup } from "../cache/types.js";
import { getMemberGroups, setMemberGroups, isExpired } from "../cache/store.js";
import { MEMBER_GROUPS_TTL_MS, RESOLVER_FETCH_PAGE_SIZE } from "../cache/types.js";
import { matchByName } from "./match.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

// resolveMember 의 MEMBER_ID_RE 와 동일 패턴
const GROUP_ID_RE = /^\d{15,}$/;

export async function fetchAllMemberGroups(client: DoorayApiClient, projectId: string): Promise<CachedMemberGroup[]> {
  const all: CachedMemberGroup[] = [];
  let page = 0;
  const size = RESOLVER_FETCH_PAGE_SIZE;
  while (true) {
    const res = await client.getProjectMemberGroups(projectId, { page, size });
    // ADR-028: Dooray API 가 nested array (`result: [[g1, g2]]`) 로 반환 — flatten 필수
    // 1 레벨만 평면화. 평면 응답에도 안전 (이미 평면이면 flat() 무동작 — 멱등)
    const groups = (res.result as unknown as MemberGroup[][] | MemberGroup[]).flat() as MemberGroup[];
    for (const g of groups) {
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

  // 1. id 직접 입력 (numeric 15+자리) — code 누락 그룹도 매칭, response shape robustness
  if (GROUP_ID_RE.test(input)) {
    const found = groups.find((g) => g.id === input);
    if (found) {
      return { id: found.id, code: found.code ?? "" };
    }
    throw new DoorayCliError(
      `그룹 id 를 찾을 수 없습니다: "${input}"\n` +
      `전체 목록은 \`dooray project groups <project>\` 로 확인하세요.`,
      EXIT_PARAM_ERROR,
    );
  }

  // 2. code 매칭 흐름 (기존)
  // code 가 없는 그룹은 매칭 불가 — 사전 필터 (Dooray API 응답 mismatch, ADR-028)
  const valid = groups.filter(hasValidCode);
  const skipped = groups.length - valid.length;
  if (skipped > 0) {
    process.stderr.write(
      // ADR 번호 정정: ADR-026 → ADR-028
      `⚠  ${skipped}개 그룹에 code 가 없어 매칭에서 제외했습니다 (ADR-028).\n` +
      `   id 직접 입력 (15+자리 numeric) 또는 UI 수동 cc / \`--cc <member>\` 우회 가능.\n`,
    );
  }
  // CachedMemberGroup은 { id, code } — name 필드 없음. matchByName은 name 필드 사용
  // → 어댑터: code를 name처럼 사용 (predicate 로 code 가 string 임이 좁혀짐)
  const adapter = valid.map((g) => ({ name: g.code, id: g.id, code: g.code }));
  const match = matchByName(adapter, input, "그룹", (g) => `${g.code} (${g.id})`, {
    helpHint:
      "전체 목록: `dooray project groups <project>` / " +
      "id 직접 입력도 가능 (15+자리 numeric — code 누락 그룹도 매칭, ADR-028)",
  });
  return { id: match.id, code: match.code };
}
