import { DoorayApiClient } from "../api/client.js";
import type { CachedMember } from "../cache/types.js";
import { getMembers, setMembers, isExpired } from "../cache/store.js";
import { MEMBERS_TTL_MS } from "../cache/types.js";
import { matchByName } from "./match.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_API_ERROR, EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

const MEMBER_ID_RE = /^\d{15,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

/**
 * id(15+자리 numeric) / 이메일 입력을 organizationMemberId 로 해석.
 * 어느 쪽에도 매칭 안 되면 null 반환 (=이름 입력 — 호출자가 matchByName 등으로 폴백).
 * id/email 로 매칭됐으나 404·모호이면 여기서 throw (null 반환 아님).
 *
 * messenger `--to` (project 스코프 없어 matchByName 불가) 와 `resolveMember` 가 공유 (ADR-033).
 */
export async function resolveMemberByIdOrEmail(
  client: DoorayApiClient,
  input: string,
): Promise<string | null> {
  // 1. 15자리 이상 숫자 → organizationMemberId 직접 (getMemberDetail 로 존재 검증)
  if (MEMBER_ID_RE.test(input)) {
    try {
      await client.getMemberDetail(input);
      return input;
    } catch (err) {
      // toDoorayCliError 가 404 류 HTTP 에러에 EXIT_API_ERROR 부여. 그 케이스만
      // "찾을 수 없습니다" 로 변환하고, 인증(EXIT_AUTH_ERROR) / 네트워크(원본
      // Error — DoorayCliError 아님) 는 그대로 re-throw 해서 에러 분류 보존.
      if (err instanceof DoorayCliError && err.exitCode === EXIT_API_ERROR) {
        // 원본 에러 메시지를 (원인: ...) 로 보존 — Dooray 서버 응답이나 HTTP
        // 상태 코드 등 디버깅에 필요한 컨텍스트 손실 방지.
        throw new DoorayCliError(
          `organizationMemberId 를 찾을 수 없습니다: ${input} (원인: ${err.message})`,
          EXIT_PARAM_ERROR,
        );
      }
      throw err;
    }
  }

  // 2. 이메일 형식 → searchMembers exact
  if (EMAIL_RE.test(input)) {
    const res = await client.searchMembers({ externalEmailAddresses: input });
    const hits = res.result;
    if (hits.length === 0) {
      throw new DoorayCliError(
        `이메일로 멤버를 찾을 수 없습니다: ${input}`,
        EXIT_PARAM_ERROR,
      );
    }
    if (hits.length > 1) {
      // matchByName 의 모호 에러 포맷과 일치 — multi-line bullet 으로 통일.
      throw new DoorayCliError(
        `복수의 멤버가 매칭됩니다(이메일): "${input}"\n` +
          hits.map((m) => `  - ${m.name} (${m.id})`).join("\n"),
        EXIT_PARAM_ERROR,
      );
    }
    return hits[0]!.id;
  }

  return null;
}

export async function resolveMember(
  client: DoorayApiClient,
  projectId: string,
  input: string,
): Promise<string> {
  const byIdOrEmail = await resolveMemberByIdOrEmail(client, input);
  if (byIdOrEmail !== null) return byIdOrEmail;

  // 3. 그 외 → 기존 matchByName
  const members = await ensureMembers(client, projectId);
  const match = matchByName(
    members,
    input,
    "멤버",
    (m) => `${m.name} (${m.organizationMemberId})`,
  );
  return match.organizationMemberId;
}
