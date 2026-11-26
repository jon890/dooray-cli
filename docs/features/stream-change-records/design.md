# 스트림 변경 기록 보기 기술 설계

스펙: [spec.md](spec.md)

## 요구사항 연결

| ID | 해결 방법 |
| --- | --- |
| REQ1 | 웹 변환이 업무 댓글 원소에 `eventMap` 의 `createdAt` 을 넣고, `modifiedAt` 이 시각 문자열이면 `updatedAt` 으로 넣는다. 값이 없거나 읽을 수 없으면 키를 넣지 않는다 |
| REQ2 | 웹 변환이 변경 기록을 만들되, 옵션이 없으면 `result` 대신 응답의 `changes` 에 둔다. `fetchStreams` 가 `--since` 규칙을 `changes` 에도 적용해 세고, 명령이 출력을 다 쓴 뒤 한 번 알린다 |
| REQ3 | 본문 글이 없는 업무 하위 항목과 일정 하위 항목을 `event` 원소로 바꾸고 `actions` 를 넣는다 |
| REQ4 | `pageEventMap` 항목, `calendar` 카드, `project` 카드를 웹 응답 그대로 원소로 낸다. 필드를 더하거나 빼지 않는다 |
| REQ5 | `commands/stream/feed.ts` 의 표 헬퍼가 `actions`, `action` 키가 있는 원소만 새 요약으로 읽는다. 작성자 이름은 웹 구현의 이름 캐시와 멤버 상세 조회로 채운다 |
| REQ6 | 변경 기록도 같은 `result` 배열에 카드 순서대로 들어가 기존 `--since`, `--quiet`, `--unread` 경로를 그대로 탄다 |
| REQ7 | `stream list` 가 인증 방식이 `web` 이 아니면 옵션을 끄고 stderr 로 경고한다 |

## 책임과 경계

기존 경계를 그대로 쓴다. 새 모듈이나 계층은 없다.

| 자리 | 책임 |
| --- | --- |
| `src/api/stream/types.ts` | `GetStreamsParams.withChanges`, `StreamListResponse.changes`·`unknown`(웹 방식만 채움) 계약 |
| `src/api/stream/web.ts` | 카드를 원소로 바꾸고 공개 API 종류인지 변경 기록인지 가른다. 응답의 `organizationMemberMap` 이름을 `context.memberNames` 에 넣는다. stderr 에 직접 쓰지 않는다 |
| `src/api/stream/public.ts` | 바뀌지 않는다. `withChanges` 를 서버에 보내지 않는다 |
| `src/commands/stream/feed.ts` | `FetchStreamsOptions.withChanges` 를 `getStreams` 에 넘긴다. 페이지마다 `changes` 에 `--since` 를 적용해 세고 `unknown` 을 더한다. 표 요약과 작성자 헬퍼를 넓힌다 |
| `src/commands/stream/list.ts` | `--with-changes` 옵션과 도움말, 공개 API 방식 경고, 표의 이름 채우기, 끝의 안내 |
| `src/formatters/datetime.ts` | `formatSentAt` 이 `+0900` 오프셋도 `YYYY-MM-DD HH:MM` 으로 줄인다 |

의존 방향은 `commands → api` 그대로다([ADR-082](../../adr/082-code-structure.md)). 명령은 웹 응답 맵을 직접 읽지 않고, 이름은 `MemberClient` 계약(`getMemberNameFromList`, `getMemberDetail`)으로 얻는다.

## 인터페이스와 데이터

웹 응답 모양의 원본은 [stream 웹 경로 실측](../../api/web-endpoints/stream.md)이다. 이 기능에서 그 문서에 변경 기록 절을 더한다.

변경 기록 원소:

| 웹 원본 | 원소 |
| --- | --- |
| 업무 카드 `eventList[]` 중 `eventMap` 항목의 `body.mimeType` 이 문자열이 아닌 것 | `{type: "event", event: {read, id, type, postId, creator, createdAt, updatedAt?, actions}}`. `body` 키 없음. `actions` 는 `body.actions` 그대로이고, 없으면 `[]` |
| 일정 카드 `eventList[]` 의 `eventMap` 항목 중 본문 글이 없는 것 | 위와 같고 `postId` 대신 `scheduleId` |
| 위키 카드 `eventList[]` 중 `pageEventMap` 항목 | `{type: "pageEvent", pageEvent: <항목 그대로>}` |
| `calendar` 카드 | `{type: "calendar", calendar: <카드의 calendar 그대로>}` |
| `project` 카드 | `{type: "project", project: <카드의 project 그대로>}` |

