## ADR-043: 위키를 이름으로 찾는 경로를 만들고 목록에 project 를 노출한다

- **status**: `accepted`

- **결정**: `wiki list` 에 `--search <keyword>` 를 넣어 위키 이름에 대소문자를 무시한 부분 일치를 적용한다.
  필터는 `size 100` 으로 `totalCount` 까지 순회한 전체 목록에 적용하고, `--page` 나 `--size` 가 함께 오면 stderr 로 경고한 뒤 무시한다.
  표 출력에 project 열을 더하되 `--json` 은 서버 응답을 그대로 유지한다.
  15자리 이상 숫자가 프로젝트로 해석되지 않아 위키를 찾지 못했을 때, 오류에 위키 본문 링크의 앞 숫자가 orgId 라는 것을 덧붙인다.

- **맥락**: 위키 페이지를 읽으려는 작업에서 명령을 네 번 실패한 보고가 들어왔다 (Issue #154).
  CLI 는 정상 동작했고 종료 코드도 규약대로였다. 넷 다 위키를 찾아가는 경로가 없어서 생겼다.

  당시 `wiki page get` 이 project 를 먼저 요구했고, 위키를 이름으로 찾을 수단이 없어
  `wiki list --page` 를 올려 가며 전체를 순회해야 했다.
  `post list` 에는 `--subject` 가 있고 `mail list` 에는 `--search` 가 있다.
  이름의 대소문자를 잘못 가정해 목록에서 놓치는 실패도 함께 일어났다.

  **페이지 ID 하나로 시작하는 경우는 이 ADR 이 다루지 않는다.**
  `GET /wiki/v1/pages/{page-id}` 가 공개 API 에 있어 project 없이 조회된다 ([ADR-045](045-wiki-page-standalone-fetch.md)).
  이 ADR 이 정하는 것은 위키를 **이름으로** 찾는 경로다.
  페이지 ID 를 모르고 위키 자체를 찾아야 할 때, 또는 그 위키의 페이지 목록이나 트리를 보려 할 때가 여기 해당한다.

  목록을 순회해 위키를 찾아도 다음 명령으로 이어지지 않는다.
  출력이 `ID`, `Name`, `Type` 세 열이고 `Wiki` 응답은 `project.id` 만 담아 project 코드가 없다.
  `wiki pages <project>` 나 `wiki tree <project>` 에 넣을 값을 얻으려면
  `--json` 으로 `project.id` 를 꺼내 프로젝트 목록과 다시 대조해야 한다.
  이 두 명령은 페이지 ID 가 아니라 project 를 받으므로 ADR-045 의 경로로 대체되지 않는다.

  `dooray://<number>/pages/<pageId>` 의 앞 숫자는 orgId 다.
  `src/utils/task-link.ts` 와 `src/utils/mention.ts` 가 `dooray://${me.orgId}/...` 형태로 링크를 만든다.
  이 값을 project 자리에 넣으면 `resolveProject` 의 15자리 이상 numeric 우회(ADR-030)를 통과해 그대로 반환되고,
  `resolveWiki` 가 그 값으로 프로젝트 캐시를 다시 뒤져 실패한다.
  사용자가 받은 `프로젝트에 위키가 없습니다` 는 이 경로에서 나온 것이다.

  이름 검색을 서버에 맡길 수 없다. `GET wiki/v1/wikis` 는 `page` 와 `size` 만 받는다.
  `post list --subject` 는 서버의 `subjects` 파라미터로 내려가지만 위키에는 대응하는 것이 없다.

  전체를 순회하는 것은 이슈가 지적한 문제가 전체를 순회해야 한다는 것이기 때문이다.
  한 페이지 안에서만 거르면 그 문제가 그대로 남는다.
  `src/resolvers/project.ts` 의 `fetchAllProjects` 가 이미 같은 형태로 `size 100` 씩 `totalCount` 까지 순회하므로 새 패턴이 아니다.
  `resolveWikiHomePageId` 는 `size 100` 을 한 번만 불러 위키가 100개를 넘으면 뒤쪽을 보지 못하는데, 같은 순회 함수를 쓰면 그 누락도 함께 사라진다.

  목록 캐시는 읽지 않는다. `~/.dooray/cache` 의 위키 캐시는 home 페이지 ID 를 담고 TTL 이 24시간이며,
  home 페이지가 거의 바뀌지 않는다는 것이 그 TTL 의 근거다.
  `wiki list` 는 목록을 보여주는 명령이라 방금 만든 위키가 보여야 한다.

  `dooray://` 링크를 `--url` 로 받을 수는 없다. 그 형태는 orgId 와 pageId 만 담고 wikiId 가 없어
  위키를 특정할 정보가 링크 안에 없다. 그래서 입력으로 받는 대신 오류 안내로 그 앞 숫자가 무엇인지 알린다.

- **대안 기각**:
  - `--all` 로 전체를 받아 사용자가 직접 찾는다. 이슈가 원한 것은 이름으로 찾는 것이고 전체 출력은 그 수단이다. `--search` 가 목적을 직접 담는다.
  - 검색 대상에 project 코드를 함께 넣는다. 이름을 찾는 명령에 의도하지 않은 결과가 섞인다.
  - project 코드를 표 대신 `--json` 에 `projectCode` 필드로 넣는다. `--json` 을 raw 로 두는 출력 규약을 깬다.
  - `wiki page get` 이 페이지 ID 만으로 조회하게 한다. 위키 API 가 page-only fetch 를 지원하지 않아 wikiId 없이는 요청을 만들 수 없다.
  - 대소문자를 구분해 검색한다. 이슈의 네 번째 실패가 대소문자 착오였으므로 구분하면 그 실패가 남는다.

- **결과**:
  - 얻는 것: 위키 이름의 일부만 아는 상태에서 `wiki list --search` 로 그것을 찾고,
    그 표의 project 값을 `wiki pages` 나 `wiki tree` 에 그대로 넣어 페이지 목록까지 갈 수 있다.
    위키가 100개를 넘는 조직에서도 `resolveWikiHomePageId` 가 뒤쪽 위키를 놓치지 않는다.
    orgId 를 project 로 넣은 실수는 오류 메시지 자체가 원인을 알려준다.
  - 감당할 것: `--search` 는 위키 수를 100으로 나눈 만큼 API 를 호출한다.
    `wiki list` 가 프로젝트 캐시를 읽게 되므로, 캐시가 비었거나 만료된 첫 실행에서 프로젝트 전체 순회가 더해진다.
    표에 열이 하나 늘어 좁은 터미널에서는 줄이 접힌다.
    project 캐시에 없는 위키는 코드 대신 `project.id` 가 보여, 표만 보고는 둘을 구별할 수 없다.

- **적용 범위**: `wiki page get` 도 `resolveWikiPageInput` 을 쓰게 해
  `wiki page file`, `wiki page comment`, `wiki page delete` 와 입력 형태를 맞춘다.
  ADR-020 이 정한 입력 통합을 남은 명령 하나에 적용하는 것이고 새 결정은 아니다.
  `--id` 모드가 `--project` 를 동반해야 하는지는 [ADR-045](045-wiki-page-standalone-fetch.md) 가 정한다.

  검색 결과가 0건이면 stderr 로 알린다.
  이슈의 네 번째 실패가 목록에서 놓친 것이라, 결과가 없는 것과 검색이 걸리지 않은 것을 구별해 준다.
