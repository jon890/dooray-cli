import { DoorayApiClient } from "../api/client.js";
import type { CachedMember } from "../cache/types.js";
import { getMembers, setMembers, isExpired } from "../cache/store.js";
import { MEMBERS_TTL_MS } from "../cache/types.js";
import { matchByName } from "./match.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_API_ERROR, EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import { sanitizeForTerminal } from "../utils/sanitize.js";

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
 * organizationMemberId 목록 → 표시명 map.
 * project 스코프가 없는 곳(messenger 등)에서 쓴다 — `buildMemberNameMap` 은
 * `ensureMembers` 로 프로젝트 멤버 목록을 받으므로 projectId 없이는 쓸 수 없다.
 *
 * 중복 id 는 한 번만 조회하고, 호출은 `fetchAllMembers` 와 같게 병렬이다.
 * 조회에 실패한 id 는 map 에 넣지 않아 호출자가 id 를 그대로 표시하게 한다.
 */
export async function buildOrganizationMemberNameMap(
  client: DoorayApiClient,
  organizationMemberIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(organizationMemberIds)];
  const entries = await Promise.all(
    unique.map(async (id): Promise<[string, string] | null> => {
      try {
        const detail = await client.getMemberDetail(id);
        return detail.result?.name ? [id, detail.result.name] : null;
      } catch {
        // 개별 조회 실패는 전체를 실패시키지 않는다.
        return null;
      }
    }),
  );
  return new Map(entries.filter((e): e is [string, string] => e !== null));
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
        `이메일로 멤버를 찾을 수 없습니다: ${sanitizeForTerminal(input)}`,
        EXIT_PARAM_ERROR,
      );
    }
    if (hits.length > 1) {
      // matchByName 의 모호 에러 포맷과 일치 — multi-line bullet 으로 통일.
      throw new DoorayCliError(
        `복수의 멤버가 매칭됩니다(이메일): "${sanitizeForTerminal(input)}"\n` +
          hits.map((m) => `  - ${memberLabel(m.name, m.id)}`).join("\n"),
        EXIT_PARAM_ERROR,
      );
    }
    return hits[0]!.id;
  }

  return null;
}

/** 오류에 싣는 멤버 표시. 이름과 id 는 서버 값이라 제어 문자를 지운다. */
function memberLabel(name: string | undefined, id: string): string {
  return sanitizeForTerminal(`${name} (${id})`);
}

/**
 * 이 입력을 풀려면 프로젝트 멤버 목록이 필요한지 본다.
 * id 와 이메일은 목록 없이 풀리고, 그 밖의 값은 `resolveMember` 가 이름으로 찾는다.
 * 여러 입력을 동시에 풀기 전에 목록을 한 번만 받아 두려는 호출자가 쓴다.
 */
export function needsMemberList(input: string): boolean {
  return !MEMBER_ID_RE.test(input) && !EMAIL_RE.test(input);
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
    (m) => memberLabel(m.name, m.organizationMemberId),
  );
  return match.organizationMemberId;
}

/** 이름 검색을 몇 쪽까지 넘겨 볼지. 넘으면 이름이 너무 흔한 것이라 id·이메일을 요구한다. */
const NAME_SEARCH_PAGE_SIZE = 100;
const NAME_SEARCH_MAX_PAGES = 5;

/**
 * 프로젝트 스코프 없이 조직 멤버 하나를 organizationMemberId 로 해석한다. 캘린더 참석자처럼
 * 프로젝트 멤버 목록을 쓸 수 없는 곳에서 쓴다.
 *
 * 1. `me` → 내 id
 * 2. id·이메일 → `resolveMemberByIdOrEmail` (조직에 없는 이메일은 오류. 외부 주소로 보내지 않는다)
 * 3. 그 밖 → 조직 전체 이름 검색에서 **이름 정확일치만** 인정한다.
 *    조직 전체는 동명이인과 부분일치가 많아 프로젝트 resolver 의 부분일치 폴백을 쓰지 않는다.
 *    0건이면 오류, 정확일치가 여럿이면 이름과 id 를 나열하고 오류로 끝낸다.
 *    검색은 쪽 상한까지만 넘긴다. 상한에 닿으면 정확일치를 찾았어도 오류로 끝내고, 찾은 후보를 함께 보여준다.
 */
export async function resolveOrganizationMember(
  client: DoorayApiClient,
  input: string,
  meId: () => Promise<string>,
): Promise<string> {
  if (input === "me") return meId();

  const byIdOrEmail = await resolveMemberByIdOrEmail(client, input);
  if (byIdOrEmail !== null) return byIdOrEmail;

  const exact: { id: string; name: string }[] = [];
  let seen = 0;
  for (let page = 0; ; page++) {
    if (page >= NAME_SEARCH_MAX_PAGES) {
      // 보지 못한 쪽에 같은 이름의 사람이 더 있을 수 있다. 일정 초대는 상대에게 알림이 가서
      // 틀린 사람을 고르면 되돌릴 수 없으므로, 정확일치를 찾았어도 고르지 않는다.
      // 대신 찾은 후보를 보여줘 id 로 바로 다시 실행할 수 있게 한다.
      const found =
        exact.length > 0
          ? `\n상한까지 찾은 정확일치 (이 밖에도 더 있을 수 있습니다):\n` +
            exact.map((m) => `  - ${memberLabel(m.name, m.id)}`).join("\n")
          : "";
      throw new DoorayCliError(
        `이름 "${sanitizeForTerminal(input)}" 의 검색 결과가 너무 많아 끝까지 보지 못했습니다. organizationMemberId 나 이메일로 지정하세요 ` +
          `(dooray member search 로 확인)${found}`,
        EXIT_PARAM_ERROR,
      );
    }
    const res = await client.searchMembers({ name: input, page, size: NAME_SEARCH_PAGE_SIZE });
    const hits = res.result ?? [];
    for (const m of hits) {
      if (m.name === input) exact.push({ id: m.id, name: m.name });
    }
    seen += hits.length;
    if (hits.length === 0) break;
    // totalCount 가 없는 응답에서 첫 쪽만 보고 끝내면 다음 쪽의 동명이인을 놓친다.
    // 그때는 쪽이 덜 찼을 때를 마지막 쪽으로 본다 (Issue #228).
    if (res.totalCount != null ? seen >= res.totalCount : hits.length < NAME_SEARCH_PAGE_SIZE) break;
  }

  if (exact.length === 0) {
    throw new DoorayCliError(
      `이름이 정확히 "${sanitizeForTerminal(input)}" 인 멤버를 찾을 수 없습니다. ` +
        `organizationMemberId 나 이메일로 지정하세요 (dooray member search 로 확인)`,
      EXIT_PARAM_ERROR,
    );
  }
  if (exact.length > 1) {
    throw new DoorayCliError(
      `이름이 "${sanitizeForTerminal(input)}" 인 멤버가 여럿입니다. organizationMemberId 나 이메일로 지정하세요:\n` +
        exact.map((m) => `  - ${memberLabel(m.name, m.id)}`).join("\n"),
      EXIT_PARAM_ERROR,
    );
  }
  return exact[0]!.id;
}
