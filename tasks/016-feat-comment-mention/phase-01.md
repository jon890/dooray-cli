# Phase 1: API/types/cache — MeDetail.defaultOrganization + CachedMe.orgId + resolveMemberGroup

## 컨텍스트

Issue #25 — 멘션 마크업 URL이 `dooray://{orgId}/...` 형식이라 orgId 확보가 필수. `GET /common/v1/members/me` 응답에 `defaultOrganization.id` 존재 확인됨 — me 캐시에 저장. 014의 member-groups 캐시는 이미 존재 → group code → ID resolver만 신규.

### 먼저 읽을 파일

- `src/api/client.ts` `getMe` (134:), `getMemberDetail` (336:) — 응답 타입 차이 확인
- `src/api/types.ts` `MemberDetail` (347:) — me 응답 전용 필드 추가
- `src/cache/types.ts` `CachedMe` (11:) — orgId 추가 대상
- `src/cache/store.ts` `getMe`/`setMe` (대략 56:)
- `src/resolvers/member.ts` (012) — 패턴 답습 + 본인 ID 매칭용 ensureMe
- `src/resolvers/member-group.ts` (014) — `ensureMemberGroups`. 본 phase에서 `resolveMemberGroup(code → id)` 추가
- `src/utils/errors.ts`, `src/utils/exit-codes.ts` — DoorayCliError, EXIT_PARAM_ERROR

### Dooray API 공식 (cmux 검증 완료)

`GET /common/v1/members/me` 응답:
```json
{
  "result": {
    "id": "...",                    // 본인 organizationMemberId
    "name": "...",
    "userCode": "...",
    "externalEmailAddress": "...",
    "defaultOrganization": { "id": "..." },  // ★ orgId
    "englishName": "...",
    "nickname": "...",
    ...
  }
}
```

`GET /common/v1/members/{id}` 는 `defaultOrganization` 미포함.

## 작업 목록 (4개)

### 1) `src/api/types.ts` — MeDetail 별도 타입 + 응답 타입

기존 `MemberDetail`은 `getMemberDetail` 응답으로 그대로 두고, `getMe` 전용 타입 신규:

```ts
export interface MeDetail extends MemberDetail {
  defaultOrganization: { id: string };
  idProviderType?: string;
  idProviderUserId?: string;
  locale?: string;
  timezoneName?: string;
  nativeName?: string;
  displayMemberId?: string;
}

export type MeResponse = DoorayApiResponse<MeDetail>;
```

> 기존 `MemberDetailResponse`를 그대로 쓰면 호출자가 `defaultOrganization`에 접근 못 함. **별도 타입**으로 좁힘.

### 2) `src/api/client.ts` — `getMe` 반환 타입을 `MeResponse`로 교체

```ts
async getMe(): Promise<MeResponse> {
  try {
    return await this.api
      .get("common/v1/members/me")
      .json<MeResponse>();
  } catch (e) {
    return toDoorayCliError(e);
  }
}
```

> `MemberDetailResponse` → `MeResponse` 변경. 호출자(setup 등)에서 컴파일 에러 발생하면 단순 import 교체로 처리. 응답 객체 사용 위치는 phase 1 작업 4)에서 검토.

### 3) `src/cache/types.ts` + `src/cache/store.ts` — CachedMe 확장 + ensureMe 헬퍼

**`src/cache/types.ts`**:
```ts
export interface CachedMe {
  id: string;
  name: string;
  orgId: string;          // ★ 신규
}
```

> 010(`CachedTag.color`) 패턴 답습. 이전 캐시는 `orgId` 미포함 — `cache clear`로 재생성. README 안내(phase 3).

**`src/resolvers/me.ts` 신규**:
```ts
import { DoorayApiClient } from "../api/client.js";
import type { CachedMe } from "../cache/types.js";
import { getMe, setMe, isExpired } from "../cache/store.js";
import { ME_TTL_MS } from "../cache/types.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

export async function ensureMe(client: DoorayApiClient): Promise<CachedMe> {
  const entry = await getMe();
  if (entry && !isExpired(entry.updatedAt, ME_TTL_MS) && entry.data.orgId) {
    return entry.data;
  }
  const res = await client.getMe();
  const orgId = res.result.defaultOrganization?.id ?? "";
  if (!orgId) {
    throw new DoorayCliError(
      "orgId를 확인할 수 없습니다 (getMe 응답에 defaultOrganization.id 누락). dooray cache clear 후 재시도하세요.",
      EXIT_PARAM_ERROR,
    );
  }
  const cached: CachedMe = {
    id: res.result.id,
    name: res.result.name,
    orgId,
  };
  await setMe(cached);
  return cached;
}
```

