# Phase 01. 위키 읽기 메서드를 웹 응답에서 공식 모양으로 바꾼다

**Execution profile**: standard

## 목표

`WikiClient` 의 읽기 메서드(`getWikis`, `getWikiPages`, `getAllWikiPages`, `getWikiPage`, `getWikiPageStandalone`)를 웹 경로로 부르고 공식 응답 스키마 모양으로 돌려준다.

**범위 외**: 쓰기·첨부·댓글(phase 02·03), 지원 목록.

## 컨텍스트

**요구사항**: REQ6

**근거 문서**: `docs/features/web-session-auth/spec.md`, `docs/features/web-session-auth/design.md`, `docs/api/web-endpoints/wiki.md`

**전제(PR1 이 만든다)**: `src/api/wiki/types.ts` 의 `WikiClient`, `src/api/web/context.ts` 의 `WebContext`, `src/api/web/convert.ts` 의 변환 helper(`row`, `rows`, `identifier`, `text`, `count`, `pick`, `date`, `invalidResponse`), `src/api/web/index.ts` 의 영역 조립, `src/commands/web-support/wiki.ts` 의 빈 목록과 `web-support.ts` 의 펼치기, `docs/guide/setup.md` 의 「웹 방식의 지원 범위」 「위키」 절, `docs/api/web-endpoints.md` 의 색인 줄, 첨부 전송 기반(바이트 응답, multipart 업로드, 307 helper). 정확한 이름은 PR1 머지 뒤 main 에서 확인하고 이 plan 과 다르면 이 phase 시작 때 plan 을 맞춘다.

## 작업 항목

### 1. `src/api/wiki/web.ts` 에 `createWikiWeb(context: WebContext): WikiClient` 를 만든다. 반환하는 것은 객체 리터럴이다. `src/api/web/index.ts` 의 위키 자리는 `WikiClient` 전체를 요구하므로 `tsc` 가 통과하려면 이 phase 와 phase 02 에서 아직 붙이지 않은 메서드도 자리가 있어야 한다. 그 메서드는 "웹 방식에서는 지원하지 않습니다. auth-mode 를 api-key 로 바꾸세요."(`EXIT_PARAM_ERROR`)를 던지는 임시 자리로 두고 phase 03 에서 모두 없앤다(PR 에 남기지 않는다). 변환은 `src/api/web/convert.ts` 의 helper 를 쓰고, 위키에만 쓰는 변환은 `web.ts` 안에 둔다. 공용 파일은 고치지 않는다.
### 2. 변환 규칙은 `docs/api/web-endpoints/wiki.md` 의 「공식 응답 필드와 변환」 이 소유한다.
- 위키 목록: `result.contents`·`totalCount` 를 공식 `result[]`·위쪽 `totalCount` 로. 필수: `id`, `name`, `project.id`, `home.pageId`, `totalCount`(`resolvers/wiki.ts` 가 쓴다)
- 페이지 목록: `pageId` → `id`, `createOrganizationMemberId` → `creator`, 홈의 `parentPageId: null` 은 키를 뺀다
- 페이지 상세: `create`/`lastUpdate` → `createdAt`/`creator`/`updatedAt`, 참조자·작성자는 `organizationMemberId` 만, `files[]`·`images[]` 는 `id`·`name`·`size`·`attachFileId` 만. 첨부 항목의 `downloadUrl` 은 결과에 넣지 않는다
- 필수 필드가 없으면 `EXIT_API_ERROR`(`invalidResponse()`)
### 3. `getWikis` 는 `page`·`size` 를 그대로 보낸다(웹이 페이지를 넘긴다). `fetchAllWikis`(`resolvers/wiki.ts`)가 `totalCount` 로 루프를 끝내므로 변환은 위쪽 `totalCount` 를 반드시 채운다. `getWikiPages` 는 `parentPageId` 만 보낸다(웹은 `page`·`size` 를 무시한다).
### 4. `getAllWikiPages` 는 폭 우선 순회(레벨당 동시 10개, 깊이 상한, 레벨 안 순서 보존)를 웹 클래스가 `getWikiPages` 위에 같은 규칙으로 구현한다. 한 번에 받는 트리 경로가 없어 위키가 크면 호출이 늘고 웹 호출 한도(토큰 버킷)에 묶인다. 이 호출 수를 PR 본문 「결정」 에 적는다.
### 5. `getWikiPageStandalone` 은 `GET /v2/wapi/pages/{pageId}` 로 `wikiId` 를 얻은 뒤 `getWikiPage` 로 상세를 만든다. 두 호출 사이에 페이지가 지워지면 `getWikiPage` 의 오류를 그대로 낸다.
### 6. 고정 응답 파일은 `src/api/web/fixtures/wiki/responses.json` 에 직접 쓴다. 실측 응답을 저장하지 않고 꼴만 본뜬다(값은 가짜, id 는 가짜 숫자 문자열). `node scripts/check-pii.mjs` 를 통과해야 한다.
### 7. `src/api/web/index.ts` 는 위키 영역의 「지원하지 않음」 기본값을 이 구현으로 바꾸는 한 줄(과 import 한 줄)만 고친다.
### 8. 위키 응답 변환에서 빠지는 필드(작성자 이름 열 등)와 `getAllWikiPages` 호출 수를 `docs/guide/setup.md` 의 `#### 웹 응답에서 빠질 수 있는 필드` 아래 위키 줄에 적는다. 다른 영역 줄과 절은 고치지 않는다.

