## ADR-084: 참조·담당 그룹은 프로젝트 목록에 없는 ID 도 그대로 넘긴다

- **status**: `accepted`
- **decision-type**: `behavior`
- **areas**: `post`
- **현재 규칙의 원본**: `src/resolvers/member-group.ts` 의 `resolveMemberGroup` 과 그 `allowUnlistedId` 옵션, 호출은 `src/resolvers/post-users.ts`
- **결정**: `--cc-group`, `--to-group` 에 15자리 이상 숫자 ID 를 주면 그 업무 프로젝트의 그룹 목록에 있을 때만 코드를 채우고, 없으면 실패하지 않고 그 ID 를 코드 없이 서버로 넘긴다. 서버가 거부하면 `API 호출 실패: <서버 메시지>` 로 나온다.
  본문 멘션(`--mention-group`, 댓글의 그룹 멘션)은 멘션 문구에 그룹 코드가 필요하므로 이 완화를 쓰지 않고 목록에 없는 ID 를 지금처럼 거절한다. 코드 부분일치 흐름은 그대로다.
- **맥락**: 한 업무의 참조에 다른 프로젝트의 그룹이 이미 들어 있는 경우가 있고, 서버는 다른 프로젝트 그룹 ID 를 받는다. 그런데 CLI 는 그 프로젝트의 그룹 목록에서만 ID 를 찾아, 다른 프로젝트 그룹을 참조로 넣으려면 웹에서 직접 넣어야 했다.
- **대안 기각**:
  - **모든 호출에서 목록 밖 ID 를 허용** — 멘션 본문이 `@프로젝트/` 처럼 코드가 빈 문구로 깨진다.
  - **다른 프로젝트 그룹 목록을 따로 조회** — 어느 프로젝트인지 사용자가 알려야 하고 호출이 늘어난다.
- **결과**:
  - 얻는 것: 다른 프로젝트 그룹 ID 로 참조자·담당자를 CLI 에서 지정한다.
  - 감당할 것: 오타 난 ID 는 CLI 가 아니라 서버가 거절하므로 오류가 서버 메시지에 달린다. `--dry-run` 출력의 코드 칸은 빈 값이다.
- **확인 방법**: `src/resolvers/member-group.test.ts`, `src/resolvers/post-users.lookup.test.ts`, `src/api/public/http.group-reject.test.ts`
