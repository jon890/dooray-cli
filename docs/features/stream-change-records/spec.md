# 스트림 변경 기록 보기

확인: 2026-11-17

## 목표

웹 방식 `stream list` 로, 웹 화면의 스트림 패널에 보인 활동을 빠짐없이 시각과 함께 볼 수 있다.
업무 상태 변경, 위키 본문 변경, 일정 삭제처럼 지금 출력에서 빠지는 변경 기록을 옵션으로 함께 본다.

## 배경

웹 방식은 `GET /v2/wapi/streams` 의 카드를 공개 API 원소로 바꿔 낸다([stream 웹 경로 실측](../../api/web-endpoints/stream.md)).
공개 API 원소에 담을 칸이 없는 항목은 변환할 때 버리고 개수만 stderr 로 알린다.

2026-11-16 한 계정의 최근 2주 응답(카드 4792장)을 다시 읽었다.

| 버리는 항목 | 건수 | 담긴 값 |
| --- | --- | --- |
| 업무 카드의 본문 없는 하위 기록 | 113 | `createdAt`, `creator`, `postId`, `body.actions[]`(업무 상태 변경 111, 완료일 변경 79, 반복·제목 변경 각 1) |
| 위키 카드의 `pageEventMap` 하위 기록 | 100 | `createdAt`, `creator`, `pageId`, `body.actions[]`(본문 변경 등) |
| `calendar` 카드 | 16 | `source`, `target`, `action.type`(전부 `schedule_deleted`), `at` |
| `project` 카드 | 1 | `source`, `action`(`invited`), `at` |
| `schedule` 카드의 하위 기록 | 2 | 업무 시스템 기록과 같은 `eventMap` 모양. `postId` 대신 `scheduleId` |

- `actions[]` 원소는 `name`(`workflow`, `endedAt`, `subject` 등), `message`(「업무 상태: 변경」 처럼 서버가 준 한국어 문구), `data`(전·후 값)를 가진다. 기록 하나에 원소가 여럿일 수 있다.
- 업무 상태의 전·후 값에는 언어별 이름(`names[]`, `ko_KR` 포함)이 함께 와서 이름을 따로 조회하지 않는다. 완료일은 뒤 값만, 제목은 전·후 값이 온다. 반복, 위키 본문, 참조자 변경은 값이 없거나 길다.
- `pageEvent`, `calendar`, `project` 원소는 모두 `id` 가 있다. 시각은 문자열이고 `calendar`·`project` 의 `at` 은 `+0900` 처럼 콜론 없는 오프셋이다.
- 웹 `eventMap` 의 댓글 수정 시각은 `modifiedAt` 이다(510건 중 28건).
- 실측 문서는 `calendar` 카드를 「캘린더 공유 알림」 으로 적었지만 이번 응답에서는 모두 일정 삭제 알림이었다.
- 업무 댓글(`event`)도 시각이 없다. 웹 `eventMap` 에는 `createdAt` 이 있고 공개 API 원소에도 `createdAt` 이 온다([ADR-078](../../adr/078-stream-list.md)). 변환이 옮기지 않는다.
- 한 시간대의 업무 활동을 세자 25건 중 9건이 출력에서 빠졌고, 남은 댓글 16건은 시각이 없어 시간대로 고를 수 없었다.

## 범위

- 웹 방식 `stream list` 의 변환과 출력만 바꾼다.
- 업무 댓글에 `createdAt` 을 넣는다. 옵션과 무관하게 항상 넣는다.
- `--with-changes` 를 주면 위 표의 버리던 항목을 모두 낸다.
- 범위 밖: 공개 API 방식의 응답 변경, 스트림 읽음 처리(`POST /v2/wapi/streams/read`), 다른 명령.

PR 은 하나다.

## 요구사항과 인수 조건

