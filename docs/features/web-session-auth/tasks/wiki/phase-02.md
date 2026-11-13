# Phase 02. 페이지 쓰기와 댓글을 웹 경로에 붙인다

**Execution profile**: standard

## 목표

페이지 생성·수정·이동·삭제와 댓글 조회·추가·수정·삭제를 웹 경로로 부르고 공식 응답 모양으로 돌려준다. 공식 API 가 409 로 거절하는 제목 중복도 같은 결과로 맞춘다.

**범위 외**: 첨부(phase 03), 지원 목록.

## 컨텍스트

**요구사항**: REQ6, REQ7

**근거 문서**: `docs/api/web-endpoints/wiki.md`

## 작업 항목

### 1. 페이지 쓰기

- `createWikiPage` → `POST /v2/wapi/wikis/{wikiId}/pages`, 요청 본문은 공개 API 와 같다. 응답의 `pageId` 를 `id` 로 바꾼다
- `updateWikiPage` → `PUT …/pages/{pageId}`. 웹은 `subject` 와 `body` 를 둘 다 요구한다. 하나가 빠진 호출은 API 를 부르지 않고 `EXIT_PARAM_ERROR` 로 막는다(지금 CLI 명령은 둘을 항상 같이 보낸다)
- `updateWikiPageTitle`, `updateWikiPageContent` → `PUT …/title`, `PUT …/content`. 응답 객체는 버리고 `result: null` 로 돌려준다
- `deleteWikiPage` → `DELETE …/pages/{pageId}`. 웹은 자식을 지우지 않고 지운 페이지의 부모 아래로 올린다는 점을 가이드 「위키」 절에 적는다
- `moveWikiPage` → `POST …/pages/{pageId}/move`. 값은 요청 본문이 아니라 **쿼리**다: `targetParentPageId`, `beforePageId`(`--first` 는 `0`), `withChildren=false`(`--no-children` 일 때만). `targetWikiId` 는 보내지 않는다. 요청의 `targetWikiId` 가 오면 웹이 다른 위키로 보낼 수 없으므로 API 를 부르지 않고 `EXIT_PARAM_ERROR`(웹 방식 안내)로 막는다
- **본문 형식**: `body.mimeType` 이 `text/x-markdown` 이 아니면 쓰기 전에 API 를 부르지 않고 `EXIT_PARAM_ERROR`(웹 방식 안내)로 끝낸다. 웹이 400 으로 거절하는 형식이다. `--mime-type` 옵션 자체는 명령 단계(phase 03)에서 막고, 이 검사는 기존 페이지의 형식을 보존해 보내는 경로의 안전판이다

### 2. 제목 중복

공식 API 는 같은 제목을 409 로 거절하지만 웹은 같은 부모 아래에서 ` (1)` 을 붙여 저장한다. 조용히 다른 결과를 내지 않기 위해(스펙 DECISION7) 웹 방식은 쓰기 전에 확인한다.

- 대상: `createWikiPage`(부모는 요청의 `parentPageId`), `updateWikiPage`·`updateWikiPageTitle`(부모와 현재 제목은 `getWikiPage` 로 얻고 제목이 그대로면 검사하지 않는다), `moveWikiPage`(옮길 페이지의 제목은 `getWikiPage` 로, 대상 부모는 요청의 `targetParentPageId`. 같은 부모 안의 순서 바꾸기는 자기 자신을 뺀다)
- 확인: `getWikiPages(wikiId, 부모)` 의 형제 중 제목이 **같은** 다른 페이지가 있으면 쓰기를 부르지 않고 `EXIT_API_ERROR`(1)와 「같은 위치에 같은 제목의 페이지가 있습니다」 로 끝낸다(공식 API 의 409 와 같은 뜻, 같은 종료 코드)
- 다른 부모 아래의 같은 제목은 막지 않는다(웹도 그대로 둔다)
- 같은 제목끼리 비교는 정확히 같은 문자열이다. 대소문자·공백 처리는 실측하지 않았다
- 호출이 늘어난다(쓰기 하나당 형제 목록 한 번, 필요하면 페이지 상세 한 번). 이 수를 PR 본문 「결정」 에 적는다