> `entry.data.orgId` 검사: 이전 버전 캐시(orgId 없음)는 stale로 간주해 강제 갱신. cache clear 안내와 별개로 자동 자가치유.

`getMe`/`setMe`/`ME_TTL_MS`는 010 이전부터 존재 — 시그니처 변경 없음(`CachedMe` 타입만 확장).

### 4) `src/resolvers/member-group.ts` — `resolveMemberGroup(code → id)` 추가

기존 `ensureMemberGroups`(014) 옆에 추가:

```ts
import { matchByName } from "./match.js";
// ...

export async function resolveMemberGroup(
  client: DoorayApiClient,
  projectId: string,
  input: string,
): Promise<{ id: string; code: string }> {
  const groups = await ensureMemberGroups(client, projectId);
  // CachedMemberGroup은 { id, code } — name 필드 없음. matchByName은 name 필드 사용
  // → 어댑터: code를 name처럼 사용
  const adapter = groups.map((g) => ({ name: g.code, id: g.id, code: g.code }));
  const match = matchByName(adapter, input, "그룹", (g) => `${g.code} (${g.id})`);
  return { id: match.id, code: match.code };
}
```

> 010의 `matchByName`(정확일치 → 부분일치 → 모호 에러)을 그대로 활용.

### 5) (작업 4-1) — getMe 호출자 점검

`grep -rn "client.getMe\b" src/` 로 호출자 확인. 응답에서 `MeDetail` 신규 필드(`defaultOrganization`)에 접근하지 않으면 변경 영향 없음. 컴파일만 통과하면 OK.

> 일반적으로 `setup` 명령에서 `getMe`를 인증 검증용으로 호출 — 응답 필드는 `id`/`name` 정도만 사용하므로 영향 미미.

## 성공 기준

- [ ] `pnpm run build` 성공
- [ ] `pnpm test` 통과
- [ ] `grep -c "MeDetail\|MeResponse" src/api/types.ts src/api/client.ts` → 각 1 이상
- [ ] `grep -c "defaultOrganization" src/api/types.ts src/api/client.ts src/resolvers/me.ts` → 3 이상
- [ ] `grep -c "orgId" src/cache/types.ts src/resolvers/me.ts` → 각 1 이상
- [ ] `ls src/resolvers/me.ts` 존재
- [ ] `grep -c "resolveMemberGroup" src/resolvers/member-group.ts` → 1 이상
- [ ] `git diff --stat` — `src/api/{client,types}.ts`, `src/cache/types.ts`, `src/resolvers/{me,member-group}.ts`만 변경

## 주의사항

- **명령 옵션 추가는 phase 2** — 본 phase는 데이터 레이어만
- **README/SKILL.md 갱신은 phase 3** — 본 phase에서 docs 변경 금지
- **`MemberDetail` 본체는 변경 금지** — `MeDetail extends MemberDetail` 형태로만 확장. `getMemberDetail` 응답 타입 호환 유지
- **`ensureMe`는 orgId 자가치유**: 이전 캐시(orgId 누락)도 정상 동작 — `entry.data.orgId` 체크로 강제 갱신
- **빈 orgId 에러 메시지** 정확히: `"orgId를 확인할 수 없습니다 (getMe 응답에 defaultOrganization.id 누락). dooray cache clear 후 재시도하세요."` — 시나리오 검증에서 grep
- **try/catch + this.api + toDoorayCliError**: client.ts 표준 패턴 유지

## Blocked 조건

- `MemberDetail` 인터페이스가 `MeDetail`과 호환 불가하게 정의됨 → `PHASE_BLOCKED: types 충돌`
- `getMe` 호출자가 응답을 `MemberDetailResponse`로 strict 타입 받아 컴파일 실패 다수 → `PHASE_BLOCKED: getMe 호출자 광범위 영향`
- 014의 `ensureMemberGroups` 시그니처 변경 → `PHASE_BLOCKED: 014 산출물 변경`