| ID | 요구사항 | 관측할 인수 조건 |
| --- | --- | --- |
| REQ1 | 웹 방식 업무 댓글 원소에 활동 시각이 있다 | `--json` 의 `event` 원소에 웹 `eventMap` 의 `createdAt` 이 같은 시각으로 있고, 수정된 댓글은 `modifiedAt` 이 `updatedAt` 으로 있다. 표의 시각 칸이 채워진다 |
| REQ2 | 옵션이 없으면 원소 종류와 모양이 지금과 같다 | `--with-changes` 없는 출력이 REQ1 의 `createdAt`·`updatedAt` 말고는 변경 전과 같다. 다만 `--since` 를 주면 업무 댓글을 페이지 커서가 아니라 댓글 자신의 시각으로 고른다. 버린 항목이 있으면 명령 끝에 stderr 로 「옵션을 주면 더 나올 건수」 와 `--with-changes` 안내가 한 번 나온다. 건수는 `--since` 범위 안의 것만 세고 여러 페이지를 합친다 |
| REQ3 | `--with-changes` 를 주면 업무와 일정의 시스템 기록이 `event` 원소로 나온다 | 원소에 `id`, `postId`(일정이면 `scheduleId`), `creator`, `createdAt`, `actions` 가 있고 `body` 키가 없다. `actions` 는 웹 응답의 값 그대로다 |
| REQ4 | `--with-changes` 를 주면 위키 활동, 일정 삭제 알림, 프로젝트 카드가 웹 응답의 종류와 필드로 나온다 | `pageEvent`, `calendar`, `project` 원소가 출력에 있고, 각 원소의 필드가 웹 응답의 값과 같다 |
| REQ5 | 표는 변경 기록의 변경 항목과 전·후 값, 한 사람을 보여 준다 | 기록 하나가 한 행이고 변경이 여럿이면 쉼표로 잇는다. 업무 상태는 「업무 상태: 진행 전 → 진행 중」 처럼 한국어 이름으로, 완료일은 뒤 값만, 제목은 전·후 값으로, 값이 없거나 긴 변경(반복, 본문, 참조자)은 「반복: 변경」 처럼 서버 문구만 보인다. 일정 삭제는 「일정 삭제: <일정 제목>」, 프로젝트 초대는 「프로젝트 초대」 다. 시각 칸과 작성자 칸이 채워지고, 일정 삭제·프로젝트 초대의 작성자는 한 사람(`source`)의 이름이다 |
| REQ6 | `--with-changes` 를 줘도 `--since`, `--all`, `--unread`, `--quiet` 가 같은 규칙으로 동작한다 | `--since` 이전 시각의 변경 기록이 나오지 않고, `--quiet` 은 변경 기록의 id 도 한 줄씩 낸다 |
| REQ7 | 공개 API 방식에서 `--with-changes` 는 무시된다 | 출력이 옵션 없을 때와 같고 stderr 에 무시 경고가 한 번 나온다 |

인수 확인은 단위 테스트의 웹 응답 fixture 와 웹 방식 계정의 실제 실행 둘로 한다.
실제 실행은 위 「한 시간대」 를 다시 골라 업무 활동 25건(댓글 16, 시스템 기록 9)이 모두 시각과 함께 나오는지 본다.

## 결정

