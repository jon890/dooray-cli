# Phase 01. `wiki list` 에 이름 검색과 project 열을 넣는다

**Execution profile**: standard

## 목표

`dooray wiki list --search <keyword>` 로 위키를 이름으로 찾을 수 있게 하고,
표 출력에 project 열을 더해 그 값을 `wiki page get <project>` 에 그대로 넣을 수 있게 한다.

지금은 위키를 이름으로 찾는 수단이 없어 `--page` 를 올려 가며 전체를 순회해야 하고,
찾아도 출력에 project 코드가 없어 다음 명령으로 이어지지 않는다.

**범위 외**: `wiki page get` 의 입력 형태 확대와 `resolveWiki` 오류 안내는 phase 02 다.
post 입력 오류 안내는 phase 03 이다. README 와 스킬 문서 갱신은 phase 04 다.

## 컨텍스트

**근거 문서**: `docs/adr/043-wiki-name-search-and-project-column.md`,
`docs/flow.md` 의 「위키 흐름」 절, `docs/code-architecture.md` 의 `resolvers/` 와 `formatters/` 트리.

현재 상태는 이렇다.

- `src/commands/wiki/list.ts` 는 `--page` 와 `--size` 만 받고 `client.getWikis` 를 한 번 부른다.
- `src/formatters/wiki.ts` 의 `formatWikiList(wikis, opts)` 는 `ID`, `Name`, `Type` 세 열을 낸다.
- `src/api/client.ts` 의 `getWikis(params?: GetWikisParams)` 는 `page` 와 `size` 만 쿼리로 보낸다. 검색 파라미터가 없다.
- `src/resolvers/wiki.ts` 의 `resolveWikiHomePageId` 는 `client.getWikis({ size: 100 })` 을 한 번만 불러 위키가 100개를 넘으면 뒤쪽을 보지 못한다.

전체 순회는 새로 설계하지 않는다. `src/resolvers/project.ts` 의 `fetchAllProjects` 가 이미 같은 형태다.
`size 100` 으로 시작해 누적 길이가 `res.totalCount` 에 닿으면 멈추고, 그렇지 않으면 `page` 를 하나 올린다.

관련 타입은 이렇다.

```ts
// src/api/types.ts
export interface WikiProject { id: string }
export interface Wiki { id: string; project: WikiProject; name: string; type: string; scope: string; home: WikiHome }
export type WikiListResponse = DoorayApiResponse<Wiki[]>;

// src/cache/types.ts
export interface CachedProject { id: string; code: string; wikiId?: string }
```

`formatWikiList` 의 호출부는 `src/commands/wiki/list.ts:24` 하나뿐이다. 시그니처를 바꿔도 다른 곳이 깨지지 않는다.

## 의도 메모

- 서버 검색을 쓰지 않는다. `GET wiki/v1/wikis` 에 이름으로 거르는 파라미터가 없다.
  `post list --subject` 는 서버 `subjects` 파라미터로 내려가지만 위키에는 대응이 없다.
- 한 페이지 안에서만 거르는 방식을 기각했다. 이슈가 지적한 문제가 전체를 순회해야 한다는 것이라 그대로 남는다.
- 검색 대상은 위키 이름만이다. project 코드를 함께 걸면 이름을 찾는 명령에 의도하지 않은 결과가 섞인다.
- `--json` 에 `projectCode` 를 더하지 않는다. `--json` 은 서버 응답을 그대로 낸다는 출력 규약을 지킨다.
- 위키 목록 캐시(`getWikis`/`setWikis`)를 읽지 않는다. TTL 이 24시간이라 방금 만든 위키가 보이지 않는다.
  그 캐시는 home 페이지 ID 를 담는 용도로만 남긴다.

## 작업 항목

### 1. `src/resolvers/wiki.ts` 에 전체 순회 함수를 만들고 `resolveWikiHomePageId` 가 그것을 쓰게 한다

`fetchAllWikis(client: DoorayApiClient): Promise<Wiki[]>` 를 export 한다.
`src/resolvers/project.ts` 의 `fetchAllProjects` 와 같은 형태로 쓴다.

- `page` 를 0 부터, `size` 는 100 으로 고정한다.
- 매 응답의 `res.result` 를 누적한다.
- 누적 길이가 `res.totalCount` 이상이면 멈추고, 그렇지 않으면 `page` 를 하나 올린다.
- 캐시를 읽거나 쓰지 않는다. 순수 수집 함수로 둔다.

`resolveWikiHomePageId` 의 캐시 미스 경로에서 `client.getWikis({ size: 100 })` 대신 `fetchAllWikis(client)` 를 부른다.
캐시 판정과 `setWikis` 저장은 지금 그대로 둔다.

### 2. `src/resolvers/wiki.ts` 에 이름 필터를 순수 함수로 만든다

`filterWikisByName(wikis: Wiki[], keyword: string): Wiki[]` 를 export 한다.

- `wiki.name` 과 `keyword` 를 각각 `toLowerCase()` 한 뒤 `includes` 로 판정한다.
- `keyword` 가 빈 문자열이면 입력을 그대로 돌려준다.
- 입력 배열의 순서를 유지한다.

### 3. `src/resolvers/project.ts` 에서 project 코드 조회 맵을 만드는 함수를 export 한다

`buildProjectCodeMap(client: DoorayApiClient): Promise<Map<string, string>>` 를 export 한다.
키는 project id, 값은 project code 다.

- `ensureProjects(client)` 의 결과를 넣는다.
- 그다음 `getPrivateProjects()` 를 읽고, 캐시가 있고 `PROJECTS_TTL_MS` 로 만료되지 않았으면 그 항목도 넣는다.
- private 캐시가 없거나 만료됐으면 API 를 부르지 않는다. `resolveProject` 가 이미 같은 정책을 쓴다.

