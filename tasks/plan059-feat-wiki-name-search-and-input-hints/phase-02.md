# Phase 02. 페이지 ID 하나로 위키 페이지를 다루게 한다

**Execution profile**: standard

## 목표

`wiki page` 하위 명령이 `--id <pageId>` 만으로 동작하게 한다. `--project` 를 요구하지 않는다.
`wiki page get` 은 아직 positional 두 개로 고정되어 있으므로 네 가지 입력 형태를 받게 함께 바꾼다.

그리고 위키 본문 링크의 앞 숫자를 project 자리에 넣어 실패했을 때 그 값이 무엇인지 오류가 알려주게 한다.

**범위 외**: `wiki list` 의 `--search` 와 project 열은 phase 01 이다.
post 입력 오류 안내는 phase 03 이다. README 와 스킬 문서 갱신은 phase 04 다.
`wiki page move` 는 이 plan 에 없다. Issue #148 의 별도 plan 이 맡는다.

## 컨텍스트

**근거 문서**: `docs/adr/045-wiki-page-standalone-fetch.md`,
`docs/adr/043-wiki-name-search-and-project-column.md` 의 `dooray://` 링크 관련 부분,
`docs/adr/020-post-input-unification-vitest.md`, `docs/adr/030-resolveproject-numeric-fallback.md`,
`docs/flow.md` 의 「위키 흐름」 절.

**이 저장소의 기존 서술이 틀렸다.** 여러 곳에 「위키 API 가 page-only fetch 를 지원하지 않는다」고
적혀 있는데 공식 API 문서를 확인한 결과 사실이 아니다.
`CLAUDE.md` 의 명령 공통 규약과 `src/resolvers/wiki-page-input.ts` 의 `INPUT_HELP` 가 그 서술을 담고 있다.
저장소 문서를 근거로 삼지 않고 공식 문서를 따른다.

공식 API 는 이렇다.

```
GET /wiki/v1/pages/{page-id}
```

wikiId 없이 페이지 ID 하나만 받는다. 응답 `result` 가 담는 필드는 이렇다.
`id`, `wikiId`, `version`, `parentPageId`, `subject`, `body`, `root`,
`createdAt`, `updatedAt`, `creator`, `referrers`, `files`, `images` 다.
`src/api/types.ts` 의 `WikiPageDetail` 과 필드가 일치하므로 새 타입을 만들지 않는다.

현재 상태는 이렇다.

- `src/api/client.ts` 에 `getWikiPage(wikiId, pageId)` 는 있고 페이지 ID 만 받는 메서드는 없다.
- `src/api/client.ts:270` 의 `getPostStandalone(postId)` 가 같은 모양의 선례다.
  `project/v1/posts/` 아래 postId 를 붙여 부르고 `PostDetailResponse` 를 돌려준다.
- `src/resolvers/wiki-page-input.ts` 의 `resolveWikiPageInput` 이 네 형태를 처리하고
  `wikiId` 와 `pageId` 를 돌려준다. `--id` 모드는 지금 `project` 가 없으면 에러를 던진다.
- `src/resolvers/post-input.ts` 의 `resolveByPostId` 가 응답에서 project 정보를 읽어
  기존 경로를 재사용하는 패턴이다. 위키도 같은 모양으로 만든다.
- `src/commands/wiki/page-get.ts` 는 project 와 page-id 를 필수 positional 로 받고 `resolveWiki` 를 직접 부른다.
- `src/commands/wiki/page-delete.ts` 가 `resolveWikiPageInput` 을 쓰는 완성된 예다. 인자와 옵션 구성을 그대로 본뜬다.
- `src/resolvers/wiki.ts` 의 `resolveWiki` 는 `resolveProject` 를 먼저 부른 뒤 프로젝트 캐시에서
  code 나 id 로 찾아 `wikiId` 를 꺼낸다.
  찾지 못하면 `프로젝트에 위키가 없습니다` 를 `EXIT_PARAM_ERROR` 로 던진다.

