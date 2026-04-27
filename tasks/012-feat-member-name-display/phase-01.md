# Phase 1: member resolver 역방향 lookup + comment Creator enrich 헬퍼

## 컨텍스트

Issue #17 — `organizationMemberId` → 표시명 변환을 단일 헬퍼로 추상화. 후속 phase가 활용. ADR-021.

### 먼저 읽을 파일

- `src/resolvers/member.ts` — name → ID 방향 (기존). 본 phase에서 역방향 추가
- `src/cache/store.ts` `getMembers` (대략 85:), `cache/types.ts` `CachedMember` (22:)
- `src/api/client.ts` `getMemberDetail` (325:) — `/common/v1/members/{id}` 응답 `MemberDetail { id, name, userCode?, ... }`
- `src/api/types.ts` `PostComment.creator: PostUser` (308:), `PostUser.member?: { organizationMemberId, name? }` (103:)
- `docs/adr.md` ADR-021

## 작업 목록 (3개)

### 1) `src/resolvers/member.ts` — 역방향 lookup 함수 추가

기존 `resolveMember` 옆에 다음 함수 추가:

```ts
/**
 * organizationMemberId → 표시명.
 * 1. project 캐시에서 hit하면 해당 name 반환 (캐시 신선도는 resolveMember와 동일)
 * 2. miss 또는 캐시 stale이면 getMemberDetail 직접 호출 (결과 캐시는 안 함 — ADR-021)
 * 3. API도 실패하면 빈 문자열 반환 (호출자가 fallback 표시)
 *
 * `enrichManyMembers`는 같은 projectId의 여러 id를 한 번의 ensureMembers로 lookup.
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
 * 단일 ensureMembers 호출 후 in-memory map으로 반환. 캐시 miss는 enrichManyMembers는
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
```

> `lookupMemberName`은 단건 (member get용). `buildMemberNameMap`은 일괄 (comment list enrich용 — 추가 API 안 함, 캐시 hit만).

### 2) `src/utils/comment-enrich.ts` — Creator 채우기 헬퍼

```ts
import type { PostComment } from "../api/types.js";

/**
 * PostComment[]의 creator.member.name 비어있는 항목을 nameMap으로 채워서 반환.
 * 원본 변경 없음 (immutable). table 출력 직전에 호출.
 */
export function enrichCommentCreators(
  comments: PostComment[],
  nameMap: Map<string, string>,
): PostComment[] {
  return comments.map((c) => {
    const id = c.creator?.member?.organizationMemberId;
    const existing = c.creator?.member?.name;
    if (existing || !id) return c;
    const filled = nameMap.get(id);
    if (!filled) return c;
    return {
      ...c,
      creator: {
        ...c.creator,
        member: { ...c.creator.member!, name: filled },
      },
    };
  });
}
```

### 3) 단위 테스트

**`src/utils/comment-enrich.test.ts`**:

```ts
import { describe, it, expect } from "vitest";
import { enrichCommentCreators } from "./comment-enrich.js";
import type { PostComment } from "../api/types.js";

function makeComment(opts: { id: string; memberId?: string; name?: string }): PostComment {
  return {
    id: opts.id,
    post: { id: "p1" },
    type: "log", subtype: "comment",
    createdAt: "2026-04-27T00:00:00Z",
    creator: opts.memberId
      ? { type: "member", member: { organizationMemberId: opts.memberId, ...(opts.name && { name: opts.name }) } }
      : { type: "system" } as any,
    body: { mimeType: "text/x-markdown", content: "" },
  };
}

describe("enrichCommentCreators", () => {
  it("name 비어있고 nameMap hit → 채움", () => {
    const map = new Map([["m1", "홍길동"]]);
    const out = enrichCommentCreators([makeComment({ id: "c1", memberId: "m1" })], map);
    expect(out[0].creator.member?.name).toBe("홍길동");
  });
  it("name 이미 있으면 변경 안 함", () => {
    const map = new Map([["m1", "다른이름"]]);
    const out = enrichCommentCreators([makeComment({ id: "c1", memberId: "m1", name: "원래이름" })], map);
    expect(out[0].creator.member?.name).toBe("원래이름");
  });
  it("nameMap miss → 변경 안 함 (name 비어있음 그대로)", () => {
    const map = new Map<string, string>();
    const out = enrichCommentCreators([makeComment({ id: "c1", memberId: "m1" })], map);
    expect(out[0].creator.member?.name).toBeUndefined();
  });
  it("creator.member 없음 (system 등) → 변경 안 함", () => {
    const map = new Map([["m1", "홍길동"]]);
    const out = enrichCommentCreators([makeComment({ id: "c1" })], map);
    expect(out[0]).toEqual(makeComment({ id: "c1" }));
  });
  it("원본 배열 mutation 없음", () => {
    const map = new Map([["m1", "홍길동"]]);
    const original = [makeComment({ id: "c1", memberId: "m1" })];
    enrichCommentCreators(original, map);
    expect(original[0].creator.member?.name).toBeUndefined();
  });
});
```

`buildMemberNameMap`/`lookupMemberName`은 외부 호출(API/cache I/O)이 많아 본 phase 단위 테스트에서 제외. phase 4 시나리오로 검증.

## 성공 기준

- [ ] `pnpm build` 성공
- [ ] `pnpm test` 통과 (enrichCommentCreators 5개 + 기존 테스트들)
- [ ] `grep -c "lookupMemberName\|buildMemberNameMap" src/resolvers/member.ts` → 2 이상
- [ ] `ls src/utils/comment-enrich.ts src/utils/comment-enrich.test.ts` → 2 파일 존재
- [ ] `git diff --stat` — `src/resolvers/member.ts`, `src/utils/comment-enrich.ts(.test.ts)` 만 변경

## 주의사항

- **명령 레이어 수정 금지** — 본 phase는 헬퍼만. `member` 명령 신설은 phase 2, comment 적용은 phase 3
- **enrichCommentCreators는 immutable** — `c.creator.member`도 spread로 신규 객체 만들 것
- **lookupMemberName 실패 시 빈 문자열 반환** — throw 금지 (호출자가 화면 표시 처리)
- **`buildMemberNameMap`은 추가 API 호출 안 함** — comment list 같은 다건 처리에서 N+1 호출 폭증 방지
- **vitest는 phase 1(011) 산출물** — `pnpm test`가 동작해야 함. 011이 아직 미구현이면 `vitest` 미설치로 실패. 본 task는 011 머지 후 실행 권장 (또는 vitest를 본 phase에서 먼저 설치 — 이 경우 011과 충돌 가능성, 별도 경로)

> **dependency note**: 011-feat-post-input-unification가 vitest를 도입함. 011이 먼저 머지된 상태에서 본 task 실행이 정상 흐름. 011 미머지 상태에서 본 task 실행 시 `pnpm add -D vitest` + scripts 추가가 phase 1에 추가로 필요.

## Blocked 조건

- vitest 미설치 (011 미머지) → 사용자 결정: vitest 추가하거나 011 먼저 진행 → `PHASE_BLOCKED: vitest 미설치`
- `getMemberDetail` 시그니처 변경 → `PHASE_BLOCKED: API 시그니처 불일치`
