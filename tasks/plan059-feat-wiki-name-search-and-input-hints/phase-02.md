# Phase 02. `wiki page get` 의 입력 형태를 넓히고 위키 조회 실패 안내를 고친다

**Execution profile**: standard

## 목표

`wiki page get` 이 `wiki page file` 과 `wiki page comment` 와 같은 네 가지 입력 형태를 받게 한다.
그리고 위키 본문 링크의 앞 숫자를 project 자리에 넣어 실패했을 때, 그 값이 무엇인지 오류가 알려주게 한다.

지금 `wiki page get` 만 positional 두 개로 고정되어 있어 페이지 링크를 그대로 넣을 수 없다.
그리고 orgId 를 project 로 넣으면 `프로젝트에 위키가 없습니다` 만 나와 무엇이 잘못됐는지 알 수 없다.

**범위 외**: `wiki list` 의 `--search` 와 project 열은 phase 01 이다.
post 입력 오류 안내는 phase 03 이다. README 와 스킬 문서 갱신은 phase 04 다.
`dooray://` 형태를 `--url` 로 받는 것은 하지 않는다. 그 형태에 wikiId 가 없어 위키를 특정할 수 없다.

## 컨텍스트

**근거 문서**: `docs/adr/043-wiki-name-search-and-project-column.md` 의 「적용 범위」와
「`dooray://` 링크를 `--url` 로 받을 수는 없다」 부분, `docs/adr/020-post-input-unification-vitest.md`,
`docs/adr/030-resolveproject-numeric-fallback.md`, `docs/flow.md` 의 「위키 흐름」 절,
`CLAUDE.md` 의 「명령 공통 규약」 중 입력 형식.

현재 상태는 이렇다.

- `src/commands/wiki/page-get.ts` 는 `argument("<project>")` 와 `argument("<page-id>")` 를 필수로 받고 `resolveWiki` 를 직접 부른다.
- `src/resolvers/wiki-page-input.ts` 의 `resolveWikiPageInput` 이 네 형태를 이미 처리한다.
  `--url`, positional 하나가 URL 인 경우, `--id` 와 `--project`, positional 두 개다.
- `src/commands/wiki/page-delete.ts` 가 그 resolver 를 쓰는 완성된 예다. 인자 이름과 옵션 구성을 그대로 본뜬다.
- `src/resolvers/wiki.ts` 의 `resolveWiki` 는 `resolveProject` 를 먼저 부른 뒤,
  프로젝트 캐시에서 `p.code === projectCode || p.id === projectCode` 로 찾아 `wikiId` 를 꺼낸다.
  찾지 못하면 `프로젝트에 위키가 없습니다: ${projectCode}` 를 `EXIT_PARAM_ERROR` 로 던진다.

실패가 나는 경로는 이렇다.
`src/resolvers/project.ts` 의 `resolveProject` 는 `PROJECT_ID_RE`(`/^\d{15,}$/`)에 걸리는 입력을
프로젝트 캐시를 보지 않고 그대로 돌려준다 (ADR-030).
orgId 는 19자리라 이 관문을 통과하고, `resolveWiki` 가 그 값으로 캐시를 뒤져 찾지 못한다.

위키 본문의 페이지 링크가 `dooray://<orgId>/pages/<pageId>` 형태인 근거는 코드에 있다.
`src/utils/task-link.ts` 가 `dooray://${me.orgId}/tasks/${t.postId}` 를 만들고
`src/utils/mention.ts` 가 `dooray://${me.orgId}/members/${m.memberId}` 를 만든다.

## 의도 메모

- `dooray://` 를 `--url` 로 받는 것을 기각했다. 그 형태는 orgId 와 pageId 만 담고 wikiId 가 없다.
  `src/utils/dooray-url.ts` 의 `WIKI_URL_RE` 가 요구하는 wikiId 를 채울 수 없어, 받아도 project 없이는 조회할 수 없다.
  그래서 입력으로 받지 않고 오류 안내로 그 값이 무엇인지 알린다.
- `resolveWiki` 가 orgId 를 스스로 알아내 조회하게 만들지 않는다.
  orgId 로 위키를 찾는 API 가 없고, 알아낸다 해도 어느 위키인지 좁혀지지 않는다.
- 위키의 `--id` 모드는 `--project` 동반이 필수다. 위키 API 가 page-only fetch 를 지원하지 않는다는 기존 규약을 그대로 지킨다.
- 여러 줄 오류 메시지를 테스트할 때 `.toThrow(/A.*B/)` 를 쓰지 않는다.
  메시지에 줄바꿈이 있어 `.` 가 그것을 넘지 못해 테스트가 항상 실패한다.
  `s` 플래그를 붙이거나 `expect(err.message).toContain(...)` 을 각각 확인한다.

## 작업 항목

### 1. `src/commands/wiki/page-get.ts` 가 `resolveWikiPageInput` 을 쓰게 한다

`src/commands/wiki/page-delete.ts` 의 인자와 옵션 구성을 그대로 따른다.

