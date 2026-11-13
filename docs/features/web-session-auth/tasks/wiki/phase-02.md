# Phase 02. 페이지 쓰기와 댓글을 웹 경로에 붙인다

**Execution profile**: standard

## 목표

페이지 생성·수정·이동·삭제와 댓글 조회·추가·수정·삭제를 웹 경로로 부르고 공식 응답 모양으로 돌려준다.

**범위 외**: 첨부(phase 03), 지원 목록과 가이드.

## 컨텍스트

**요구사항**: REQ6, REQ7

**근거 문서**: `docs/api/web-endpoints/wiki.md`

## 작업 항목

### 1. 페이지 쓰기

- `createWikiPage` → `POST /v2/wapi/wikis/{wikiId}/pages`, 요청 본문은 공개 API 와 같다. 응답의 `pageId` 를 `id` 로 바꾼다
- `updateWikiPage` → `PUT …/pages/{pageId}`. 웹은 `subject` 와 `body` 를 둘 다 요구한다. 공개 클라이언트의 `UpdateWikiPageRequest` 는 둘 다 선택이라, 하나가 빠진 호출은 API 를 부르지 않고 `EXIT_PARAM_ERROR` 로 막는다(지금 CLI 명령은 둘을 항상 같이 보낸다)
- `updateWikiPageTitle`, `updateWikiPageContent` → `PUT …/title`, `PUT …/content`. 응답 객체는 버리고 `result: null` 로 돌려준다
- `deleteWikiPage` → `DELETE …/pages/{pageId}`
- `moveWikiPage` → `POST …/pages/{pageId}/move`. 값은 요청 본문이 아니라 **쿼리**다: `targetParentPageId`, `beforePageId`(`--first` 는 `0`), `withChildren=false`(`--no-children`일 때만). `targetWikiId` 는 보내지 않는다. 본문에 담은 `targetWikiId` 가 오면 지원하지 않음 오류로 막는다(phase 03 의 지원 목록과 같은 이유)
- 본문 `mimeType` 이 `text/x-markdown` 이 아니면 API 를 부르지 않고 `EXIT_PARAM_ERROR`(웹 방식 미지원 안내). 웹이 400 을 주기 전에 막는다

### 2. 댓글

- `addWikiPageComment` → `POST …/comments`, 요청 본문 `{ body: { content, mimeType: "text/x-markdown" }, attachFileIds: [] }`. 응답 `pageCommentId` 를 `id` 로
- `updateWikiPageComment` → `PUT …/comments/{commentId}` 본문 `{ body: { content, mimeType: "text/x-markdown" }, attachFileIds: [] }`. 기존 댓글의 `mimeType` 이 markdown 이 아니면 서버가 거절한다. 그대로 서버 메시지로 끝낸다
- `deleteWikiPageComment` → `DELETE …/comments/{commentId}`
- `getWikiPageComment` → `GET …/comments/{commentId}`, `result.content` 를 공식 모양으로
- `getWikiPageComments` → `GET …/comments?size=(page+1)*size`. 웹은 `page` 를 무시하고 최근 N개를 오래된 것부터 준다. 받은 배열을 뒤집어 `page*size` 번째부터 `size` 개를 자르고 `totalCount` 는 `result.totalCount`. 호출하는 쪽(`list`, `latest`, `--latest`)이 쓰는 최신순이 지켜지는지 테스트로 본다. 요청 크기가 1000 을 넘으면 `EXIT_PARAM_ERROR`(실측은 1000 까지)

### 3. 변환 함수

`docs/api/web-endpoints/wiki.md` 의 표를 따른다. 댓글은 `creator` 를 `{ type: "member", member: { organizationMemberId, name } }` 로, `pageId` 를 `page.id` 로 바꾼다.

### 4. `src/api/wiki/web.test.ts` (쓰기·댓글 부분)

| 대상 | 확인 |
| --- | --- |
| 이동 쿼리 | `--first` 는 `beforePageId=0`, `--no-children` 은 `withChildren=false`, 기본은 둘 다 없고, 요청 본문이 비어 있다. `targetWikiId` 를 받으면 API 호출 전에 오류 |
| 수정 전제 | `subject` 만, `body` 만 주면 호출 없이 `EXIT_PARAM_ERROR`. 둘 다 있으면 `PUT` |
| 형식 | `text/html` 본문은 호출 없이 오류 |
| 응답 | 수정·이동·삭제가 `result: null`, 생성은 `{ id, wikiId, parentPageId, version }` |
| 댓글 목록 | 가짜 응답이 오래된 것부터 3개일 때 `page: 0, size: 2` 는 최신 2개를 최신순으로, `page: 1, size: 2` 는 나머지 하나. `totalCount` 유지 |
| 댓글 쓰기 | 요청 본문에 `attachFileIds: []` 와 `mimeType` 이 있다 |

## 검증

```bash
# cwd: 저장소 루트
pnpm test src/api/wiki
pnpm tsc --noEmit
node scripts/check-pii.mjs
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/api/wiki/web.ts` | 수정 |
| `src/api/wiki/web.test.ts` | 수정 |
| `src/api/wiki/fixtures/*.json` | 신규 |
