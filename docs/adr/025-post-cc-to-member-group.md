## ADR-025: `post edit/create` cc/to 에 member-group 추가 (full payload PUT + `type: "group"`)

**결정**: `post edit` 에 `--cc <name>`, `--cc-group <code>`, `--cc-clear`, `--to <name>`, `--to-group <code>`, `--to-clear` 6 옵션 추가.
`post create` 에 `--cc-group`, `--to-group` 2 옵션 추가.
모두 기존 `updatePost` / `createPost` 의 **full payload PUT** 흐름 (`users: { to, cc }`) 으로 처리.
그룹은 `{ type: "group", group: { projectMemberGroupId } }` 객체로 전송.

**맥락**: Issue #54 — 자동화 스크립트의 워크플로우:
- audit 리포트 생성
- 신규 업무 생성
- 그룹 cc 첨부
Dooray API 는 cc-only patch 단독 엔드포인트 미제공.
PUT post 의 full payload 만 cc/to 갱신 가능.
PostUser type 의 그룹 분기는 `type: "memberGroup"` 이 아니라 `type: "group"` + `Group.projectMemberGroupId` — 이슈 본문 시도가 실패한 원인.

**대안 기각**:
- cc-only patch endpoint 역공학 — 부재 확인 (`POST .../set-cc`, `.../cc`, `.../to-and-cc` 모두 null 응답)
- `{ "type": "memberGroup", "memberGroup": { "memberGroupId": "..." } }` 형식 (이슈 본문 시도) — `Failed to read HTTP message`.
  실제 API contract 는 `type: "group"` + `Group.projectMemberGroupId` (api/types.ts:122-125)
- subcommand 분리 (`post participants {add,set,remove}`) — `post edit` 의 다른 옵션 (title/body/mention/link-task) 과 조합 불가, 한 번 PUT 으로 끝낼 수 없어 race 위험
- replace 기본 정책 — 사용자가 매번 전체 멤버/그룹 알아야 함, 자동화 친화성 떨어짐. append + `--cc-clear` / `--to-clear` 채택

**적용 범위**: `post edit` + `post create`. interactive ($EDITOR) 모드는 frontmatter 와 충돌 → 옵션 사용 시 stderr 경고 후 무시 (mention/link-task 동일 패턴 적용).