- `argument("[arg1]", "프로젝트 코드, Dooray Wiki URL, 또는 (`--id`/`--url` 모드일 때) 미사용")`
- `argument("[arg2]", "page-id (positional 2개 모드)")`
- `option("--id <pageId>", "위키 페이지 ID")`
- `option("--url <url>", "Dooray Wiki URL")`
- `option("--project <code>", "프로젝트 코드 (--id 모드에서 wikiId 해석용)")`

`resolveWikiPageInput` 을 스피너보다 먼저 부른다.
`page-delete.ts` 에 그 이유가 주석으로 적혀 있다. 검증을 스피너 앞에 둔다.

받은 `wikiId` 와 `pageId` 로 `client.getWikiPage(wikiId, pageId)` 를 부르고 `formatWikiPageDetail` 로 출력한다.
출력 부분은 지금 코드를 그대로 유지한다.

### 2. `src/resolvers/wiki.ts` 의 `resolveWiki` 오류에 orgId 안내를 더한다

`프로젝트에 위키가 없습니다` 를 던지기 직전에 입력 형태를 본다.
`projectCode` 가 15자리 이상 numeric 이면 안내를 덧붙인다.

판정에 쓰는 정규식은 `src/resolvers/project.ts` 의 `PROJECT_ID_RE` 와 같은 `/^\d{15,}$/` 다.
그 상수를 export 해 가져다 쓴다. 같은 패턴을 두 곳에 적지 않는다.

덧붙일 문구는 이렇다.

```
프로젝트에 위키가 없습니다: <입력값>
  위키 본문의 페이지 링크는 dooray://<orgId>/pages/<pageId> 형태이고, 앞 숫자는 orgId 입니다.
  orgId 는 project 도 위키 ID 도 아니므로 project 자리에 넣을 수 없습니다.
  위키를 이름으로 찾으세요: dooray wiki list --search <위키 이름 일부>
  그 표의 Project 열 값을 project 자리에 넣습니다.
```

15자리 미만 입력이면 지금 문구를 그대로 던진다. 안내를 붙이지 않는다.

### 3. `src/resolvers/wiki-page-input.ts` 의 안내 문구에 project 찾는 방법을 더한다

`INPUT_HELP` 의 마지막 줄 뒤에 한 줄을 더한다.

```
  - project 를 모르면: dooray wiki list --search <위키 이름 일부>
```

기존 세 줄은 그대로 둔다.

### 4. `src/resolvers/wiki.test.ts` 에 오류 안내 테스트를 더한다

phase 01 에서 만든 파일에 더한다.

- `resolveWiki` 가 15자리 이상 numeric 을 받아 찾지 못했을 때 오류 메시지에 `orgId` 가 들어간다.
- 그 메시지에 `dooray wiki list --search` 가 들어간다.
- `resolveWiki` 가 비숫자 project 코드로 찾지 못했을 때 오류 메시지에 `orgId` 가 들어가지 않는다.
- 두 경우 모두 종료 코드가 `EXIT_PARAM_ERROR` 다.

### 5. `src/resolvers/wiki-page-input.test.ts` 에 `page get` 경로 테스트를 더한다

기존 파일에 더한다. `wiki page get` 이 쓰는 네 형태가 모두 같은 결과에 닿는지 본다.

- positional 두 개로 `wikiId` 와 `pageId` 를 얻는다.
- `--url` 로 project 없이 `wikiId` 와 `pageId` 를 얻는다.
- `--id` 와 `--project` 로 얻는다.
- `--id` 를 주고 `--project` 를 빼면 `EXIT_PARAM_ERROR` 로 끝나고, 메시지에 `--project` 가 들어간다.
- `--id` 와 positional 을 함께 주면 `EXIT_PARAM_ERROR` 로 끝난다.

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

입력 형태가 실제로 넓어졌는지 grep 으로 확인한다.

```bash
# cwd: <repo root>
grep -c "resolveWikiPageInput" src/commands/wiki/page-get.ts   # >= 1
grep -c 'argument("<' src/commands/wiki/page-get.ts            # = 0
grep -rlc 'd{15,}' src/resolvers/ | wc -l                      # = 1
grep -c "orgId" src/resolvers/wiki.ts                          # >= 1
```

네 기대값이 모두 맞아야 한다.
`argument("<` 가 0 인 것은 필수 positional 이 사라졌다는 근거다.
정규식을 담은 파일이 1개인 것은 `src/resolvers/project.ts` 의 `PROJECT_ID_RE` 를 가져다 썼고
`src/resolvers/wiki.ts` 에 같은 패턴을 다시 적지 않았다는 근거다.

개인 식별 정보 검사를 통과시킨다.

```bash
# cwd: <repo root>
bash scripts/check-pii.sh
```

오류 메시지 예시에 실제 19자리 ID 를 넣지 않는다. 테스트에는 `scripts/check-pii.sh` 의 `OK_IDS` 에 있는 값을 쓴다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/wiki/page-get.ts` | 수정 |
| `src/resolvers/wiki.ts` | 수정 |
| `src/resolvers/project.ts` | 수정 |
| `src/resolvers/wiki-page-input.ts` | 수정 |
| `src/resolvers/wiki.test.ts` | 수정 |
| `src/resolvers/wiki-page-input.test.ts` | 수정 |
