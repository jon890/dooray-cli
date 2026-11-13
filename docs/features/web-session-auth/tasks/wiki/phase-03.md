# Phase 03. 첨부와 지원 목록을 붙이고 웹으로 돌려 확인한다

**Execution profile**: standard

## 목표

첨부 업로드·다운로드·삭제를 웹 경로에 붙이고, 지원하지 않는 명령·옵션을 호출 전에 막고, 실제 웹으로 wiki 명령을 돌려 확인한다.

**범위 외**: 다른 영역의 웹 메서드, 머지·배포·릴리스.

## 컨텍스트

**요구사항**: REQ4, REQ6, REQ7, REQ8, REQ17

**근거 문서**: `docs/api/web-endpoints/wiki.md`, `docs/features/web-session-auth/design.md` 「웹 HTTP 층」 「지원 범위 막기」

## 작업 항목

### 1. 업로드

PR1 이 만든 multipart 업로드 helper 로 `POST …/pages/{pageId}/files` 에 `type` 필드를 먼저, `file` 을 나중에 담아 보낸다(공개 클라이언트의 `buildFormData` 와 같은 순서). 응답은 `{ id, attachFileId, name, mimeType, type, size, createdAt }` 로 바꾼다. 307 은 오지 않았지만 설계 「웹 HTTP 층」 의 규칙(PR1 의 307 helper 와 공개 API 주소 전달)을 그대로 받는다.

### 2. 다운로드·삭제

- 경로에 페이지 id 가 없다. 둘 다 먼저 페이지 상세로 `files[]`·`images[]` 에 `fileId` 가 있는지 확인하고, 없으면 api-key 방식과 같이 `EXIT_API_ERROR`(1)로 끝낸다(「페이지에 없는 파일」). 다른 페이지의 파일을 지우지 않게 하는 확인이다
- 다운로드 요청 경로는 응답의 `downloadUrl` 문자열이 아니라 `apiPath` 와 `fileId` 로 `/page-files/{fileId}` 를 만든다
- 저장 이름은 `Content-Disposition` 을 `src/utils/content-disposition.ts` 의 `parseContentDispositionFileName`·`fallbackFileName`(ADR-067)으로 풀어 정한다. 대체 이름은 확인에 쓴 페이지 상세의 파일 이름이다
- 삭제는 `DELETE /v2/wapi/wikis/{wikiId}/page-files/{fileId}`
- `download-all` 이 파일마다 페이지 상세를 다시 읽으면 호출이 `1 + 2N` 이 된다. `createWikiWeb` 안에 이번 실행만 쓰는 페이지 상세 캐시를 두고(`WebContext` 는 고치지 않는다), 같은 페이지에 쓰는 호출(업로드, 파일 삭제, 수정, 이동, 페이지 삭제)이 그 항목을 비운다
- 내부 `downloadUrl` 은 변환 결과에 넣지 않는다

### 3. 지원 목록

PR1 이 만든 `src/commands/web-support/wiki.ts` 에 이 영역 명령 경로를 더하고 미지원 옵션을 적는다. 이름과 꼴은 PR1 머지 뒤 main 에서 확인한다.

| 명령·옵션 | 처리 |
| --- | --- |
| `wiki list`, `pages`, `tree`, `page get/create/edit/replace/move/delete`, `page file list/upload/download/download-all/delete`, `page comment list/latest/get/add/edit/delete` | 지원 |
| `wiki page edit --mime-type` | **옵션 전체**를 `["mimeType"]` 로 막는다. 값 조건으로 막으면 `page-edit.ts` 가 `getWikiPage` 를 먼저 불러 REQ8 의 「API 를 부르지 않고」 를 어긴다 |
| `wiki page move --to-wiki` | `["toWiki"]`. 「실측하지 못해 막는다」 |

「웹 방식의 지원 범위」 「위키」 절의 표는 위 두 줄을 같은 꼴로 쓴다. PR1 의 vitest 가 문서 표와 목록이 같은지 본다. PR 본문 「결정」 에 `--to-wiki` 를 막은 이유(허용된 실측 장소에 위키가 하나뿐)를 적는다.

### 4. CLI 로 웹 실측

