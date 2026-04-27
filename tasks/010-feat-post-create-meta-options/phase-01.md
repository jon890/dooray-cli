# Phase 1: API 클라이언트 + types + 캐시 기반

## 컨텍스트

Issue #18 — `post create`가 mandatory-tag 정책 프로젝트에서 동작하지 않는 차단 이슈 해결. 본 phase는 후속 phase의 기반(API 메서드, 타입, 캐시 슬롯)을 마련.

### 먼저 읽을 파일

- `docs/adr.md` ADR-019 — 본 task의 결정 근거 (필드명·캐시·mandatory 검증 정책)
- `src/api/client.ts` (페이지네이션 패턴: `getProjectMembers` 단독 — `getProjectWorkflows`는 page/size 미수신이라 참고 대상 아님)
- `src/api/types.ts` (기존 `Tag`, `Milestone` 정의 여부 확인 — 응답 형태 일부 이미 있음)
- `src/cache/types.ts` + `src/cache/store.ts` (멤버·워크플로우 패턴)

### Dooray API 공식 (cmux 브라우저로 검증 완료)

`GET /project/v1/projects/{project-id}/tags` 응답:
```json
{
  "result": [{
    "id": "1", "name": "...", "color": "...",
    "tagGroup": { "id": "...", "name": "...", "mandatory": true, "selectOne": false } | null
  }],
  "totalCount": N
}
```
- 페이지네이션: `page` (기본 0), `size` (기본 20, 최대 100)

`GET /project/v1/projects/{project-id}/milestones` — 동일한 페이지네이션. 응답 wrapper는 tag와 동일한 형태로 가정:
```json
{ "header": {...}, "result": [{ "id": "...", "name": "..." }], "totalCount": N }
```
구현 시 실호출(`hurl`/`curl`)로 wrapper 형태(`result` + `totalCount`)를 반드시 1회 검증한 뒤 `MilestoneListResponse` 타입을 확정. 다르면 phase-02 진행 전에 phase-01 작업 1)/4) 수정.

POST `/project/v1/projects/{project-id}/posts` body 필드명: `tagIds`, `parentPostId`, `milestoneId` (단수). **이슈 본문 curl의 `tagIdList`는 사용자 오타** — 코드의 `tagIds` 그대로 사용.

## 작업 목록 (4개)

### 1) `src/api/types.ts` — 신규 타입 추가

기존 `Tag`, `Milestone` 정의 위치 확인 후 다음을 추가/보강:

```ts
export interface TagGroup {
  id: string;
  name: string;
  mandatory: boolean;
  selectOne: boolean;
}

// 기존 Tag 인터페이스 확장 — 신규 필드는 모두 optional.
// 사유: 기존 `PostDetailItem.tags: Tag[]` 응답에는 id 외 필드가 없을 수 있어
// 필수로 두면 런타임 undefined 위험. resolver(tag.ts)에서 CachedTag 정규화 시 좁힘.
export interface Tag {
  id: string;
  name?: string;
  color?: string;
  tagGroup?: TagGroup | null;
}

// Milestone은 최소 필드만 (id, name) — 추가 필드는 추후 확장
export interface Milestone {
  id: string;
  name: string;
}

export interface TagListResponse {
  header: DoorayApiHeader;
  result: Tag[];
  totalCount: number;
}

export interface MilestoneListResponse {
  header: DoorayApiHeader;
  result: Milestone[];
  totalCount: number;
}
```

기존에 동일 이름 타입이 있으면 **확장**만, 중복 정의 금지.

### 2) `src/api/client.ts` — 신규 메서드 2개

**필수 패턴**: `client.ts`의 실제 컨벤션은 try/catch + `this.api` + `toDoorayCliError`. `handle()` 헬퍼는 존재하지 않음. `getProjectMembers` (대략 client.ts:307~321)를 그대로 복제:

```ts
async getProjectTags(
  projectId: string,
  params?: { page?: number; size?: number },
): Promise<TagListResponse> {
  try {
    return await this.api
      .get(`project/v1/projects/${projectId}/tags`, {
        searchParams: {
          ...(params?.page != null && { page: params.page }),
          ...(params?.size != null && { size: params.size }),
        },
      })
      .json<TagListResponse>();
  } catch (e) {
    return toDoorayCliError(e);
  }
}

async getProjectMilestones(
  projectId: string,
  params?: { page?: number; size?: number },
): Promise<MilestoneListResponse> {
  try {
    return await this.api
      .get(`project/v1/projects/${projectId}/milestones`, {
        searchParams: {
          ...(params?.page != null && { page: params.page }),
          ...(params?.size != null && { size: params.size }),
        },
      })
      .json<MilestoneListResponse>();
  } catch (e) {
    return toDoorayCliError(e);
  }
}
```

