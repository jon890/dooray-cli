# Phase 1: API client 메서드 + types

## 컨텍스트

Issue #26 — `GET /common/v1/members` endpoint 활용한 organization-wide 멤버 검색. **API 실호출 검증 완료** (planning 단계):
- `?name=keyword` → 200 OK ✓
- `?userCode=keyword` → 200 OK ✓
- 파라미터 없음 → 400 "Query params can not be empty"
- 5개 필터 (`externalEmailAddresses`, `name`, `userCode`, `userCodeExact`, `idProviderUserId`) 중 **어느 하나라도 있으면 OK**

이슈 본문 모호함("externalEmailAddresses 필수" 표기)은 API 실측으로 해소.

### 먼저 읽을 파일

- `src/api/client.ts` `getMemberDetail` (336:), `getMe` (134:) — `/common/v1/members` 인접 메서드
- `src/api/types.ts` `MemberDetail` (347:), `MemberDetailResponse` — 응답 타입
- 014 client.ts 패턴 (`searchParams` spread) 답습

## 작업 목록 (3개)

### 1) `src/api/types.ts` — 검색 응답 타입

`/common/v1/members` 응답은 list 형태 (totalCount + result 배열). `MemberDetail` 그대로 활용:

```ts
export interface MemberSearchResponse {
  header: DoorayApiHeader;
  result: MemberDetail[];
  totalCount: number;
}
```

### 2) `src/api/client.ts` — `searchMembers` 신규 메서드

`getProjectMembers`/`getProjectTags` 패턴 그대로:

```ts
export interface SearchMembersParams {
  name?: string;
  externalEmailAddresses?: string;  // 콤마 구분 가능 (Dooray 스펙)
  userCode?: string;
  userCodeExact?: string;
  idProviderUserId?: string;
  page?: number;
  size?: number;
}

async searchMembers(params: SearchMembersParams): Promise<MemberSearchResponse> {
  try {
    return await this.api
      .get("common/v1/members", {
        searchParams: {
          ...(params.name && { name: params.name }),
          ...(params.externalEmailAddresses && { externalEmailAddresses: params.externalEmailAddresses }),
          ...(params.userCode && { userCode: params.userCode }),
          ...(params.userCodeExact && { userCodeExact: params.userCodeExact }),
          ...(params.idProviderUserId && { idProviderUserId: params.idProviderUserId }),
          ...(params.page != null && { page: params.page }),
          ...(params.size != null && { size: params.size }),
        },
      })
      .json<MemberSearchResponse>();
  } catch (e) {
    return toDoorayCliError(e);
  }
}
```

> `searchMembers` 위치: `getMemberDetail` 바로 위 또는 아래 (members 관련 메서드 그룹).

### 3) (검증) — 호출자 점검

`grep -rn "client.searchMembers\b" src/` 로 호출자 확인. 본 phase에서는 신규 메서드이므로 호출자 0건이 정상. phase 2에서 `member search` 명령이 첫 호출자.

## 성공 기준

- [ ] `pnpm run build` 성공
- [ ] `pnpm test` 통과 (기존 테스트 유지)
- [ ] `grep -c "searchMembers\|MemberSearchResponse\|SearchMembersParams" src/api/client.ts src/api/types.ts` → 각 1 이상
- [ ] `grep -c "common/v1/members\b" src/api/client.ts` → 2 이상 (`searchMembers` + 기존 `getMe`)
- [ ] `git diff --stat` — `src/api/{client,types}.ts`만 변경

## 주의사항

- **명령은 phase 2** — 본 phase는 API 레이어만
- **`MemberDetail` 재사용** — 신규 타입 정의 금지 (`/common/v1/members/{id}` 응답과 동일 형태)
- **`SearchMembersParams.externalEmailAddresses`** 는 콤마 구분 문자열로 전달 (Dooray 스펙: `?externalEmailAddresses=a@x.com,b@y.example.com`). 명령 옵션은 단일 입력만 받고 그대로 전달
- **try/catch + this.api + toDoorayCliError**: 표준 패턴 유지
- **`?` 포함 모든 필터가 optional** — params 비어있으면 호출자가 사전 검증해야 함 (phase 2에서 처리). 본 phase의 메서드 자체는 빈 params도 받아서 보냄(API가 400 반환)

## Blocked 조건

- `MemberDetail` 응답이 list 형태와 호환 불가하게 변경됨 → `PHASE_BLOCKED: 응답 형태 충돌`
- `client.ts`의 try/catch + toDoorayCliError 패턴이 사라짐 → `PHASE_BLOCKED: 표준 패턴 변경`