임시 HOME(`mktemp -d`)에 `auth-mode web`, `tenant-name`, `base-url` 을 `dooray config set` 으로 넣고 쿠키는 stdin 으로(`config set session-cookie -`) 넣는다. 허용된 실측 장소(`<project>` 와 그 위키)를 받지 못했거나 `getMe` 가 실패하면 멈추고 ask 로 알린다. 쓰기는 그 위키의 `[cli-web-probe]` 로 시작하는 페이지에서만 한다. 쿠키 값과 19자리 id 는 출력에 남기지 않는다. 호출은 1초에 한 번을 넘기지 않는다.

1. `wiki list --json`, `wiki pages`, `wiki tree` 의 `--json` 을 공식 문서 스키마와 대조
2. 프로브 부모 페이지 하나를 만들고 그 아래에서만 쓴다: 자식 페이지 생성 → `page get --json` → `edit`(제목, 본문, 둘 다) → `replace` → `move`(`--parent`·`--before` 의 대상은 프로브 페이지로 한정, `--first` 는 프로브 부모 아래의 첫 자리, `--no-children`) → 첨부 `upload`·`list`·`download`·`download-all`·`delete` → 댓글 `add`·`list`·`latest`·`get`·`edit`·`delete` → 제목 중복 생성이 종료 코드 1 로 끝나는지 → 프로브 페이지 `delete`. 기존 페이지의 순서나 위치를 바꾸지 않는다
3. 지원하지 않는 옵션 둘(`--mime-type`, `--to-wiki`)이 API 를 부르지 않고 종료 코드 3 으로 끝나는지
4. 끝에 `[cli-web-probe]` 페이지가 남지 않았는지 확인한다
5. 정리: 임시 HOME 을 지우고, 그 HOME 이 만든 키체인 항목을 `security delete-generic-password -s dooray-cli -a sessionCookie:<임시 HOME 의 config 경로 해시>` 로 지운 뒤 같은 인자의 `find-generic-password` 가 종료 코드 44 인지 본다(해시는 `src/config/secret-store.ts` 의 `keychainAccount` 규칙: 경로 sha256 앞 16자)

만든 것과 지운 것(가짜 이름), 웹 방식으로 돌린 명령 목록을 PR 본문에 적는다.

### 5. `src/api/wiki/web.test.ts`, `src/commands/web-support/wiki.test.ts` (첨부·지원 목록)

| 대상 | 확인 |
| --- | --- |
| 업로드 | multipart 의 `type` 이 `file` 보다 앞이다. 응답에 `pageFileId`·`extension` 이 없다. 성공한다(REQ4 의 업로드) |
| 다운로드 | 요청이 상세 조회 다음 `/page-files/{fileId}`(응답의 `downloadUrl` 이 아니라 `apiPath` 로 만든 경로)이고, 쿠키는 허용 origin 에만 붙는다. 파일 이름은 `Content-Disposition`, 없으면 상세의 이름. `../` 가 든 이름은 저장 이름에서 경로가 떨어진다. 상세에 없는 `fileId` 는 호출 없이 종료 코드 1. 성공한다(REQ4 의 다운로드) |
| 삭제 | 상세 확인 뒤 `page-files` 경로로 나간다. 상세에 없는 `fileId` 는 호출 없이 종료 코드 1 |
| 캐시 | `download-all` 이 페이지 상세를 한 번만 읽고, 업로드·삭제 뒤에는 다시 읽는다 |
| 지원 목록 | 위 표의 경로가 모두 지원이고 두 옵션이 미지원이며, `wiki page edit --mime-type text/x-markdown` 도 API 호출 없이 막히고, 가이드 표와 같다(REQ8, REQ17) |

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
| `src/commands/web-support/wiki.ts` | 수정(PR1 이 만든 빈 목록) |
| `src/commands/web-support/wiki.test.ts` | 신규(PR1 의 `web-support.test.ts` 가 영역 이름을 박지 않고 있으면 그쪽에 더하지 않는다) |
| `docs/guide/setup.md` | 수정(「위키」 절만) |
| `docs/api/web-endpoints/wiki.md` | 수정(CLI 실측 결과 보강) |
