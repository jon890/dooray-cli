# 웹 세션 인증 PR4(messenger·calendar·stream·persona) 인수 검증 계획

## 인수 검증 계획

| 요구사항 | 준비 조건 | 실행 절차 | 기대 결과 | 실행 환경 | 실행 담당 | 선행 조건 | 시점 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| REQ6 (calendar) | 직접 쓴 가짜 웹 응답 고정 파일 | `src/api/calendar/web.test.ts` | 키·구조·날짜 형식이 공식 스키마와 같다. 종일 일정은 `YYYY-MM-DD+09:00`, 웹에 없는 값은 키가 없다. 기간 초과·없는 일정은 종료 코드 1 | 로컬 mock | worker | PR1 머지 | PR 전 |
| REQ6 (stream) | 가짜 카드·참조 맵 | `src/api/stream/web.test.ts` | 카드가 공식 원소로 바뀌고 `cursor` 가 올라온다. 웹에만 있는 카드는 빠지고 개수를 알린다. 참조 누락은 종료 코드 1 | 로컬 mock | worker | PR1 머지 | PR 전 |
| REQ6 (messenger) | 가짜 채널·로그 응답 | `src/api/messenger/web.test.ts` | 채널 `type`·`status`·시각이 공식 모양, 로그는 최신이 앞, `hasMore` 가 올라온다 | 로컬 mock | worker | PR1 머지 | PR 전 |
| REQ6·REQ7 | 허용한 웹 장소 | `remote-verification.md` 의 명령을 웹 방식으로 실행 | 명령별 `--json` 이 공식 필드와 같고 만든 것이 지워진다 | 임시 HOME·웹 | worker | PR1 머지, 임시 HOME 에 쿠키 | PR 뒤 |
| REQ7 | 개인 캘린더·나에게 보내는 대화 | `calendar event create·edit·delete`, `messenger send`·`channel-send`·`thread-send` | 웹 화면에서 확인되고 일정은 지워진다. 메시지는 지울 수 있으면 지운다 | 임시 HOME·웹 | worker | 위와 같음 | PR 뒤 |
| REQ8 | 웹 설정 | `src/commands/web-support.test.ts` 의 영역 표 비교, CLI 실행 | 미지원 명령·옵션은 요청 전에 종료 코드 3. 가이드 표와 목록이 같다 | 임시 HOME·mock | worker | PR1 머지 | PR 전 |
| REQ14 | CLI 실행을 가짜로 바꾼 테스트 | `lib/dooray.test.mjs` | 인자 배열, 페이지 반복, 종료 코드 전달. 스크립트에 쿠키·키를 읽는 코드가 없다(`rg` 로 확인) | 로컬 mock | worker | 없음 | PR 전 |
| REQ14 | 웹 방식 `post` 명령 지원 | `collect.mjs` 를 웹 방식 임시 HOME 으로 실행 | 수집 단계가 웹으로 성공 | 임시 HOME·웹 | worker | PR2 머지 | PR2 머지 뒤 |
