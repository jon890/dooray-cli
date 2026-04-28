# Phase 1: API/types/cache/resolver — member-groups 신규 + CachedTag color 추가

## 컨텍스트

Issue #20 — `project groups`/`project tags` 명령의 데이터 레이어. 010(ADR-019) 산출물 재활용 + 신규 member-groups 추가.

### 먼저 읽을 파일

- `src/api/client.ts` `getProjectMembers` (페이지네이션 패턴), `getProjectTags` (이미 존재) — try/catch + `this.api` + `toDoorayCliError` 패턴 정확히 따를 것
- `src/api/types.ts` (`Tag` 인터페이스 위치 확인 — 010에서 추가됨)
- `src/cache/types.ts` (`CachedTag`, `TAGS_TTL_MS` 등 010 산출), `src/cache/store.ts` (`getTags`/`setTags` 패턴)
- `src/resolvers/tag.ts` (010 산출 — 본 phase에서 fetchAllTags가 color도 채우도록 수정)
- `src/resolvers/member.ts` (`ensureMembers` 패턴 답습)

### Dooray API 공식 (cmux 브라우저로 검증 완료)

**`GET /project/v1/projects/{id}/member-groups`** 응답:
```json
{
  "header": {...},
  "result": [{
    "id": "1",
    "code": "mygroup",
    "project": {"id":"100","code":"project-code"},
    "createdAt": "...",
    "updatedAt": "..."
  }]
}
```
- pagination: `page` (기본 0), `size` (기본 20, 최댓값 100)
- **목록에는 `members` 배열 없음** — 단건 endpoint(`/{groupId}`)에만 포함. 본 task MVP는 목록만 사용

**`GET /project/v1/projects/{id}/tags`** 응답: 010에서 검증 완료. `color` 필드 존재.

## 작업 목록 (5개)

### 1) `src/api/types.ts` — MemberGroup 타입 + Tag 확장

신규 추가:
```ts
export interface MemberGroup {
  id: string;
  code: string;
  project: ProjectInfo;
  createdAt: string;
  updatedAt: string;
}

export interface MemberGroupListResponse {
  header: DoorayApiHeader;
  result: MemberGroup[];
  totalCount: number;
}
```

`ProjectInfo`는 기존 (post에서 이미 사용). `MemberGroup`의 `name` 필드 없음 — Dooray API가 `code`만 제공 (리스트 출력 컬럼명도 "Code").

기존 `Tag` 인터페이스에 이미 `color?: string`이 있다면 **변경 없음**(010에서 이미 그렇게 정의). 없으면 optional 필드로 추가:
```ts
// 010에서 이미 이 형태일 것 (확인만)
export interface Tag {
  id: string;
  name?: string;
  color?: string;
  tagGroup?: TagGroup | null;
}
```

### 2) `src/api/client.ts` — `getProjectMemberGroups` 신규

`getProjectTags` 바로 아래에 동일 패턴으로 추가:
```ts
async getProjectMemberGroups(
  projectId: string,
  params?: { page?: number; size?: number },
): Promise<MemberGroupListResponse> {
  try {
    return await this.api
      .get(`project/v1/projects/${projectId}/member-groups`, {
        searchParams: {
          ...(params?.page != null && { page: params.page }),
          ...(params?.size != null && { size: params.size }),
        },
      })
      .json<MemberGroupListResponse>();
  } catch (e) {
    return toDoorayCliError(e);
  }
}
```

### 3) `src/cache/types.ts` — CachedMemberGroup + TTL + CachedTag color

```ts
export const MEMBER_GROUPS_TTL_MS = 86_400_000; // 24h (workflows/tags와 동일)

export interface CachedMemberGroup {
  id: string;
  code: string;
}
```

`CachedTag`에 **`color: string`** 필드 추가 (기존 필드 옆):
```ts
export interface CachedTag {
  id: string;
  name: string;
  color: string;          // ★ 신규 — 010 캐시 invalidation 필요 (cache clear 안내는 phase 2 README에서)
  groupId: string | null;
  groupName: string | null;
  groupMandatory: boolean;
  groupSelectOne: boolean;
}
```

### 4) `src/cache/store.ts` — getMemberGroups/setMemberGroups + 디렉터리 상수

