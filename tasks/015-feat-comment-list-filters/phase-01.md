# Phase 1: API params 확장 (order) + types

## 컨텍스트

Issue #23 — Dooray `/logs` 엔드포인트는 `order=createdAt`(asc, default) / `-createdAt`(desc) 를 server-side 지원. 본 phase는 client API 시그니처에 `order` 추가.

### 먼저 읽을 파일

- `src/api/client.ts` `GetPostCommentsParams` (대략 71:), `getPostComments` (271:) — 기존 형태
- `src/api/types.ts` `PostCommentListResponse`, `PostComment` (대략 301:)

### Dooray API 공식 (cmux 브라우저로 검증 완료)

`GET /project/v1/projects/{id}/posts/{id}/logs` 파라미터:
- `page` (기본 0), `size` (기본 20, max 100) — 이미 구현됨
- `order=createdAt` (asc, default) / `order=-createdAt` (desc) — **본 task에서 신규 추가**
- `since` / `from-author` 같은 server-side filter는 **없음** — phase 2에서 client-side

응답 스키마는 변경 없음.

## 작업 목록 (2개)

### 1) `src/api/client.ts` — `GetPostCommentsParams` 확장

기존:
```ts
export interface GetPostCommentsParams {
  page?: number;
  size?: number;
}
```

변경:
```ts
export interface GetPostCommentsParams {
  page?: number;
  size?: number;
  order?: "createdAt" | "-createdAt";
}
```

`getPostComments` 본문의 `searchParams` 객체에 `order` spread 추가:
```ts
searchParams: {
  ...(params?.page != null && { page: params.page }),
  ...(params?.size != null && { size: params.size }),
  ...(params?.order && { order: params.order }),
},
```

### 2) 타입 export 위치 확인

`GetPostCommentsParams`가 외부에서 import 가능한지 확인. phase 2의 명령에서 `import type { GetPostCommentsParams } from "../../../api/client.js"` 또는 `client.ts`에서 export하는 위치를 사용.

이미 export되어 있으면 변경 없음.

## 성공 기준

- [ ] `pnpm run build` 성공
- [ ] `pnpm test` 통과 (기존 30개 테스트 유지)
- [ ] `grep -c "order.*createdAt\|-createdAt" src/api/client.ts` → 2 이상 (타입 + spread)
- [ ] `git diff --stat` — `src/api/client.ts` 만 변경

## 주의사항

- **명령 옵션 추가는 phase 2** — 본 phase는 API 레이어만
- **client.ts 표준 패턴 유지**: try/catch + `this.api` + `toDoorayCliError`. 기존 `searchParams` spread 패턴 그대로
- **응답 타입 변경 없음** — `PostCommentListResponse`/`PostComment` 무변경
- **`order` 값을 union으로 좁힌 이유**: 사용자 input(string)은 phase 2에서 매핑. API에 잘못된 값 보내지 않도록 컴파일 타임 안전 확보

## Blocked 조건

- `GetPostCommentsParams` 인터페이스 시그니처가 호환 불가하게 변경됨 → `PHASE_BLOCKED: types 충돌`
- `searchParams` spread 패턴이 사라짐 → `PHASE_BLOCKED: client 패턴 변경`