- 원소 순서는 카드 순서이고, 카드 안에서는 지금처럼 카드 원소 뒤에 하위 항목을 `eventList` 순서대로 둔다.
- 옵션이 없을 때 변경 기록은 `result` 에서 빠지고 `changes` 에 같은 모양으로 들어간다. `changes` 와 `unknown` 은 `--json` 출력에 나가지 않는다.
- `unknown` 은 CLI 가 모르는 카드 종류, 어느 맵에도 없는 하위 항목(업무·위키·일정 카드 모두), 변환하다 모양이 맞지 않은 변경 기록, 본문 글이 있는 일정 하위 항목의 수다. 지금 업무·위키 하위 항목이 맵에 없을 때 응답 오류로 멈추던 것도 `unknown` 으로 바꾼다. 카드 자체(`postMap`, `pageMap` 등)의 누락과 공개 API 종류 원소의 모양 오류는 지금처럼 응답 오류로 멈춘다.
- 변경 기록의 `createdAt` 이 시각 문자열이 아니면(없음, `null`, 다른 형식) 그 기록을 `unknown` 으로 센다. 시각이 없으면 `--since` 를 적용할 수 없다.
- 2026-11-16 응답에서 `pageEventMap` 항목의 `creator.member.name` 은 100건 모두 있었다. `calendar`·`project` 의 `source` 에는 `organizationMemberId` 만 있다.

표 요약(REQ5): 모델에 `actions` 배열이 있는 `event`, `body.actions` 가 있는 `pageEvent`, `source` 키가 있는 `calendar`·`project` 만 아래 규칙을 쓴다. 공개 API `project` 원소에도 `action` 이 있지만 사람은 `actor` 로 오고 `source` 가 없으므로 기존 요약 그대로다. 댓글 `event` 도 그대로다.

| 원소 | 내용 칸 | 작성자 칸 |
| --- | --- | --- |
| 변경 기록 `event` | `actions` 를 쉼표로 잇는다. 항목 이름은 `message` 의 「: 변경」 앞부분이다(스펙 DECISION13). `workflow` 는 「<이름>: <전 ko_KR 이름> → <후 ko_KR 이름>」, `endedAt` 은 「<이름>: <뒤 값 날짜>」, `subject` 는 「<이름>: <전> → <후>」, 나머지는 `message` 그대로 | `creator.member.name` |
| `pageEvent` | `body.actions[].message` 를 쉼표로 잇는다 | `creator.member.name` |
| `calendar` | `action.type` 이 `schedule_deleted` 면 「일정 삭제: <target.schedule.subject>」, 모르는 값이면 `action.type` 그대로 | `source.organizationMemberId` 의 이름 |
| `project` | `action` 이 `invited` 면 「프로젝트 초대」, 모르는 값이면 그 값 그대로 | `source.organizationMemberId` 의 이름 |

- `ko_KR` 이름이 없으면 첫 이름을 쓰고, 이름이 하나도 없으면 `message` 를 쓴다. 표의 60자 자르기는 기존 그대로다.
- `source` 이름은 `getMemberNameFromList` 로 먼저 찾고, 없는 사람만 `getMemberDetail` 로 한 번씩 찾는다(스펙 DECISION11). 조회가 실패하면 그 칸에 멤버 id 를 보이고 stderr 로 한 번 경고한다. 표 표시만의 보강이라 명령을 실패로 끝내지 않는다.
- `--json` 과 `--quiet` 에서는 이름을 찾지 않는다.

안내(REQ2): `FetchStreamsResult` 에 `hiddenChanges`, `unknown` 을 더한다. 출력을 다 쓴 뒤 stderr 로 낸다.

- `hiddenChanges > 0`: `ℹ  변경 기록 N건을 뺐습니다. --with-changes 로 함께 봅니다.`
- `unknown > 0`: `ℹ  웹 응답에 CLI 가 모르는 항목 N건이 있어 뺐습니다.`