### 3. 댓글

- `addWikiPageComment` → `POST …/comments`, 요청 본문 `{ body: { content, mimeType: "text/x-markdown" }, attachFileIds: [] }`. 응답 `pageCommentId` 를 `id` 로
- `updateWikiPageComment` → `PUT …/comments/{commentId}` 본문 `{ body: { content, mimeType: "text/x-markdown" }, attachFileIds: [] }`
- `deleteWikiPageComment` → `DELETE …/comments/{commentId}`
- `getWikiPageComment` → `GET …/comments/{commentId}`, `result.content` 를 공식 모양으로
- `getWikiPageComments` → `GET …/comments?size=(page+1)*size`. 웹은 `page` 를 무시하고 최근 N개를 오래된 것부터 준다. 받은 배열을 뒤집어 `page*size` 번째부터 `size` 개를 자르고 `totalCount` 는 `result.totalCount`. 인자가 없으면 공식 기본값(`page` 0, `size` 20)이다. 요청 크기가 1000 을 넘으면 `EXIT_PARAM_ERROR`. 1000 은 확인한 값이지 서버 최대치가 아니므로 가이드 「위키」 절의 제한 목록에 적는다

### 4. 변환 함수

`docs/api/web-endpoints/wiki.md` 의 표를 따른다. 댓글은 `creator` 를 `{ type: "member", member: { organizationMemberId, name } }` 로, `pageId` 를 `page.id` 로 바꾼다.

### 5. 공식 문서와 어긋난 서술을 바로잡는다

`attachFileId` 는 공식 문서의 첨부 가이드가 `$.result.files[].attachFileId` 를 말하고 단독 조회 예시에도 있다. `src/api/types.ts` 의 `WikiPageFile.attachFileId` 주석(「공식 문서의 페이지 조회 응답에 없는 필드」)이 틀렸으므로 그 한 곳만 고친다(ADR-046). `docs/api/web-endpoints/wiki.md` 에 이미 맞게 적었다.

### 6. `src/api/wiki/web.test.ts` (쓰기·댓글 부분)

| 대상 | 확인 |
| --- | --- |
| 이동 쿼리 | `--first` 는 `beforePageId=0`, `--no-children` 은 `withChildren=false`, 기본은 둘 다 없고, 요청 본문이 비어 있다. `targetWikiId` 를 받으면 API 호출 전에 오류 |
| 수정 전제 | `subject` 만, `body` 만 주면 호출 없이 `EXIT_PARAM_ERROR`. 둘 다 있으면 `PUT` |
| 형식 | `text/html` 본문은 호출 없이 `EXIT_PARAM_ERROR` |
| 제목 중복 | 생성·제목 수정·이동에서 같은 부모에 같은 제목이 있으면 쓰기 호출 없이 종료 코드 1, 다른 부모는 통과, 제목이 그대로인 수정과 같은 부모 안 순서 바꾸기는 통과 |
| 응답 | 수정·이동·삭제가 `result: null`, 생성은 `{ id, wikiId, parentPageId, version }` |
| 댓글 목록 | 요청 쿼리가 `size=(page+1)*size` 이고, 가짜 응답은 최근 N개만 오래된 것부터 준다. `page: 0, size: 2` 는 최신 2개를 최신순으로, `page: 1, size: 2` 는 그다음 2개. `totalCount` 유지. 인자 없음은 `page: 0, size: 20`. 1000 초과는 호출 없이 오류 |
| 댓글 쓰기 | 요청 본문에 `attachFileIds: []` 와 `mimeType` 이 있다 |

## 검증

```bash
# cwd: 저장소 루트
pnpm test
pnpm tsc --noEmit
node scripts/check-pii.mjs
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/api/wiki/web.ts` | 수정 |
| `src/api/wiki/web.test.ts` | 수정 |
| `src/api/web/fixtures/wiki/responses.json` | 수정 |
| `src/api/types.ts` | 수정(주석 한 곳) |
| `docs/guide/setup.md` | 수정(「위키」 절만) |
