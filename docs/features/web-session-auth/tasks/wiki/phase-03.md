# Phase 03. 첨부와 지원 목록을 붙이고 웹으로 돌려 확인한다

**Execution profile**: standard

## 목표

첨부 업로드·다운로드·삭제를 웹 경로에 붙이고, 지원하지 않는 명령·옵션을 호출 전에 막고, 실제 웹으로 wiki 명령을 돌려 확인한다.

**범위 외**: 다른 영역의 웹 메서드, 머지·배포·릴리스.

## 컨텍스트

**요구사항**: REQ6, REQ7, REQ8

**근거 문서**: `docs/api/web-endpoints/wiki.md`, `docs/features/web-session-auth/design.md` 「웹 HTTP 층」 「지원 범위 막기」

## 작업 항목

### 1. 업로드

`POST …/pages/{pageId}/files` 에 `type` 필드를 먼저, `file` 을 나중에 담은 multipart 를 보낸다(공개 클라이언트의 `buildFormData` 와 같은 순서). 응답은 `{ id, attachFileId, name, mimeType, type, size, createdAt }` 로 바꾼다. 307 은 오지 않았지만 설계 「웹 HTTP 층」 의 규칙(같은 클라우드 도메인으로 한 번, `redirect: "manual"`)을 그대로 받는다.

### 2. 다운로드·삭제

- 경로에 페이지 id 가 없다. 둘 다 먼저 `getWikiPage` 로 `files[]`·`images[]` 에 `fileId` 가 있는지 확인하고, 없으면 API 를 더 부르지 않고 `EXIT_PARAM_ERROR`(페이지에 없는 파일). 다른 페이지의 파일을 지우지 않게 하는 확인이다
- 다운로드는 그 항목의 `downloadUrl`(`/page-files/{fileId}`)을 부른다. 웹 HTTP 층이 같은 호스트로만 쿠키를 붙인다
- 삭제는 `DELETE /v2/wapi/wikis/{wikiId}/page-files/{fileId}`
- 파일 이름 대체 값(`knownName`)은 확인에 쓴 페이지 상세에서 얻어 `getWikiPage` 를 한 번 더 부르지 않는다
- 내부 `downloadUrl` 은 변환 결과에 넣지 않는다. 웹 클래스 안에서만 쓴다

### 3. 지원 목록

`src/commands/web-support/wiki.ts` 에 이 영역 명령 경로를 더하고 미지원 옵션을 적는다.

| 명령·옵션 | 처리 |
| --- | --- |
| `wiki list`, `pages`, `tree`, `page get/create/edit/replace/move/delete`, `page file list/upload/download/download-all/delete`, `page comment list/latest/get/add/edit/delete` | 지원 |
| `wiki page edit --mime-type` 의 값이 `text/x-markdown` 이 아닌 경우 | `EXIT_PARAM_ERROR` + 「웹 방식에서는 지원하지 않습니다. auth-mode 를 api-key 로 바꾸세요」 |
| `wiki page move --to-wiki` | 같은 안내 |

가이드(`docs/guide/…` 의 「웹 방식에서 지원하지 않는 명령·옵션」 표)에 같은 두 줄을 더한다. PR1 의 vitest 가 문서 표와 목록이 같은지 보므로 형식을 그 표에 맞춘다.

### 4. CLI 로 웹 실측

임시 HOME(`mktemp -d`)에 stdin 으로 쿠키를 넣고 이 영역 명령을 웹 방식으로 돌린다. 쓰기는 허용된 `<project>` 위키의 `[cli-web-probe]` 로 시작하는 페이지에서만 한다. 쿠키 값과 19자리 id 는 출력에 남기지 않는다.

1. `wiki list --json`, `wiki pages`, `wiki tree` 의 `--json` 을 공식 문서 스키마와 대조
2. 페이지 생성 → `page get --json` → `edit`(제목, 본문, 둘 다) → `replace` → `move`(`--parent`, `--first`, `--before`, `--no-children`) → 첨부 `upload`·`list`·`download`·`download-all`·`delete` → 댓글 `add`·`list`·`latest`·`get`·`edit`·`delete` → 페이지 `delete`
3. 지원하지 않는 옵션 두 개가 API 를 부르지 않고 종료 코드 3 으로 끝나는지
4. 끝에 `[cli-web-probe]` 페이지가 남지 않았는지, 임시 HOME 과 그 HOME 이 만든 키체인 항목을 지우고 `find-generic-password` 가 44 인지 확인한다

만든 것과 지운 것(가짜 이름)을 PR 본문에 적는다.

### 5. `src/api/wiki/web.test.ts`, `src/commands/web-support/wiki.test.ts` (첨부·지원 목록)

| 대상 | 확인 |
| --- | --- |
| 업로드 | multipart 의 `type` 이 `file` 보다 앞이다. 응답에 `pageFileId`·`extension` 이 없다 |
| 다운로드 | 요청이 상세 조회 다음 `downloadUrl` 순서이고, 상세에 없는 `fileId` 는 호출 없이 오류. 파일 이름은 `content-disposition`, 없으면 상세의 이름 |
| 삭제 | 상세 확인 뒤 `page-files` 경로로 나간다. 상세에 없는 `fileId` 는 호출 없이 오류 |
| 지원 목록 | 위 표의 경로가 모두 지원이고, 두 옵션이 미지원이며, 가이드 표와 같다 |

## 검증

```bash
# cwd: 저장소 루트
pnpm test
pnpm tsc --noEmit
pnpm run build
pnpm api:inventory
pnpm verify:package
node scripts/check-pii.mjs
node scripts/check-public-refs.mjs
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/api/wiki/web.ts` | 수정 |
| `src/api/wiki/web.test.ts` | 수정 |
| `src/commands/web-support/wiki.ts` | 신규 |
| `src/commands/web-support/wiki.test.ts` | 신규 |
| `docs/guide/` 의 웹 방식 가이드 표 | 수정 |
| `docs/api/web-endpoints/wiki.md` | 수정(CLI 실측 결과 보강) |