지금 웹 구현이 첫 번째로 버린 페이지에서 내는 경고는 없앤다.

## 실패와 일관성

- 읽기 전용 명령이라 트랜잭션과 재시도 변경은 없다. 429 와 응답 오류 처리는 [ADR-078](../../adr/078-stream-list.md) 그대로다.
- 옵션이 없는 호출에 새 실패 경로를 만들지 않는다. 변경 기록 변환에서 맵 항목이 없거나 모양이 맞지 않으면 `unknown` 으로 세고 넘어간다. 시각 필드는 시각 문자열일 때만 옮긴다.
- 한 페이지가 공개 API 종류 없이 변경 기록만으로 이루어지면, 옵션이 없을 때 `result` 가 빈다. 지금처럼 웹 구현이 다음 커서로 이어 받고, 이어 받으며 모은 `changes` 와 `unknown` 을 합쳐 돌려준다. `--with-changes` 를 줘도 같은 페이지에서 이어 받아 두 호출이 같은 페이지 범위를 본다(PR 리뷰 반영).
- `fetchStreams` 는 빈 `result` 로 끝내기 전에 그 응답의 `changes` 와 `unknown` 을 먼저 센다.
- 한 페이지만 받는 기본 모드에서 첫 페이지가 변경 기록뿐이면, 옵션이 없을 때는 다음 페이지 원소와 두 페이지의 변경 기록 건수가 나오고, 옵션을 주면 첫 페이지만 나온다. 「옵션을 주면 그만큼 더 나온다」 가 이 경우에만 맞지 않는다. 드문 경우라 받아들이고 도움말 대신 이 설계에 남긴다.
- `changes`·`unknown` 은 웹 구현만 채우므로 공개 API 방식에서는 안내가 나오지 않는다.

## 검증 전략

| ID | 경계 | 방법 |
| --- | --- | --- |
| REQ1, REQ3, REQ4 | 웹 변환 | `src/api/stream/web.test.ts` 에 fixture(`src/api/web/fixtures/stream/responses.json`)를 더해 원소 모양과 순서, `changes` 분리, 원본 필드 보존, 맵 누락과 모양 오류의 `unknown`, `modifiedAt: null` 을 확인한다. 기존 경고 테스트는 `unknown` 건수 테스트로 바꾼다 |
| REQ2, REQ6 | 페이지 넘기기 | `src/commands/stream/list.test.ts` 에서 가짜 클라이언트로 `--since` 경계 앞뒤의 변경 기록 건수, 빈 `result` 페이지의 `changes` 집계, 안내 문구, `--quiet` id 출력을 확인한다 |
| REQ5 | 표 헬퍼와 이름 | `feed.ts` 헬퍼 단위 테스트, 공개 API `project` 원소의 기존 요약 유지, 이름 캐시 우선과 상세 조회 한 번, 조회 실패 경고, `formatSentAt` 의 `+0900` |
| REQ7 | 명령 | 공개 API 방식 설정으로 경고 한 번과 출력 동일을 확인한다 |
| 전체 | 실제 웹 계정 | 스펙 「인수 조건」 의 한 시간대를 `--since` 와 `--json --with-changes` 로 받아 업무 활동 25건이 시각과 함께 나오는지 본다. 사람이 직접 돌리는 확인이다 |

fixture 의 id 와 이름은 가짜 값으로 쓰고 `node scripts/check-pii.mjs` 를 통과시킨다.

## 문서 변경

[plan 오버레이](../../../.claude/plan-overlay.md) 「신규 ADR 동반 변경」 행을 따른다.

- `docs/adr/083-web-only-stream-elements.md` 와 `docs/adr/INDEX.md` 한 줄
- `CLAUDE.md` 「명령 공통 규약」 출력 줄에 [ADR-083](../../adr/083-web-only-stream-elements.md) 예외 한 줄, `docs/code-architecture.md` 「출력 원칙」 에 같은 한 줄
- `docs/api/web-endpoints/stream.md`: 변경 기록 절, 「캘린더 공유 알림」 정정(스펙 DECISION10)
- `docs/flow.md` 의 `stream list` 절: 입력에 `--with-changes`, 출력 뒤 건수 안내
- `docs/guide/setup.md` 의 웹 방식 차이 표 `stream list` 행
- `skills/dooray-cli/SKILL.md` 의 `stream list` 행들. `--with-changes` 출력은 웹 모양이고 `project` 원소가 공개 API 모양과 다를 수 있다고 적는다(스펙 DECISION9)
- `stream list --with-changes` 도움말에 「웹 방식만, 웹 응답 모양 그대로」 를 적는다
- `README.md` 의 자주 쓰는 명령에 `--with-changes` 한 줄