orgId 를 project 로 넣었을 때 실패하는 경로는 이렇다.
`src/resolvers/project.ts` 의 `resolveProject` 는 `PROJECT_ID_RE` 에 걸리는 15자리 이상 numeric 입력을
프로젝트 캐시를 보지 않고 그대로 돌려준다 (ADR-030).
orgId 는 19자리라 이 관문을 통과하고, `resolveWiki` 가 그 값으로 캐시를 뒤져 찾지 못한다.

위키 본문의 페이지 링크가 `dooray://<orgId>/pages/<pageId>` 형태인 근거는 코드에 있다.
`src/utils/task-link.ts` 와 `src/utils/mention.ts` 가 orgId 를 앞에 넣어 그 링크를 만든다.

## 의도 메모

- `wiki page get` 만 새 endpoint 를 직접 부르는 방식을 기각했다.
  그러면 `wiki page get` 은 project 없이 되고 `file`, `comment`, `delete` 는 안 되는 비대칭이 남는다.
  ADR-020 이 없애려 한 것이 그 비대칭이다. resolver 를 고쳐 넷이 함께 열린다.
- 반환형에 wikiId 가 없을 수 있게 바꾸는 방식을 기각했다.
  호출부 대부분이 wikiId 를 요구하는 API 를 부르므로 같은 해석을 여러 곳에 두게 된다.
- `--project` 를 함께 주면 추가 호출을 하지 않는다. 반복 실행하는 자동화가 호출 하나를 아낄 수 있다.
- `dooray://` 를 `--url` 로 받는 것은 기각한 채로 둔다. 그 형태에 wikiId 가 없어
  `src/utils/dooray-url.ts` 의 `WIKI_URL_RE` 가 요구하는 값을 채울 수 없다.
  대신 뒤 숫자가 pageId 이므로 `--id` 에 넣으면 project 없이 조회된다. 오류 안내가 그 방법을 알려준다.
- 권한이 없는 페이지 ID 는 새 endpoint 의 4xx 로 드러난다. 사전 검증을 따로 두지 않는다.
- 여러 줄 오류 메시지를 테스트할 때 정규식 하나로 두 패턴을 이어 검사하지 않는다.
  메시지에 줄바꿈이 있어 `.` 가 그것을 넘지 못해 테스트가 항상 실패한다.
  `s` 플래그를 붙이거나 메시지에 각 문구가 들어 있는지를 따로 확인한다.

## 작업 항목

### 1. `src/api/client.ts` 에 페이지 ID 만 받는 조회 메서드를 만든다

`getWikiPageStandalone(pageId: string)` 을 더하고 반환형은 `Promise<WikiPageResponse>` 로 둔다.
`src/api/client.ts:270` 의 `getPostStandalone` 과 같은 형태로 쓴다.

- `wiki/v1/pages/` 아래 pageId 를 붙인 경로를 `this.api.get` 으로 부르고 `WikiPageResponse` 로 파싱한다.
- `catch` 에서 `toDoorayCliError(e)` 를 `await` 해 던진다. 기존 메서드와 같다.
- 기존 `getWikiPage(wikiId, pageId)` 는 그대로 둔다. wikiId 를 이미 아는 경로가 계속 쓴다.

새 타입을 만들지 않는다. `WikiPageResponse` 를 그대로 쓴다.

### 2. `src/resolvers/wiki-page-input.ts` 가 `--id` 만으로 wikiId 를 얻게 한다

`--id` 모드에서 `project` 가 없을 때 에러를 던지는 분기를 없앤다.
대신 `client.getWikiPageStandalone` 을 불러 응답의 `result.wikiId` 를 읽고 그것과 입력 pageId 를 돌려준다.

`project` 가 함께 주어졌으면 지금처럼 `resolveWiki` 로 해석하고 추가 호출을 하지 않는다.

응답의 `wikiId` 가 비어 있으면 `EXIT_API_ERROR` 로 던진다.
문구는 페이지 응답에 wikiId 가 없다는 뜻과 입력한 pageId 를 담는다.

`INPUT_HELP` 문구를 고친다. 지금 `--id` 와 `--project` 를 붙여 적어 `--project` 가 필수처럼 읽힌다.
새 문구는 이렇다.

