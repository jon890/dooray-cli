# 웹 로그인 세션 API 확인 기록: wiki

PR3(wiki 명령)의 경로다. 인증·보안 규칙은 [기술 설계](../../features/web-session-auth/design.md)가 소유한다.
공통 규칙과 영역 색인은 [web-endpoints.md](../web-endpoints.md)에, 프로젝트·멤버 경로는 [project.md](project.md)·[member.md](member.md)에 있다.

2026-11-14 로그인된 브라우저에서 읽은 `SESSION` 하나만 붙인 Node 요청(1초에 한 번 이하)으로 확인했다.
이 문서의 어떤 경로도 `SESSION` 밖의 쿠키나 추가 헤더를 요구하지 않았다. 웹 화면이 보내는 `Dooray-*-Api-Version`, `X-Client-Request-Id` 도 없이 성공했다.
공식 응답 필드는 같은 날 [공식 서비스 API 문서](https://helpdesk.dooray.com/share/pages/9wWo-xwiR66BO5LGshgVTg/2939987647631384419)의 「Wiki」 절(Pages, Comments, Files)을 브라우저로 열어 대조했다.
아래 `{wikiId}`, `{pageId}` 는 URL 조각으로 인코딩한 값이다.

## 공통 사항

| 항목 | 실측 |
| --- | --- |
| 응답 껍데기 | `{ header: { isSuccessful, resultCode, resultMessage }, result }`. 공개 API 와 같다. `result` 안쪽이 다르다 |
| 위키 id | 경로의 `{wikiId}` 는 위키 id(`wikis` 목록의 `id`)와 위키가 속한 프로젝트 id(`projectId`) 둘 다 받는다. 웹 화면 주소 `/wiki/<a>/<b>` 의 `<a>` 는 프로젝트 id 다. `--url`·`wiki page get <url>` 입력은 `<a>` 를 그대로 `{wikiId}` 자리에 넣으므로 이 동작에 기댄다. 프로젝트 id 를 `{wikiId}` 자리에 넣고 페이지 제목 수정, 댓글 추가, 파일 업로드·삭제, 이동, 페이지 삭제까지 모두 확인했다. 이동 쿼리의 `targetWikiId` 는 위키 id 로만 확인했다 |
| 응용 오류의 상태 코드 | 없는 페이지·위키·파일, 잘못된 본문은 **HTTP 200** 에 `header.isSuccessful=false`, `resultCode=404`/`400`/`500` 으로 온다. 공개 API 는 HTTP 상태 자체가 404·400 이다 |
| 없는 경로의 오류 | `header` 가 없는 `{ timestamp, status, error, path }` JSON 과 HTTP 404 다. 본문의 `path` 에 요청 경로가 들어 있어 메시지에 쓰면 안 된다 |
| 필수 필드를 빠뜨렸을 때 | 400 또는 500(`Unknown Error`) 이다. 아래 쓰기 표에 경로마다 적었다 |
| 제목 중복 | 거절하지 않는다. **같은 부모 아래** 같은 제목이 있으면 생성·제목 수정·이동 모두 서버가 ` (1)`, ` (2)`, ` (3)` 을 붙여 저장한다. 다른 부모 아래의 같은 제목은 그대로 둔다. 자기 제목을 그대로 두고 본문만 고치면 바뀌지 않는다. 공식 문서는 생성과 수정(전체·제목)에서 제목이 겹치면 409 다. 이동 절에는 409 가 없어 이동은 확인하지 않는다(이동도 웹은 ` (3)` 을 붙여 저장하지만 공개 API 도 같을 수 있다). 웹 클라이언트는 생성·제목 수정 전에 같은 부모의 형제 제목을 확인해 같은 결과(종료 코드 1)로 맞추고, 쓴 뒤 저장된 제목이 요청과 다르면 stderr 로 경고한다. 형제 목록은 한 부모의 자식 105개를 한 번에 모두 주었다(`page`·`size` 무시). 권한이 막힌 페이지가 목록에 제목과 함께 나오는지는 허용 위키에 제한된 페이지가 없어(92쪽 모두 `restricted: false`) 확인하지 못했다. 보이지 않는 제목과 겹치면 서버가 제목을 바꿔 저장하므로 쓴 뒤 비교가 그 경우를 잡는다 |
| 호출 한도 | 1초 간격으로 200회 안팎을 불러 429 는 없었다 |
| 날짜 | 오프셋을 단 ISO 8601(`+09:00`)이라 공식 표기와 같다 |
| 식별자 | 모두 문자열이다 |

## 경로와 쿼리

| `DoorayClient` 메서드 | 웹 경로 | 쿼리·요청 본문 | 실측 결과 |
| --- | --- | --- | --- |
| getWikis | GET `/v2/wapi/wikis` | `page`, `size` | `page=0/1`, `size=1` 이 다른 위키를 주고 순서는 `size=2000` 전체 목록과 같다. `size=2000` 허용 |
| getWikiPages | GET `/v2/wapi/wikis/{wikiId}/pages` | `parentPageId` | 없으면 홈 페이지 하나(`root: true`). 있으면 그 부모의 직접 자식 전부. `page`·`size` 는 무시한다(6건 위키에서 `size=2` 도 6건) |
| getAllWikiPages | getWikiPages 를 반복한다 | | 한 번에 가져오는 전체 트리 경로는 없다. 웹 화면도 노드를 펼칠 때마다 `parentPageId` 로 부른다 |
| getWikiPage | GET `/v2/wapi/wikis/{wikiId}/pages/{pageId}` | 없음 | `result.content` + `result.references` |
| getWikiPageStandalone | GET `/v2/wapi/pages/{pageId}` | 없음 | `content` 에 `pageId`, `projectId`, `wikiId`, `status`, `subject` 만 있다. 본문이 없어 `wikiId` 를 얻는 데만 쓰고, 상세는 위 경로를 한 번 더 부른다. `/v2/wapi/wikis/*/pages/{pageId}` 는 500 이다 |
| createWikiPage | POST `/v2/wapi/wikis/{wikiId}/pages` | `{ subject, body: { mimeType, content }, parentPageId }` | 201. 공개 API 요청 본문 그대로 통한다 |
| updateWikiPage | PUT `/v2/wapi/wikis/{wikiId}/pages/{pageId}` | `{ subject, body: { mimeType, content }, referrers? }` | `subject` 와 `body` 를 **둘 다** 보내야 한다. `subject` 만이면 400, `body` 만이면 500. `referrers: []` 허용 |
| updateWikiPageTitle | PUT `…/pages/{pageId}/title` | `{ subject }` | 200 |
| updateWikiPageContent | PUT `…/pages/{pageId}/content` | `{ body: { mimeType, content } }` | 200. 빈 문자열 본문 허용, 읽으면 `content: ""` |
| deleteWikiPage | DELETE `…/pages/{pageId}` | 없음 | 200. 자식이 있어도 거절하지 않고, 자식은 지워지지 않고 지운 페이지의 부모 아래로 올라간다 |
| moveWikiPage | POST `…/pages/{pageId}/move` | **쿼리** `targetParentPageId`, `targetWikiId`, `beforePageId`, `withChildren`. 요청 본문 없음 | 아래 「이동」 |
| getWikiPageComments | GET `…/pages/{pageId}/comments` | `size` | 아래 「댓글」 |
| getWikiPageComment | GET `…/comments/{commentId}` | 없음 | `content` + `references` |
| addWikiPageComment | POST `…/comments` | `{ body: { content, mimeType }, attachFileIds: [] }` | 201. `attachFileIds` 를 빼면 500 이다 |
| updateWikiPageComment | PUT `…/comments/{commentId}` | `{ body: { content, mimeType }, attachFileIds: [] }` | 200, `result: null`. `mimeType`·`attachFileIds` 를 빼면 400 이다 |
| deleteWikiPageComment | DELETE `…/comments/{commentId}` | 없음 | 200, `result: null` |
| uploadWikiPageFile | POST `…/pages/{pageId}/files` | multipart `type`(먼저), `file` | 아래 「첨부」 |
| downloadWikiPageFile | GET `/page-files/{fileId}` | 없음 | 아래 「첨부」 |
| deleteWikiPageFile | DELETE `/v2/wapi/wikis/{wikiId}/page-files/{fileId}` | 없음 | 아래 「첨부」 |

`…` 는 `/v2/wapi/wikis/{wikiId}` 다. `/v2/wapi/wikis/{wikiId}` 자체(`GET`)는 위키 정보와 홈 아래 첫 단계 페이지를 함께 주지만 `getWikiPages` 로 충분해 쓰지 않는다.

### 이동

- `move` 는 요청 본문이 아니라 쿼리로 받는다. 본문에 JSON 을 보내면 400 이다.
- `targetParentPageId` 가 필수다. `targetWikiId` 는 빼도 되고, 같은 위키 id 를 줘도 된다.
- `beforePageId=<형제 id>` 는 그 형제 **바로 뒤**에 둔다. 공식 문서의 「바로 뒤」 와 같다. `beforePageId=0` 은 형제 중 맨 앞이다. 빈 값은 순서를 바꾸지 않는다.
- `withChildren=false` 면 하위 페이지를 옮기지 않고 옮기는 페이지의 이전 부모 아래로 올린다. 기본(생략 또는 `true`)은 함께 옮긴다. `includeChildren`, `children` 이름은 효과가 없었다.
- 다른 위키로 옮기는 `targetWikiId` 는 웹 화면이 보내는 쿼리지만 위키가 하나뿐인 허용 장소에서는 다른 위키로 옮겨 보지 못했다. 실측하지 않았으므로 지원 목록에 넣지 않는다.

### 댓글

- 목록은 `page` 를 무시한다. `size=N` 이 **가장 최근 N개**를 오래된 것부터 준다. 공식 문서는 최신순이고 `page=0` 첫 원소가 가장 최근이다. 웹 화면은 `direction=:` 쿼리를 쓰지만 값을 바꿔도 결과가 같아 쓰지 않는다.
- `size=1000` 까지 받았다. 최대치는 확인하지 않았다.
- 공식의 `page=p`, `size=s`(최신순)는 `size=(p+1)*s` 로 받아 뒤집은 뒤 `p*s` 번째부터 `s` 개를 자르면 얻는다. `totalCount` 는 `result.totalCount` 다.
- 단건 조회는 공식과 같은 경로이고 `result.content` 다.

### 첨부

- 업로드는 `type` 을 먼저, `file` 을 나중에 담은 multipart 로 통한다. `general`, `inline_image` 둘 다 확인했다. 3MB 파일과 한글 파일 이름도 통한다. 응답 상태는 200 이다(공식 201).
- 업로드·다운로드 모두 307 이 오지 않았다. 설계 「웹 HTTP 층」 의 첨부 307 규칙은 방어용으로 둔다.
- 페이지 상세의 `files[]`·`images[]` 항목에 `downloadUrl`(`/page-files/{fileId}`)이 있다. 이 경로를 `SESSION` 으로 부르면 바이트와 `content-disposition` 이 바로 온다. 공개 API 모양의 `…/pages/{pageId}/files/{fileId}` 와 `…/wikis/{wikiId}/attachFiles/{attachFileId}` 는 404 다.
- 다운로드 경로에는 위키·페이지 id 가 없다. 파일이 그 페이지의 것인지 CLI 가 확인해야 하므로 페이지 상세를 먼저 읽어 `files[]`·`images[]` 에 `fileId` 가 있는 것을 확인한 뒤 `/page-files/{fileId}` 를 `apiPath` 로 만들어 부른다. 응답이 준 `downloadUrl` 문자열을 그대로 요청 주소로 쓰지 않는다. 이 조회가 이름 대체 값(`knownName`)도 준다. 저장 이름은 `Content-Disposition` 을 `src/utils/content-disposition.ts`(ADR-067)로 풀어 정한다.
- 삭제도 경로에 페이지 id 가 없다. 같은 확인을 먼저 한다. 없는 파일은 HTTP 200 에 `resultCode=404` 다.
- `files[].id` 와 `pageFileId` 는 같은 값이다. `attachFileId` 는 다른 값이고 본문 참조(`/wikis/{wikiId}/files/{attachFileId}`)에 쓴다.

## 공식 응답 필드와 변환

웹 내부 필드를 그대로 공개하지 않고 아래 공식 필드 가운데 웹에서 얻은 것만 낸다. 웹에 없는 값은 키를 만들지 않는다.
공식 필수 필드가 없거나 모양이 틀리면 오류로 끝낸다. 필수로 보는 것: 위키 목록은 `id`, `name`, `project.id`, `home.pageId`(`resolvers/wiki.ts` 가 쓴다). 페이지 목록·상세는 `id`, `wikiId`, `version`, `root`, `subject`. 댓글은 `id`, `page.id`, `createdAt`, `creator.member.organizationMemberId`, `creator.member.name`, `body.content`.

| 메서드 | 공식 result 필드 | 웹과 다른 점 |
| --- | --- | --- |
| getWikis | `id`, `project.id`, `name`, `type`, `scope`, `home.pageId`, 위쪽 `totalCount`(`name`, `project.id`, `home.pageId` 는 필수) | `result.contents` 를 꺼내고 `totalCount` 를 위로 올린다. `projectId` 를 `project.id` 로 바꾼다. `home` 은 `pageId` 만 남긴다. `tenantId`, `hiddenFlag`, `isMine` 은 공식 필드가 아니라 뺀다 |
| getWikiPages | `id`, `wikiId`, `version`, `root`, `creator.type`, `creator.member.organizationMemberId`, `subject`, `parentPageId` | `contents` 를 꺼낸다. `pageId` → `id`. `createOrganizationMemberId` → `creator`(`type: "member"`). 홈 페이지는 `parentPageId: null` 이라 키를 뺀다. `order`, `status`, `hasChildren`, `restricted` 등은 뺀다 |
| getWikiPage | `id`, `wikiId`, `version`, `parentPageId`, `subject`, `body.mimeType`, `body.content`, `root`, `createdAt`, `updatedAt`, `creator`, `referrers`, `files`, `images` | `content` 를 꺼낸다. `pageId` → `id`. `create.dateTime`/`create.member` → `createdAt`/`creator`, `lastUpdate.dateTime` → `updatedAt`. 참조자·작성자는 `organizationMemberId` 만 남겨 `{ type: "member", member: { organizationMemberId } }` 로 만든다. `body.contentId`, `breadcrumb`, `me`, `reactions` 등은 뺀다. 모든 페이지가 `text/x-markdown` 이었다 |
| getWikiPage 의 files, images | `id`, `name`, `size`, `attachFileId` | 공식 문서는 단건 조회 예시에 `attachFileId` 가 없는 곳과 있는 곳(단독 조회 예시, 「Attach Files」·「Files」 절의 `$.result.files[].attachFileId` 설명)으로 갈린다. 첨부 가이드가 이 필드를 말하므로 공식 필드로 본다. 웹 항목에서 이 네 필드만 남긴다. `downloadUrl` 은 변환 함수가 내부에서만 쓰고 낸 결과에 넣지 않는다 |
| getWikiPageStandalone | getWikiPage 와 같다 | 가벼운 응답으로 `wikiId` 를 얻은 뒤 상세를 한 번 더 부른다 |
| createWikiPage | `id`, `wikiId`, `parentPageId`, `version` | `pageId` → `id` |
| updateWikiPage, updateWikiPageTitle, updateWikiPageContent, moveWikiPage | `null` | 웹은 `{ wikiId, pageId, version, … }` 를 돌려준다. `null` 로 바꾼다. `version` 은 수정마다 올라간다 |
| deleteWikiPage, deleteWikiPageComment, updateWikiPageComment, deleteWikiPageFile | `null` | 그대로 |
| getWikiPageComments, getWikiPageComment | `id`, `page.id`, `createdAt`, `modifiedAt`, `creator.type`, `creator.member.organizationMemberId`, `creator.member.name`, `body.mimeType`, `body.content`, 목록은 `totalCount` | `pageCommentId` → `id`, `pageId` → `page.id`. `creator` 는 `organizationMemberId` 와 `name` 으로 `{ type: "member", member }` 를 만든다. `body.contentId`, `modifier`, `files`, `reactions` 등은 뺀다 |
| addWikiPageComment | `id` | `pageCommentId` → `id`. `version` 은 뺀다 |
| uploadWikiPageFile | `id`, `attachFileId`, `name`, `mimeType`, `type`, `size`, `createdAt` | `pageFileId`, `extension` 을 뺀다 |

- 공식 문서의 페이지·목록 작성자에는 `name` 이 없다. 웹 페이지 응답에는 `name` 이 있지만 공식 필드가 아니므로 내지 않는다. `wiki pages`·`wiki page get` 의 작성자 열은 비게 된다. 댓글의 `creator.member.name` 은 공식 필드라 낸다.
- 웹 응답의 참조자는 `organizationMemberId`, `name`, `nickname` 을 갖는다. CLI 는 참조자를 쓰는 명령이 없어 읽기 변환만 둔다. 쓸 때는 공식 모양(`{ type: "member", member: { organizationMemberId } }`)을 그대로 받았다.

## 웹에서 지원하지 않는 명령·옵션

| 명령·옵션 | 이유 |
| --- | --- |
| `wiki page edit --mime-type`(값과 관계없이 옵션 전체) | 웹은 `body.mimeType` 이 `text/x-markdown` 이 아니면 400(`입력한 내용에 오류가 있습니다.`)으로 거절한다. `text/html`, `text/plain` 을 `PUT …/content` 와 `PUT …/pages/{pageId}` 로 시도했다. 값이 `text/x-markdown` 인지는 명령이 `getWikiPage` 를 부른 뒤에야 알 수 있어 값 조건으로 막으면 「API 를 부르지 않고」(스펙 REQ8)를 어기므로 옵션 전체를 막는다 |
| `wiki page move --to-wiki` | 실측하지 못해 막는다. 허용된 실측 장소에 위키가 하나뿐이라 다른 위키로 옮기는 쓰기를 해 보지 못했다. 같은 위키 id 는 통하지만 그 옵션의 뜻은 다른 위키로 옮기기다 |

- 위 표 밖의 `wiki` 명령은 모두 웹 경로가 있다(`wiki list`, `pages`, `tree`, `page get/create/edit/replace/move/delete`, `page file list/upload/download/download-all/delete`, `page comment list/latest/get/add/edit/delete`).
- 기존 본문의 `mimeType` 이 `text/x-markdown` 이 아닌 페이지는 이번에 찾지 못했다(허용 위키의 최상위 아래 13쪽 모두 markdown). 명령은 기존 형식을 보존해 보내므로 그런 페이지를 고치면 서버가 400 을 줄 것이다. 웹 클라이언트는 쓰기 전에 `body.mimeType` 이 `text/x-markdown` 이 아니면 호출 없이 `EXIT_PARAM_ERROR`(웹 방식 안내)로 끝낸다. 옵션은 명령에서, 기존 페이지의 형식은 클라이언트에서 막는 두 곳이 같은 이유다.

## 실측 기록

쓰기는 허용된 `<project>` 의 위키에서만, 이름이 `[cli-web-probe]` 로 시작하는 페이지로 했다. 다른 페이지는 읽기만 했다.

| 한 일 | 개수 | 뒤처리 |
| --- | --- | --- |
| `[cli-web-probe]` 페이지 생성 | 약 130(세 번에 걸쳐. 이동·정렬·삭제·제목 중복 실험과 형제 105개 목록 실험 포함) | 모두 삭제. 위키 최상위 아래 페이지 수가 실측 전 13건으로 돌아온 것을 세 번 모두 확인했다 |
| 제목·본문·전체 수정, 참조자 지정 | 여러 번 | 페이지와 함께 삭제 |
| 댓글 추가·수정·삭제 | 추가 5(화면에서 1) | 페이지와 함께 삭제 |
| 파일 업로드·삭제 | 4(텍스트 둘, 인라인 이미지, 3MB 이진) | 모두 삭제 |
| 이동·정렬 | 여러 번(첫 번째 실측에서 `beforePageId=0` 로 맨 앞에 둔 것 포함. 두 번째 실측은 프로브 부모 페이지 아래에서만 했다) | 프로브 페이지만 움직였다. 한때 프로브 페이지가 기존 페이지 앞에 있었다. 그 뒤 다른 이동·정렬을 거쳐 프로브 페이지가 모두 맨 뒤에 있는 것을 목록으로 확인했다. 기존 페이지끼리의 순서를 실측 전 값과 일일이 대조하지는 않았다 |

위키 목록과 기존 페이지는 읽기만 했다. 삭제한 페이지가 위키 휴지통에 남는지는 확인하지 않았다.
