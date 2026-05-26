import { DoorayApiClient } from "../api/client.js";
import type { CachedProject } from "../cache/types.js";
import { getProjects, setProjects, getPrivateProjects, setPrivateProjects, isExpired } from "../cache/store.js";
import { PROJECTS_TTL_MS } from "../cache/types.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

// resolveMember 의 MEMBER_ID_RE 와 동일 패턴 — ADR-030
const PROJECT_ID_RE = /^\d{15,}$/;

async function fetchAllProjects(
  client: DoorayApiClient,
  options?: { type?: string },
): Promise<CachedProject[]> {
  const all: CachedProject[] = [];
  let page = 0;
  const size = 100;

  while (true) {
    const res = await client.getProjects({ page, size, type: options?.type });
    for (const p of res.result) {
      all.push({
        id: p.id,
        code: p.code,
        wikiId: p.wiki?.id ?? undefined,
      });
    }
    if (all.length >= res.totalCount) break;
    page++;
  }

  return all;
}

export async function ensureProjects(client: DoorayApiClient): Promise<CachedProject[]> {
  const entry = await getProjects();
  if (entry && !isExpired(entry.updatedAt, PROJECTS_TTL_MS)) {
    return entry.data;
  }
  const items = await fetchAllProjects(client);
  await setProjects(items);
  return items;
}

export async function ensurePrivateProjects(client: DoorayApiClient): Promise<CachedProject[]> {
  const entry = await getPrivateProjects();
  if (entry && !isExpired(entry.updatedAt, PROJECTS_TTL_MS)) {
    return entry.data;
  }
  const items = await fetchAllProjects(client, { type: "private" });
  await setPrivateProjects(items);
  return items;
}

export async function resolveProject(
  client: DoorayApiClient,
  input: string,
): Promise<string> {
  // 1. numeric 15+자리 — cache 우회 (ADR-030, Issue #78)
  // member=me 응답에 없는 프로젝트도 projectId 만 있으면 후속 API 호출 가능.
  // 권한 검증은 후속 호출의 4xx 에 위임.
  if (PROJECT_ID_RE.test(input)) {
    return input;
  }

  // 2. cache 매칭 (기존 흐름)
  const projects = await ensureProjects(client);
  const match = projects.find((p) => p.code === input || p.id === input);
  if (match) return match.id;

  // private 캐시가 있으면 추가 검색 (캐시 미스 시 API 호출 없음)
  const privateCached = await getPrivateProjects();
  if (privateCached && !isExpired(privateCached.updatedAt, PROJECTS_TTL_MS)) {
    const privateMatch = privateCached.data.find((p) => p.code === input || p.id === input);
    if (privateMatch) return privateMatch.id;
  }

  throw new DoorayCliError(
    `프로젝트를 찾을 수 없습니다: ${input}\n  개인 프로젝트라면: dooray project list --type private 로 캐시를 갱신하세요\n  member=me 응답에 없는 프로젝트는 projectId (15+자리 numeric) 직접 입력으로 우회 가능 (ADR-030)`,
    EXIT_PARAM_ERROR,
  );
}