- `this.api` (필드명) 사용 — `this.client` 아님
- `toDoorayCliError(e)`는 같은 파일 상단에 이미 존재. import 추가 불필요
- `searchParams`는 spread + `!= null` 가드로 0 값도 보존

### 3) `src/cache/types.ts` — 캐시 타입 추가

```ts
export const TAGS_TTL_MS = 86_400_000;       // 24h (워크플로우 동일)
export const MILESTONES_TTL_MS = 86_400_000; // 24h

export interface CachedTag {
  id: string;
  name: string;
  groupId: string | null;        // tagGroup.id (null이면 미소속)
  groupName: string | null;
  groupMandatory: boolean;       // mandatory 검증에 필요 (false 기본값)
  groupSelectOne: boolean;       // selectOne 검증에 필요 (false 기본값)
}

export interface CachedMilestone {
  id: string;
  name: string;
}
```

### 4) `src/cache/store.ts` — get/set 함수 추가

`getMembers`/`setMembers` 패턴 그대로 4개 함수 추가:

```ts
const TAGS_DIR = join(CACHE_DIR, "tags");
const MILESTONES_DIR = join(CACHE_DIR, "milestones");

function tagsPath(projectId: string): string {
  return join(TAGS_DIR, `${projectId}.json`);
}
function milestonesPath(projectId: string): string {
  return join(MILESTONES_DIR, `${projectId}.json`);
}

export async function getTags(projectId: string): Promise<CacheEntry<CachedTag[]> | null> {
  return readJson<CacheEntry<CachedTag[]>>(tagsPath(projectId));
}
export async function setTags(projectId: string, items: CachedTag[]): Promise<void> {
  await writeJson(tagsPath(projectId), { updatedAt: now(), data: items });
}
export async function getMilestones(projectId: string): Promise<CacheEntry<CachedMilestone[]> | null> {
  return readJson<CacheEntry<CachedMilestone[]>>(milestonesPath(projectId));
}
export async function setMilestones(projectId: string, items: CachedMilestone[]): Promise<void> {
  await writeJson(milestonesPath(projectId), { updatedAt: now(), data: items });
}
```

`getCacheStats`는 phase 4에서 갱신. 본 phase에서는 변경하지 않음.

## 성공 기준

- [ ] `pnpm build` 성공
- [ ] `grep -c "getProjectTags\|getProjectMilestones" src/api/client.ts` → 각 1 이상
- [ ] `grep -c "TAGS_TTL_MS\|MILESTONES_TTL_MS\|CachedTag\|CachedMilestone" src/cache/types.ts` → 4
- [ ] `grep -c "getTags\|setTags\|getMilestones\|setMilestones" src/cache/store.ts` → 4 이상
- [ ] `git diff --stat` — `src/api/client.ts`, `src/api/types.ts`, `src/cache/types.ts`, `src/cache/store.ts` 만 변경

## 주의사항

- **resolver 신설은 phase 2에서** — 이 phase는 client/types/cache만
- **`post create` 수정은 phase 3에서** — 이 phase에서 명령 수정 금지
- **`getCacheStats` 갱신은 phase 4에서** — 본 phase에서 건드리지 않음
- 기존 `Tag`/`Milestone` 타입이 이미 있으면 **확장만**. 중복 정의시 빌드 에러 가능
- `client.ts`의 실제 패턴은 try/catch + `this.api` + `toDoorayCliError` (handle 헬퍼 없음). `getProjectMembers`를 그대로 복제할 것

## Blocked 조건

- `src/api/types.ts`에 이미 `Tag`/`Milestone`/`TagGroup` 정의가 본 phase 요구와 호환 불가하게 충돌 → `PHASE_BLOCKED: 기존 타입 정의 충돌`
- `client.ts`의 try/catch + `toDoorayCliError` 패턴이 변경됨 → `PHASE_BLOCKED: 클라이언트 패턴 변경`
