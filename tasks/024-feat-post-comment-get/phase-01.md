# Phase 01 — API client `getPostCommentDetail` + types

## 컨텍스트

GitHub Issue #45 — 단일 댓글 ID 로 fetch. 현재는 `getPostComments` (목록) 만 존재. 사용자가 jq 로 필터링하거나 raw curl 호출 우회 중.

API 엔드포인트:
```
GET /project/v1/projects/{projectId}/posts/{postId}/logs/{logId}
```

응답 형태: `DoorayApiResponse<PostComment>` — 기존 `PostComment` 타입 재사용 (목록 응답의 한 element 와 동일 형식).

코드 현황:
- `src/api/client.ts:276` — `getPostComments(projectId, postId)` (목록 — `posts/{postId}/logs`)
- `src/api/types.ts:301-312` — `PostComment` 인터페이스 정의 (id / body / files? / creator 등)
- `toDoorayCliError` 패턴은 client.ts 의 다른 메서드와 동일 (현 시점 시그니처 유지 — Issue #42 의 `never` 통일 refactor 는 task 026 에서 일괄 처리)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git log origin/main --oneline -10 -- src/api/client.ts src/api/types.ts
```

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- src/api/
```

기대 결과 (총 1~2 파일):
```
src/api/client.ts
src/api/types.ts          (PostCommentDetailResponse alias 만, 또는 변경 없음)
```

## 작업 항목

### 1. `src/api/types.ts` — alias 추가 (선택)

```ts
export type PostCommentDetailResponse = DoorayApiResponse<PostComment>;
```

`DoorayApiResponse<T>` 가 이미 정의되어 있다면 client.ts 에서 `Promise<DoorayApiResponse<PostComment>>` 직접 사용해도 OK. 가독성 위해 alias 권장.

### 2. `src/api/client.ts` — `getPostCommentDetail` 메서드 추가

기존 `getPostComments` 옆에 신규 메서드:

```ts
async getPostCommentDetail(
  projectId: string,
  postId: string,
  logId: string,
): Promise<PostCommentDetailResponse> {
  try {
    return await this.api
      .get(`project/v1/projects/${projectId}/posts/${postId}/logs/${logId}`)
      .json<PostCommentDetailResponse>();
  } catch (e) {
    return toDoorayCliError(e);
  }
}
```

기존 `getPostComments` 와 동일 try/catch 패턴 유지 (#42 의 `never` 통일은 별도 task).

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm build && pnpm test
# 기대: exit 0

grep -nE "async getPostCommentDetail" src/api/client.ts
# 기대: 1줄

grep -nE "logs/\\\$\\{logId\\}" src/api/client.ts
# 기대: 1 이상 (URL 패턴)
```

## 작업 외 금지

- 명령 추가 금지 — phase-02 에서
- 다른 client 메서드의 `never` refactor 금지 — task 026 에서
- 댓글 cache 도입 금지 (ad-hoc 조회)
- ADR 추가 금지 (자명성 게이트 — 기존 logs 엔드포인트 직접 호출)

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/024-feat-post-comment-get
git add src/api/client.ts src/api/types.ts
git commit -m "feat(api): add getPostCommentDetail method (single comment by logId)

Issue #45: enable single-comment fetch via GET logs/{logId}.
Reuses PostComment type and DoorayApiResponse envelope."
```