```
위키 페이지를 식별할 정보가 부족합니다. 다음 중 하나를 입력하세요:
  - --id <page-id>                          예: --id 1234567890123456789
  - <project> <page-id>                     예: my-project 1234567890123456789
  - <Dooray URL>                            예: https://x.dooray.com/wiki/<wikiId>/<pageId>
  위키를 이름으로 찾으려면: dooray wiki list --search <위키 이름 일부>
  --project 는 선택입니다. 함께 주면 wikiId 해석 호출을 아낍니다.
```

`--id` 를 첫 줄에 둔다. 페이지 ID 하나로 시작하는 것이 가장 흔한 경로이기 때문이다.

`--url` 모드와 positional 두 개 모드는 바꾸지 않는다.

### 3. `src/commands/wiki/page-get.ts` 가 `resolveWikiPageInput` 을 쓰게 한다

`src/commands/wiki/page-delete.ts` 의 인자와 옵션 구성을 그대로 따른다.

- 첫 positional 은 선택으로 두고 설명은 프로젝트 코드 또는 Dooray Wiki URL 로 적는다.
- 둘째 positional 도 선택으로 두고 설명은 positional 두 개 모드의 page-id 로 적는다.
- `--id` 의 설명은 `위키 페이지 ID (project 없이 조회)` 로 한다.
- `--url` 의 설명은 `Dooray Wiki URL` 로 한다.
- `--project` 의 설명은 `프로젝트 코드 (선택, 주면 wikiId 해석 호출을 아낀다)` 로 한다.

`resolveWikiPageInput` 을 스피너보다 먼저 부른다.
`page-delete.ts` 에 그 이유가 주석으로 적혀 있다. 검증을 스피너 앞에 둔다.

받은 `wikiId` 와 `pageId` 로 `client.getWikiPage` 를 부르고 `formatWikiPageDetail` 로 출력한다.
출력 부분은 지금 코드를 그대로 유지한다.

`--id` 모드에서 resolver 가 이미 페이지 상세를 받았지만 그 응답을 재사용하지 않는다.
resolver 의 반환 계약을 지금 형태로 유지하는 편이 네 하위 명령에 같은 모양으로 남는다.
호출 하나를 아끼는 것보다 계약이 단순한 것이 낫다.

### 4. `src/resolvers/wiki.ts` 의 `resolveWiki` 오류에 orgId 안내를 더한다

`프로젝트에 위키가 없습니다` 를 던지기 직전에 입력 형태를 본다.
`projectCode` 가 15자리 이상 numeric 이면 안내를 덧붙인다.

판정에 쓰는 정규식은 `src/resolvers/project.ts` 의 `PROJECT_ID_RE` 와 같다.
그 상수를 export 해 가져다 쓴다. 같은 패턴을 두 곳에 적지 않는다.

덧붙일 문구는 이렇다.

```
프로젝트에 위키가 없습니다: <입력값>
  위키 본문의 페이지 링크는 dooray://<orgId>/pages/<pageId> 형태이고, 앞 숫자는 orgId 입니다.
  orgId 는 project 도 위키 ID 도 아니므로 project 자리에 넣을 수 없습니다.
  그 링크의 뒤 숫자가 페이지 ID 이므로 project 없이 조회할 수 있습니다:
    dooray wiki page get --id <페이지 ID>
```

15자리 미만 입력이면 지금 문구를 그대로 던진다. 안내를 붙이지 않는다.

### 5. `CLAUDE.md` 의 page-only fetch 서술을 바로잡는다

「명령 공통 규약」의 입력 형식 항목에 wiki 의 `--id` 모드가 `--project` 동반 필수이며
위키 API 가 page-only fetch 를 지원하지 않는다고 적은 줄이 있다.

`wiki` 의 `--id` 는 단독으로 동작하며 `--project` 는 선택이고 주면 wikiId 해석 호출을 아낀다는 내용으로 바꾼다.
사실과 다른 서술이 남지 않게 `page-only fetch` 라는 표현을 지운다.

### 6. `src/resolvers/wiki-page-input.test.ts` 에 새 경로 테스트를 더한다