### 4. `src/formatters/wiki.ts` 의 `formatWikiList` 에 project 열을 넣는다

시그니처를 `formatWikiList(wikis: Wiki[], opts: OutputOptions, projectCodeById: Map<string, string>)` 로 바꾼다.

- `headers` 를 `["ID", "Name", "Project", "Type"]` 로 한다.
- Project 열의 값은 `projectCodeById.get(w.project.id) ?? w.project.id` 다.
  코드를 찾지 못하면 project id 를 그대로 낸다. `resolveProject` 가 15자리 이상 numeric 을 project ID 로 받으므로 그 값도 다음 명령에 넣을 수 있다.
- `raw` 는 `wikis` 를 그대로 둔다. `--json` 출력에 project 코드를 넣지 않는다.
- `ids` 는 지금처럼 위키 ID 목록을 유지한다. `--quiet` 출력은 바뀌지 않는다.

### 5. `src/commands/wiki/list.ts` 가 `--search` 를 받고 순회와 필터를 연결한다

`--search <keyword>` 옵션을 더한다. 설명은 `위키 이름 부분 일치 검색 (대소문자 무시)` 로 한다.

동작을 이렇게 가른다.

- `--search` 가 없으면 지금 경로를 유지한다. `client.getWikis({ page, size })` 를 한 번 부른다.
- `--search` 가 있으면 `fetchAllWikis(client)` 로 전체를 받아 `filterWikisByName` 을 적용한다.
- `--search` 와 함께 `--page` 나 `--size` 가 **명시적으로** 주어졌으면 stderr 에 경고를 내고 무시한다.
  경고 문구는 `--search 는 전체 목록에서 찾으므로 --page 와 --size 를 무시합니다.` 로 한다.
  기본값과 구별해야 하므로 `wikiListCommand.getOptionValueSource("page")` 가 `"cli"` 인지로 판정한다.
  `--size` 도 같은 방식으로 본다.
- `--search` 결과가 0건이면 stderr 에 `"<keyword>" 와 이름이 부분 일치하는 위키가 없습니다. 대소문자는 구분하지 않았습니다.` 를 낸다.
  표나 JSON 출력은 그대로 수행한다. 종료 코드는 0 을 유지한다.

`buildProjectCodeMap(client)` 를 불러 `formatWikiList` 의 세 번째 인자로 넘긴다.
`--search` 여부와 무관하게 항상 넘긴다.

스피너 문구는 `--search` 가 있을 때 `위키 목록 전체 조회 중...` 으로 하고, 없으면 지금 문구를 유지한다.

### 6. `src/resolvers/wiki.test.ts` 에 순회와 필터를 검증하는 테스트를 만든다

`src/resolvers/member.test.ts` 와 `src/resolvers/tag.test.ts` 의 mock 방식을 따른다.
`getWikis` 를 `vi.fn()` 으로 두고 `{ result, totalCount }` 를 돌려준다.

- `fetchAllWikis` 가 `totalCount` 가 250 일 때 `getWikis` 를 세 번 부르고 250건을 모두 모은다.
- `fetchAllWikis` 가 `totalCount` 가 0 일 때 빈 배열을 돌려주고 두 번째 호출을 하지 않는다.
- `filterWikisByName` 이 대소문자를 무시한다. 이름 `Design Wiki` 가 키워드 `design` 에 걸린다.
- `filterWikisByName` 이 부분 일치를 본다. 이름 `Design Wiki` 가 키워드 `gn wi` 에 걸린다.
- `filterWikisByName` 이 걸리지 않는 항목을 뺀다.

### 7. `src/formatters/wiki.test.ts` 에 project 열을 검증하는 테스트를 더한다

기존 파일에 더한다.

- `formatWikiList` 가 맵에 있는 project id 를 코드로 바꿔 낸다.
- 맵에 없는 project id 는 그 id 를 그대로 낸다.
- `--json` 출력에 project 코드가 섞이지 않는다. 서버 응답 필드만 나온다.

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm run build
pnpm test
```

셋 다 통과해야 한다. 새로 만든 테스트를 따로 돌린다.

```bash
# cwd: <repo root>
pnpm vitest run src/resolvers/wiki.test.ts src/formatters/wiki.test.ts
```

출력 규약을 grep 으로 확인한다.

```bash
# cwd: <repo root>
grep -c '"Project"' src/formatters/wiki.ts                    # = 1
grep -c "raw: wikis" src/formatters/wiki.ts                   # = 1
grep -c "projectCode" src/formatters/wiki.ts                  # = 0
grep -c "setWikis" src/commands/wiki/list.ts                  # = 0
grep -c "fetchAllWikis" src/commands/wiki/list.ts             # = 1
grep -c "filterWikisByName" src/commands/wiki/list.ts         # = 1
```

여섯 기대값이 모두 맞아야 한다.
`raw: wikis` 가 1 이고 `projectCode` 가 0 인 것이 `--json` 을 raw 로 유지했다는 근거다.

개인 식별 정보 검사를 통과시킨다.

```bash
# cwd: <repo root>
bash scripts/check-pii.sh
```

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/resolvers/wiki.ts` | 수정 |
| `src/resolvers/project.ts` | 수정 |
| `src/formatters/wiki.ts` | 수정 |
| `src/commands/wiki/list.ts` | 수정 |
| `src/resolvers/wiki.test.ts` | 신규 |
| `src/formatters/wiki.test.ts` | 수정 |
