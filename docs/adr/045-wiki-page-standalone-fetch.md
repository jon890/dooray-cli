## ADR-045: 위키 페이지를 페이지 ID 하나로 조회하고 wikiId 를 응답에서 얻는다

- **status**: `accepted`

- **결정**: `resolveWikiPageInput` 의 `--id` 모드에서 `--project` 를 요구하지 않는다.
  `--id` 만 주어지면 `GET /wiki/v1/pages/{page-id}` 를 한 번 불러 응답의 `wikiId` 를 읽고,
  기존과 같은 `{ wikiId, pageId }` 를 돌려준다.
  `--project` 를 함께 주면 그것으로 wikiId 를 해석해 추가 호출을 하지 않는다.

- **맥락**: 이 저장소는 여러 곳에 「위키 API 가 page-only fetch 를 지원하지 않는다」고 적어 두었다.
  `CLAUDE.md` 의 명령 공통 규약, `src/resolvers/wiki-page-input.ts` 의 안내 문구,
  ADR-043 의 적용 범위가 모두 그 전제로 쓰였다.

  공식 API 문서를 확인한 결과 사실과 다르다.
  `GET /wiki/v1/pages/{page-id}` 가 공개 API 에 있고 wikiId 없이 페이지 ID 하나만 받는다.
  응답 `result` 는 `id`, `wikiId`, `version`, `parentPageId`, `subject`, `body`, `root`,
  `createdAt`, `updatedAt`, `creator`, `referrers`, `files`, `images` 를 담는다.
  `src/api/types.ts` 의 `WikiPageDetail` 과 필드가 일치해 새 타입이 필요 없다.

  전제가 틀린 채로 Issue #154 의 계획을 세웠다.
  그 이슈의 핵심 요청은 페이지 ID 하나만 아는 상태에서 project 를 찾아가는 절차였는데,
  이 endpoint 를 쓰면 project 를 찾을 필요가 없어진다.

  응답에서 wikiId 를 얻어 기존 경로를 재사용하는 방식은 post 쪽에 이미 있다.
  ADR-020 이 `GET /project/v1/posts/{postId}` 의 응답에 `project.{id,code}` 가 들어 있어
  한 lookup 으로 기존 코드 경로를 재사용한다고 적었고, `resolveByPostId` 가 그것을 구현한다.
  위키도 같은 모양이 되어 두 영역의 입력 해석이 같은 형태로 읽힌다.

  이 결정은 `wiki page get` 하나에 그치지 않는다.
  `resolveWikiPageInput` 을 쓰는 `wiki page file`, `wiki page comment`, `wiki page delete` 가
  모두 `--project` 없이 `--id` 만으로 동작하게 된다.

- **대안 기각**:
  - `wiki page get` 만 새 endpoint 를 직접 부르고 resolver 는 그대로 둔다.
    `wiki page get` 은 project 없이 되고 나머지 하위 명령은 안 되는 비대칭이 남는다.
    ADR-020 이 없애려 한 것이 그 비대칭이다.
  - 반환형을 `{ wikiId: string | null, pageId }` 로 바꿔 wikiId 해석을 호출부로 넘긴다.
    호출부 대부분이 wikiId 를 요구하는 API 를 부르므로 같은 해석을 여러 곳에 두게 된다.
  - `--project` 요구를 유지하고 문서에만 새 endpoint 를 적는다.
    사용자가 직접 API 를 부르라는 안내가 되어 CLI 를 쓰는 이유가 사라진다.

- **결과**:
  - 얻는 것: 페이지 링크나 페이지 ID 하나만 있으면 `--id` 로 바로 조회, 수정, 삭제, 첨부와 댓글 조작까지 된다.
    project 를 찾는 단계가 사라져 Issue #154 의 첫 번째 요청이 절차 없이 닫힌다.
    입력 해석이 post 쪽과 같은 형태가 된다.
  - 감당할 것: `--id` 만 주는 경로는 API 호출이 한 번 늘어난다.
    `--project` 를 함께 주면 그 호출이 없으므로, 반복 실행하는 자동화는 `--project` 를 주는 편이 빠르다.
    권한이 없는 페이지 ID 는 그 호출의 4xx 로 드러난다. 사전 검증을 따로 두지 않는다.

- **적용 범위**: `src/api/client.ts` 에 `getWikiPageStandalone(pageId)` 를 둔다.
  `getPostStandalone` 과 같은 형태로 `wiki/v1/pages/${pageId}` 를 부르고 `WikiPageResponse` 를 돌려준다.

  `--url` 모드는 바뀌지 않는다. `https://<tenant>.dooray.com/wiki/<wikiId>/<pageId>` 에 wikiId 가 이미 있어 추가 호출이 필요 없다.
  positional 두 개 모드도 바뀌지 않는다.

  `dooray://<orgId>/pages/<pageId>` 형태는 여전히 `--url` 로 받지 않는다.
  다만 그 링크의 뒤 숫자가 pageId 이므로 `--id` 에 넣으면 project 없이 조회된다.
  ADR-043 이 정한 orgId 오류 안내는 그 방법을 알려주는 자리로 남는다.
