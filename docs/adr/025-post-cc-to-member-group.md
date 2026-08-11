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
PostUser type 의 그룹 분기는 `type: "memberGroup"` 이 아니라 `type: "group"`, `Group.projectMemberGroupId` — 이슈 본문 시도가 실패한 원인.

**대안 기각**:
- cc-only patch endpoint 역공학 — 부재 확인 (`POST .../set-cc`, `.../cc`, `.../to-and-cc` 모두 null 응답)
- `{ "type": "memberGroup", "memberGroup": { "memberGroupId": "..." } }` 형식 (이슈 본문 시도) — `Failed to read HTTP message`.
  실제 API contract 는 `type: "group"`, `Group.projectMemberGroupId` (api/types.ts:122-125)
- subcommand 분리 (`post participants {add,set,remove}`) — `post edit` 의 다른 옵션 (title/body/mention/link-task) 과 조합 불가, 한 번 PUT 으로 끝낼 수 없어 race 위험
- replace 기본 정책 — 사용자가 매번 전체 멤버/그룹 알아야 함, 자동화 친화성 떨어짐. append, `--cc-clear` / `--to-clear` 채택

**적용 범위**: `post edit`, `post create`.

**보강 (2026-08-06, Issue #108)**: `post edit` 의 참조자·담당자 옵션 6개 중 하나라도 있으면 제목·본문 없이 비대화형 수정으로 진입한다.
`getPost` 로 조회한 제목과 본문을 `updatePost` 전체 갱신 요청에 재사용하고, 태그 변경 옵션이 없으면 `tagIds` 를 보내지 않아 기존 태그를 보존한다.
따라서 참여자 옵션을 무시한다는 대화형 경고는 제거한다.
멘션·업무 링크·상위 업무 옵션의 단독 호출 지원은 이 결정의 범위에 포함하지 않는다.
