## ADR-054: 개인 프로젝트 코드는 공용 목록에서 실패한 자리에서 private 목록을 받아 다시 찾는다

- **status**: `accepted`

- **결정**: `resolveProject` 가 공용 프로젝트 캐시에서 입력을 찾지 못하면,
  그 자리에서 private 프로젝트 목록을 받아 캐시에 채우고 다시 찾는다.
  그래도 없을 때만 오류를 낸다.
  위키를 찾는 `resolveWiki` 도 공용 캐시 하나가 아니라 공용과 private 두 캐시를 모두 본다.
  두 캐시에서 모두 못 찾으면 그 자리에서 private 목록을 받아 채우고 다시 찾는다.
  **캐시를 읽는 것만으로는 모자란다.** 입력이 15자리 이상 숫자면 `resolveProject` 가
  그것을 projectId 로 보고 즉시 돌려주므로([ADR-030](030-resolveproject-numeric-fallback.md)) 어느 캐시도 채워지지 않은 채
  `resolveWiki` 에 닿는다. 그 경로에서 캐시만 읽으면 개인 프로젝트의 projectId 는
  종전과 같이 `프로젝트에 위키가 없습니다` 로 끝난다.

- **맥락**: `resolveProject` 는 private 캐시가 **이미 유효할 때만** 그 안을 찾았다.
  캐시가 없거나 기간이 지나면 `dooray project list --type private` 를 사람이 먼저 실행해야 했다.
  그래서 개인 프로젝트를 코드로 지정하는 자동화가 한동안 동작하다가 기간이 지나면 실패한다.
  실패 시점이 캐시 기간에 달려 있어 호출하는 쪽이 예측할 수 없다.

  `resolveWiki` 는 `resolveProject` 를 부른 뒤 공용 프로젝트 캐시에서만 `wikiId` 를 꺼낸다.
  개인 프로젝트는 private 캐시에만 있으므로 항목을 찾지 못하고,
  위키가 있는데도 `프로젝트에 위키가 없습니다` 로 끝난다.
  `wiki tree`, `wiki pages`, `wiki page edit` 이 이 경로를 쓴다.
  같은 위키를 `wiki page get --id <pageId>` 로는 정상 조회할 수 있어, 명령 사이에 동작이 갈린다.

  `wiki page edit` 은 `--id` 모드가 없어 페이지 ID 로 우회할 수도 없다.
  `wiki page get`, `file`, `comment`, `delete` 는 `--id` 를 받는다. 이 명령만 다르다.

  프로젝트 코드 대신 projectId 를 직접 넣어도 결과가 같다.
  그 경로는 캐시를 아예 거치지 않으므로, 캐시가 유효한지와도 무관하게 항상 실패한다.

- **실측으로 확인한 것**:
  `project list --type private --json` 이 개인 프로젝트의 `id` 와 `code` 와 `wikiId` 를 모두 내려준다.
  위키를 찾는 데 필요한 값이 이 목록 안에 다 있다.

- **대안 기각**:
  - **입력이 `@` 로 시작할 때만 private 목록을 받는다** — 개인 프로젝트 코드의 형태에 기대는 것이다.
    그 형태가 아닌 개인 프로젝트가 있으면 같은 실패가 남고, 실패가 다시 형태에 달려 있어 예측할 수 없다.
  - **private 캐시의 유효 기간만 늘린다** — 기간이 지나면 같은 일이 다시 난다.
    기간을 늘릴수록 프로젝트를 새로 만든 직후의 조회가 틀린 캐시를 읽는다.
  - **공용 목록과 private 목록을 한 캐시로 합친다** — `project list --type private` 가 두 목록을 구분해 보여주고 있어
    합치면 그 명령의 결과가 달라진다. 목록을 받는 조건도 서로 다르다.
  - **`resolveWiki` 가 `wikiId` 를 직접 받게 한다** — 15자리 이상 숫자를 projectId 로 볼지 wikiId 로 볼지 구별할 수 없다.
    `resolveProject` 가 그 형태를 이미 projectId 로 해석하고 있어([ADR-030](030-resolveproject-numeric-fallback.md)) 뜻이 겹친다.

- **결과**:
  - 얻는 것: 개인 프로젝트 코드가 캐시 상태와 무관하게 동작한다.
    사람이 `project list --type private` 를 미리 실행하지 않아도 되고, 그 안내를 담은 오류도 줄어든다.
    `wiki tree`, `wiki pages`, `wiki page edit` 이 개인 위키를 다룬다.
    `wiki page edit --id <pageId>` 가 생겨 위키 페이지 명령 다섯의 입력 형태가 같아진다.
  - 감당할 것: 존재하지 않는 프로젝트 코드를 넣으면 오류가 나기 전에 private 목록 조회가 한 번 나간다.
    오타를 낸 호출마다 왕복이 하나 붙는다. 조회 결과는 캐시에 남으므로 같은 세션에서 반복되지는 않는다.
    private 프로젝트가 많은 계정에서는 그 조회가 목록 크기를 100으로 나눈 만큼의 호출이 된다.
    `--link-task` 는 링크마다 `resolveProject` 를 병렬로 부르므로(`src/resolvers/task-link.ts`)
    private 캐시가 비어 있으면 그 목록 조회가 링크 수만큼 동시에 나갈 수 있다.
    `api/rate-limiter` 가 요청 간격을 조절하고([ADR-039](039-rate-limit-token-bucket.md)) 받은 목록이 캐시에 남으므로 그대로 둔다.

- **적용 범위**: `src/resolvers/project.ts` 의 `resolveProject`,
  `src/resolvers/wiki.ts` 의 `resolveWiki`, `src/commands/wiki/page-edit.ts` 의 입력 모드.