| ID | 결정 | 답 | 누가 | 근거 |
| --- | --- | --- | --- | --- |
| DECISION1 | 보이게 할 범위 | 배경 표의 버리던 항목 전부 | 사용자 2026-11-16 | 화면에 보인 것을 빠짐없이 확인하는 것이 목표다 |
| DECISION2 | 버리던 항목을 보이는 때 | `--with-changes` 를 줄 때만. 없으면 지금처럼 빼고 stderr 로 건수와 옵션을 알린다 | 사용자 2026-11-16 | `--json` 을 읽는 스크립트와 스킬은 공개 API 원소만 기대한다. [ADR-056](../../adr/056-json-enrichment-behind-option.md) 의 옵션 뒤 보강과 같은 꼴이다 |
| DECISION3 | 옵션 이름 | `--with-changes` | 사용자 2026-11-17 | 나오는 것이 모두 변경 기록이다. `post get --with-tag-names` 와 같은 `with-` 꼴이다 |
| DECISION4 | 표에서 변경 기록 내용 | 변경 항목과 전·후 값 | 사용자 2026-11-16 | 무엇이 무엇으로 바뀌었는지 한 줄로 보인다 |
| DECISION5 | 업무 시스템 기록의 `--json` 모양 | 공개 API `event` 모양(`read`, `id`, `type`, `postId`, `creator`, `createdAt`)에 `actions` 를 더하고 `body` 키는 뺀다 | 사용자 2026-11-16 | 없는 본문을 지어내지 않는다(웹 세션 인증 스펙 DECISION24) |
| DECISION6 | 나머지 버리던 항목의 `--json` 모양 | 웹 응답의 카드 종류와 필드를 그대로 쓴다 | 사용자 2026-11-17 | CLI 가 새 모양을 만들지 않는다 |
| DECISION7 | 업무 댓글의 `createdAt` | 옵션과 무관하게 항상 넣는다 | 작성자 | 공개 API 원소에 실제로 오는 필드다([ADR-078](../../adr/078-stream-list.md)). 공개 API 모양을 지키는 쪽이다 |
| DECISION8 | 공개 API 방식에서 `--with-changes` | 무시하고 stderr 로 경고한다 | 작성자 | `CLAUDE.md` 「무시되는 옵션」 규약 |
| DECISION9 | 웹 `project` 카드와 공개 API `project` 원소의 이름이 같은 것 | 웹 모양 그대로 내고, 옵션 도움말과 스킬 참조에 웹 모양임을 적는다 | 작성자 | 공개 API `project` 원소가 이 계정 응답에 없어 모양을 맞출 근거가 없다. 옵션을 준 출력에만 나온다 |
| DECISION10 | `stream.md` 의 「캘린더 공유 알림」 표기 | 2026-11-16 실측대로 일정 삭제 알림으로 고친다 | 작성자 | 이번 응답 16건이 모두 `schedule_deleted` 였다 |
| DECISION11 | 일정 삭제·프로젝트 초대의 표 | 작성자 칸에 한 사람(`source`)의 이름, 내용 칸에 항목과 대상(일정 제목) | 사용자 2026-11-17 | 누가 무엇을 했는지 표로 바로 보인다. 이름 조회는 사람마다 한 번이다 |
| DECISION12 | 옵션 없을 때 알리는 건수 | 옵션을 주면 더 나올 건수. `--since` 범위 밖은 빼고 페이지를 합쳐 명령 끝에 한 번 | 사용자 2026-11-17 | 옵션을 주고 다시 돌리면 정확히 그만큼 더 나온다 |
| DECISION13 | 표에서 변경이 여럿인 기록과 변경 항목 이름 | 한 행에 쉼표로 잇고, 항목 이름은 서버의 `message` 에서 「: 변경」 앞부분을 쓴다 | 작성자 | DECISION4 의 「한 줄로 보인다」 를 따른다. 서버가 한국어 이름을 준다 |
| DECISION14 | 일정의 하위 시스템 기록 | 업무 시스템 기록과 같은 `event` 원소로 내고 `postId` 대신 `scheduleId` 를 둔다 | 작성자 | 웹 응답에서 같은 `eventMap` 의 같은 모양이다. DECISION5 를 그대로 적용한다 |
| DECISION15 | 업무 댓글의 수정 시각 | 웹 `modifiedAt` 이 있으면 `updatedAt` 으로 넣는다 | 작성자 | 공개 API `event` 에 `updatedAt` 이 온다([ADR-078](../../adr/078-stream-list.md)). 활동 시각은 가장 늦은 시각 필드로 읽는 기존 규칙을 따른다 |

## 도메인 규칙 변경

도메인 규칙 변경 없음: 출력 규약의 예외는 [ADR-083](../../adr/083-web-only-stream-elements.md) 이 `stream list --with-changes` 에 한정해 둔다. 옵션이 없는 출력은 `CLAUDE.md` 출력 규약과 [ADR-056](../../adr/056-json-enrichment-behind-option.md) 그대로다.

## 결정 기록 연결 (필요할 때만)

| 결정 | 종류 | 선택 이유를 남길 ADR | 현재 규칙의 원본 |
| --- | --- | --- | --- |
| DECISION2, DECISION6 | output-contract | [ADR-083](../../adr/083-web-only-stream-elements.md) | [기술 설계](design.md) 「인터페이스와 데이터」 |