`TAGS_DIR` 옆에 추가:
```ts
const MEMBER_GROUPS_DIR = join(CACHE_DIR, "member-groups");

function memberGroupsPath(projectId: string): string {
  return join(MEMBER_GROUPS_DIR, `${projectId}.json`);
}

export async function getMemberGroups(projectId: string): Promise<CacheEntry<CachedMemberGroup[]> | null> {
  return readJson<CacheEntry<CachedMemberGroup[]>>(memberGroupsPath(projectId));
}

export async function setMemberGroups(projectId: string, items: CachedMemberGroup[]): Promise<void> {
  await writeJson(memberGroupsPath(projectId), { updatedAt: now(), data: items });
}
```

`getCacheStats`에 통계 1줄 추가 (member 명령(012)의 `memberProjectCount` 패턴 참고):
```ts
let memberGroupProjectCount = 0;
try {
  const files = await readdir(MEMBER_GROUPS_DIR);
  memberGroupProjectCount = files.filter((f) => f.endsWith(".json")).length;
} catch {}
// 반환 객체에 추가
```
함수 시그니처(반환 타입)에 `memberGroupProjectCount: number` 필드 추가.

### 5) `src/resolvers/member-group.ts` 신규 + tag.ts 색상 채우기

**`src/resolvers/member-group.ts`** (`ensureMembers` 패턴 그대로):
```ts
import { DoorayApiClient } from "../api/client.js";
import type { CachedMemberGroup } from "../cache/types.js";
import { getMemberGroups, setMemberGroups, isExpired } from "../cache/store.js";
import { MEMBER_GROUPS_TTL_MS } from "../cache/types.js";

async function fetchAllMemberGroups(client: DoorayApiClient, projectId: string): Promise<CachedMemberGroup[]> {
  const all: CachedMemberGroup[] = [];
  let page = 0;
  const size = 100;
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
```

**`src/resolvers/tag.ts`** — `fetchAllTags`의 push 객체에 `color` 추가:
```ts
all.push({
  id: t.id,
  name: t.name ?? "",
  color: t.color ?? "",    // ★ 신규
  groupId: t.tagGroup?.id ?? null,
  // ... 나머지 그대로
});
```

> 010 캐시 호환성: 기존 `tags/*.json`은 `color` 필드가 없음. JSON.parse 결과 `color: undefined` → 사용 시 빈 문자열로 fallback해도 되지만, 안전을 위해 `dooray cache clear`로 재생성 권장. README에 1줄 안내(phase 2).

## 성공 기준

- [ ] `pnpm run build` 성공
- [ ] `pnpm test` 통과 (기존 테스트 전부)
- [ ] `grep -c "getProjectMemberGroups\|MemberGroupListResponse" src/api/client.ts src/api/types.ts` → 각 1 이상
- [ ] `grep -c "MEMBER_GROUPS_TTL_MS\|CachedMemberGroup" src/cache/types.ts` → 2 이상
- [ ] `grep -c "getMemberGroups\|setMemberGroups\|MEMBER_GROUPS_DIR" src/cache/store.ts` → 3 이상
- [ ] `grep -c "memberGroupProjectCount" src/cache/store.ts` → 1 이상 (stats 갱신)
- [ ] `ls src/resolvers/member-group.ts` 존재
- [ ] `grep -c "color" src/resolvers/tag.ts src/cache/types.ts` → 각 1 이상

## 주의사항

- **명령 등록은 phase 2** — 본 phase는 데이터 레이어만
- **README/SKILL.md 갱신은 phase 2** — 본 phase에서 docs 변경 금지
- **try/catch + this.api + toDoorayCliError**: client.ts의 표준 패턴, `handle()` 헬퍼 없음. `getProjectTags`를 정확히 복제
- **`MemberGroup`에 `name` 필드 없음** — Dooray API가 `code`만 제공. 출력 컬럼명도 "Code"
- **`getCacheStats` 호출자 점검**: doctor 명령에서 호출 — 시그니처 변경 시 doctor.ts 출력도 갱신 필요. 본 phase 작업 4)에서 stats 객체에 필드 추가 후 doctor.ts에 1줄 출력 추가

## Blocked 조건

- `Tag` 인터페이스에 이미 `color` 외 호환 불가한 형태로 정의되어 있음 → `PHASE_BLOCKED: types 충돌`
- `getProjectTags` 시그니처/패턴이 변경됨 → `PHASE_BLOCKED: client 패턴 변경 감지`
