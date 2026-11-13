# Phase 01. 위키 읽기 메서드를 웹 응답에서 공식 모양으로 바꾼다

**Execution profile**: standard

## 목표

`WikiClient` 의 읽기 메서드(`getWikis`, `getWikiPages`, `getAllWikiPages`, `getWikiPage`, `getWikiPageStandalone`)를 웹 경로로 부르고 공식 응답 스키마 모양으로 돌려준다.

**범위 외**: 쓰기·첨부·댓글(phase 02·03), 지원 목록과 가이드.

## 컨텍스트

**요구사항**: REQ6

**근거 문서**: `docs/features/web-session-auth/spec.md`, `docs/features/web-session-auth/design.md`, `docs/api/web-endpoints/wiki.md`

**전제**: PR1 이 머지돼 `src/api/wiki/types.ts` 의 `WikiClient`, `src/api/web/index.ts`, `src/api/web-http.ts` 가 main 에 있다. 구조가 이 plan 과 다르면 이 phase 시작 때 plan 을 맞춘다.

## 작업 항목

### 1. `src/api/wiki/web.ts` 에 `WikiClient` 를 구현하는 웹 클래스를 만든다. `Pick<…>` 이름 나열 대신 인터페이스를 직접 구현한다. 이 phase 에서 붙이지 않은 메서드는 지원하지 않음 오류를 던진다.
### 2. 변환 함수를 메서드 아래에 둔다. 규칙은 `docs/api/web-endpoints/wiki.md` 의 「공식 응답 필드와 변환」 이 소유한다.
- 위키 목록: `result.contents` 와 `result.totalCount` 를 공식 `result[]` 와 위쪽 `totalCount` 로. `projectId` → `project.id`, `home` 은 `pageId` 만
- 페이지 목록: `pageId` → `id`, `createOrganizationMemberId` → `creator`, 홈의 `parentPageId: null` 은 키를 뺀다
- 페이지 상세: `create`/`lastUpdate` → `createdAt`/`creator`/`updatedAt`, 참조자·작성자는 `organizationMemberId` 만, `files[]`·`images[]` 는 `id`·`name`·`size`·`attachFileId` 만. 내부 `downloadUrl` 은 결과에 넣지 않는다
- 필수 필드가 없으면 `EXIT_API_ERROR`
### 3. `getWikis` 는 `page`·`size` 를 그대로 보낸다(웹이 페이지를 넘긴다). `getWikiPages` 는 `parentPageId` 만 보낸다(웹은 `page`·`size` 를 무시한다). 목록 루프(`fetchAllWikis`)가 같은 페이지를 거듭 받지 않는지 테스트로 본다.
### 4. `getAllWikiPages` 는 공개 클라이언트의 폭 우선 순회(레벨당 동시 10개)를 웹 클래스가 `getWikiPages` 위에 같은 규칙으로 다시 구현한다. 위키가 크면 호출이 늘고 웹 호출 한도(토큰 버킷)에 묶인다. 이 호출 수를 PR 본문 「결정」 에 적는다.
### 5. `getWikiPageStandalone` 은 `GET /v2/wapi/pages/{pageId}` 로 `wikiId` 를 얻은 뒤 `getWikiPage` 로 상세를 만든다. 두 호출 사이에 페이지가 지워지면 `getWikiPage` 의 오류를 그대로 낸다.
### 6. 고정 응답 파일을 `src/api/wiki/fixtures/` 에 직접 쓴다. 실측 응답을 저장하지 않고 꼴만 본뜬다(값은 가짜, 19자리 id 는 `100…` 꼴의 가짜). `node scripts/check-pii.mjs` 를 통과해야 한다.

### 7. `src/api/wiki/web.test.ts` (읽기 부분)

ky 에 가짜 `fetch` 를 넣는다(PR1 의 `web-http.test.ts` 와 같은 방식). 확인할 것:

| 대상 | 확인 |
| --- | --- |
| 키와 구조 | 변환 결과가 공식 문서 스키마의 필드 목록과 같다. 웹 전용 필드(`contentId`, `hasChildren`, `order` 등)가 없다 |
| 날짜·id | 날짜는 오프셋을 단 ISO 8601, 19자리 id 는 문자열 |
| 홈 페이지 | `parentPageId` 키가 없다 |
| 페이지 넘기기 | `getWikis({ page: 1, size: 1 })` 가 쿼리를 보내고, `getWikiPages` 는 `page`·`size` 를 보내지 않는다 |
| 필수 필드 | `pageId` 나 `wikiId` 가 빠진 응답은 `EXIT_API_ERROR` |
| 단독 조회 | 요청이 `/v2/wapi/pages/{pageId}` 다음 `/v2/wapi/wikis/{wikiId}/pages/{pageId}` 순서로 나간다 |
| 순회 | `getAllWikiPages(wikiId, maxDepth)` 가 깊이 상한을 지키고 레벨 안 순서를 보존한다 |

## 검증

```bash
# cwd: 저장소 루트
pnpm test src/api/wiki
pnpm tsc --noEmit
node scripts/check-pii.mjs
node scripts/check-public-refs.mjs
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/api/wiki/web.ts` | 신규 |
| `src/api/wiki/web.test.ts` | 신규 |
| `src/api/wiki/fixtures/*.json` | 신규 |
| `src/api/web/index.ts` | 수정(위키 영역 기본값을 이 구현으로 바꾸는 한 줄) |
