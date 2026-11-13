# 원격 검증

쿠키는 로그인된 ego 브라우저에서 CDP `Network.getCookies` 로 읽어 `mktemp -d` 임시 HOME 의 CLI 설정에 stdin 으로만 넣는다. 출력과 기록에 쿠키 값·실명·19자리 id·프로젝트 코드·테넌트 이름을 남기지 않는다. 웹 호출은 한 번에 하나, 1초에 한 번을 넘기지 않는다.
쓰기는 내 개인 캘린더(제목 `[cli-web-probe]`, 참석자 없음)와 나에게 보내는 대화에만 한다.

| 선행 조건 | 시점 | 실행 위치 | 명령 | 기대값 |
| --- | --- | --- | --- | --- |
| 1단계 실측 | PR 전 | dooray-cli | 웹 경로 실측(`docs/api/web-endpoints/{calendar,stream,messenger}.md`) | 공식 필드로 바꿀 수 있고 쓰기가 SESSION 하나로 동작 |
| PR1 머지, 임시 HOME 에 쿠키 | PR 뒤 | dooray-cli | `dooray calendar list --json`, `dooray calendar event list --json`(오늘~+7일) | 필드가 공식 문서 스키마와 같다 |
| 같은 조건 | PR 뒤 | dooray-cli | `dooray calendar event create <개인 캘린더> --title "[cli-web-probe] ..." --start ... --end ...`, 종일 일정, 반복 일정, `event get`, `event edit`, `event delete`(`this`·`whole`) | 웹 화면과 `event list` 에서 확인, 마지막에 `[cli-web-probe]` 가 0건 |
| 같은 조건 | PR 뒤 | dooray-cli | `dooray stream list --size 5 --json`, `--unread`, `--before <cursor>`, `--since prev-1d` | 원소가 공식 종류 모양, `cursor` 가 있고 같은 페이지가 반복되지 않는다 |
| 같은 조건 | PR 뒤 | dooray-cli | `dooray messenger channels --json`, `dooray messenger logs <나와의 대화> -n 20 --json` | 필드가 공식 모양, 최신이 앞 |
| 같은 조건 | PR 뒤 | dooray-cli | `dooray messenger send --to <내 id> --body "[cli-web-probe] ..."`, `channel-send`, `thread-send`(나와의 대화) | 웹 화면에서 확인, 지울 수 있으면 지운다 |
| 임시 HOME 정리 | PR 뒤 | dooray-cli | 임시 HOME 삭제, 그 HOME 이 만든 키체인 항목 삭제, `security find-generic-password` | 종료 코드 44 |
| PR2 머지 | PR2 뒤 | dooray-cli | persona `collect.mjs` 를 웹 방식 임시 HOME 으로 실행 | 수집 단계 성공 |
| push | PR 뒤 | dooray-cli | GitHub CI 확인 | 필수 검사 통과 |