### 9. `src/api/wiki/web.test.ts` (읽기 부분)

`vi.stubGlobal("fetch")` 로 가짜 응답을 넣는다(PR1 의 `src/api/web/http.test.ts` 와 영역 테스트와 같은 방식).

| 대상 | 확인 |
| --- | --- |
| 키와 구조 | 변환 결과가 공식 문서 스키마의 필드 목록과 같다. 웹 전용 필드(`contentId`, `hasChildren`, `order` 등)가 없다 |
| 날짜·id | 날짜는 오프셋을 단 ISO 8601, 19자리 id 는 문자열 |
| 홈 페이지 | `parentPageId` 키가 없다 |
| 페이지 넘기기 | `getWikis({ page: 1, size: 1 })` 가 쿼리를 보내고, `getWikiPages` 는 `page`·`size` 를 보내지 않는다 |
| 필수 필드 | 위키 목록의 `name`·`project.id`·`home.pageId`·`totalCount`, 페이지의 `pageId`·`wikiId` 가 빠진 응답은 `EXIT_API_ERROR` |
| 위키 목록 루프 | `fetchAllWikis` 가 `page` 를 올리며 `totalCount` 에서 멈추고 같은 페이지를 거듭 받지 않는다(`resolvers/wiki.ts` 의 루프 테스트를 웹 변환 결과로 되살린다) |
| 단독 조회 | 요청이 `/v2/wapi/pages/{pageId}` 다음 `/v2/wapi/wikis/{wikiId}/pages/{pageId}` 순서로 나간다 |
| 순회 | `getAllWikiPages(wikiId, maxDepth)` 가 깊이 상한을 지키고 레벨 안 순서를 보존한다 |
| 프로젝트 id | `--url` 입력처럼 프로젝트 id 가 `wikiId` 자리에 들어와도 같은 경로로 부른다 |

## 검증

```bash
# cwd: 저장소 루트
pnpm test
pnpm tsc --noEmit
node scripts/check-pii.mjs
node scripts/check-public-refs.mjs
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/api/wiki/web.ts` | 신규 |
| `src/api/wiki/web.test.ts` | 신규 |
| `src/api/web/fixtures/wiki/responses.json` | 신규 |
| `src/api/web/index.ts` | 수정(위키 영역 한 줄) |
| `docs/guide/setup.md` | 수정(`#### 웹 응답에서 빠질 수 있는 필드` 아래 위키 줄만) |