기존 파일에 더한다. `getWikiPageStandalone` 을 `vi.fn()` 으로 둔다.

- `--id` 만 주면 `getWikiPageStandalone` 을 한 번 부르고 응답의 `wikiId` 를 돌려준다.
- `--id` 와 `--project` 를 함께 주면 `getWikiPageStandalone` 을 부르지 않는다.
- `--id` 응답의 `wikiId` 가 빈 문자열이면 `EXIT_API_ERROR` 로 끝난다.
- `--url` 로 project 없이 결과를 얻고 `getWikiPageStandalone` 을 부르지 않는다.
- positional 두 개로 `wikiId` 와 `pageId` 를 얻는다.
- `--id` 와 positional 을 함께 주면 `EXIT_PARAM_ERROR` 로 끝난다.
- `--id` 와 `--url` 을 함께 주면 `EXIT_PARAM_ERROR` 로 끝난다.

테스트 대상 파일 자체를 `vi.mock` 하지 않는다. 같은 파일 안의 함수 참조가 교체되지 않아 실제 구현이 불린다.
client 를 mock 객체로 넘기는 방식을 쓴다. `src/resolvers/member.test.ts` 가 그 형태다.

### 7. `src/resolvers/wiki.test.ts` 에 오류 안내 테스트를 더한다

phase 01 에서 만든 파일에 더한다.

- `resolveWiki` 가 15자리 이상 numeric 을 받아 찾지 못했을 때 오류 메시지에 `orgId` 가 들어간다.
- 그 메시지에 `wiki page get --id` 가 들어간다.
- `resolveWiki` 가 비숫자 project 코드로 찾지 못했을 때 오류 메시지에 `orgId` 가 들어가지 않는다.
- 두 경우 모두 종료 코드가 `EXIT_PARAM_ERROR` 다.

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm run build
pnpm test
```

셋 다 통과해야 한다. 이 phase 의 테스트를 따로 돌린다.

```bash
# cwd: <repo root>
pnpm vitest run src/resolvers/wiki.test.ts src/resolvers/wiki-page-input.test.ts
```

입력 형태가 실제로 넓어졌는지 확인한다.

```bash
# cwd: <repo root>
grep -c "getWikiPageStandalone" src/api/client.ts             # = 1
grep -c "wiki/v1/pages/" src/api/client.ts                    # = 1
grep -c "resolveWikiPageInput" src/commands/wiki/page-get.ts  # >= 1
grep -c 'argument("<' src/commands/wiki/page-get.ts           # = 0
grep -c "page-only fetch" CLAUDE.md                           # = 0
grep -rl 'd{15,}' src/resolvers/ | wc -l                      # = 1
grep -c "orgId" src/resolvers/wiki.ts                         # >= 1
```

일곱 기대값이 모두 맞아야 한다.
`argument("<` 가 0 인 것은 필수 positional 이 사라졌다는 근거다.
`page-only fetch` 가 0 인 것은 틀린 서술이 남지 않았다는 근거다.
정규식을 담은 파일이 1개인 것은 `PROJECT_ID_RE` 를 가져다 썼고 같은 패턴을 다시 적지 않았다는 근거다.

`--id` 단독 경로가 도움말에 드러나는지 확인한다.

```bash
# cwd: <repo root>
node dist/index.js wiki page get --help | grep -c -- "--id"   # >= 1
```

개인 식별 정보 검사를 통과시킨다.

```bash
# cwd: <repo root>
bash scripts/check-pii.sh
```

오류 메시지 예시와 테스트에는 `scripts/check-pii.sh` 의 `OK_IDS` 에 있는 값을 쓴다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/api/client.ts` | 수정 |
| `src/resolvers/wiki-page-input.ts` | 수정 |
| `src/commands/wiki/page-get.ts` | 수정 |
| `src/resolvers/wiki.ts` | 수정 |
| `src/resolvers/project.ts` | 수정 |
| `CLAUDE.md` | 수정 |
| `src/resolvers/wiki-page-input.test.ts` | 수정 |
| `src/resolvers/wiki.test.ts` | 수정 |