## 결정

| ID | 결정 | 답 | 누가 | 근거 |
| --- | --- | --- | --- | --- |
| DECISION1 | 옵션이 없을 때 변경 기록을 어디서 세나 | 웹 구현이 변경 기록을 만들어 `changes` 로 돌려주고 `fetchStreams` 가 `--since` 를 적용해 센다 | 작성자 | 스펙 DECISION12 의 건수는 원소 시각이 있어야 셀 수 있다. 변환을 두 번 만들지 않는다 |
| DECISION2 | 표의 `source` 이름 | 웹 구현이 응답의 멤버 맵을 이름 캐시에 넣고, 명령이 캐시에 없는 사람만 상세 조회한다. `--json` 원소에는 이름을 더하지 않는다 | 작성자 | 스펙 DECISION6(웹 응답 그대로)과 DECISION11(사람마다 한 번 조회)을 함께 지킨다. 2026-11-16 실측 17건이 모두 맵에 있어 추가 조회는 대개 없다 |
| DECISION3 | 본문 글이 있는 일정 하위 항목 | `unknown` 으로 센다 | 작성자 | 스펙은 일정 하위 항목을 시스템 기록으로만 정했다(DECISION14). 실측 2건은 모두 본문 글이 없었다. 새 모양을 만들지 않는다 |
| DECISION4 | 맵에 없는 하위 항목과 모양이 맞지 않은 변경 기록 | 카드 종류와 상관없이 `unknown` 으로 세고 넘어간다 | 작성자 | 옵션이 없는 호출에 새 실패 경로를 만들지 않는다. 하위 항목이 변경 기록인지는 맵에서 찾아야 알 수 있어, 업무·위키 하위 항목의 누락도 같은 규칙으로 둔다 |
| DECISION5 | 공개 API 방식 경고 자리 | `stream list` 명령. 클라이언트 계약은 `withChanges` 를 받기만 한다 | 작성자 | 설정의 인증 방식을 아는 곳이 명령이다. `CLAUDE.md` 「무시되는 옵션」 규약 |
| DECISION6 | 안내를 내는 자리 | 웹 구현은 건수만 돌려주고 명령이 끝에 한 번 낸다. 지금의 첫 페이지 경고는 없앤다 | 작성자 | 여러 페이지의 건수를 합칠 수 있는 곳이 명령이다. 같은 안내가 두 번 나오지 않는다 |
| DECISION7 | 이름 조회 실패 | 멤버 id 를 보이고 stderr 로 한 번 경고한다 | 작성자 | 표 표시만의 보강이다. [ADR-056](../../adr/056-json-enrichment-behind-option.md) 의 실패 규칙은 `--json` 에 값을 더하는 옵션에 대한 것이다 |
| DECISION8 | 첫 페이지가 변경 기록뿐일 때 건수가 어긋나는 것 | 받아들인다 | 작성자 | 기본 한 페이지 모드에서만 생기고, `--since`·`--all` 에서는 맞다 |

## 결정 기록 연결

| 결정 | 종류 | ADR 또는 필요 없음의 이유 | 현재 규칙의 원본 |
| --- | --- | --- | --- |
| 스펙 DECISION2, DECISION6 | architecture | [ADR-083](../../adr/083-web-only-stream-elements.md). [ADR-081](../../adr/081-web-session-auth.md) 의 `--json` 공개 모양 원칙에 대한 `stream list --with-changes` 한정 예외 | 이 설계의 「인터페이스와 데이터」, `CLAUDE.md` 출력 줄 |
| 이 설계의 DECISION1~8 | — | 필요 없음: 이 기능 안의 배치와 기존 규약 적용이다 | 이 설계 |
