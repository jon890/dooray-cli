# 스트림 변경 기록 보기 인수 검증 계획

## 인수 검증 계획

| 요구사항 | 준비 조건 | 실행 절차 | 기대 결과 | 실행 환경 | 실행 담당 | 선행 조건 | 시점 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| REQ1 | 댓글에 `createdAt` 과 `modifiedAt: null` 이 있는 웹 fixture | `pnpm vitest run src/api/stream/web.test.ts` 의 댓글 원소 단언 | 댓글 원소에 `createdAt` 이 같은 값으로 있고 `updatedAt` 키가 없다 | 로컬 단위 테스트 | worker | 없음 | PR 전 |
| REQ2 | 변경 기록이 섞인 웹 fixture, `--since` 경계에 걸친 가짜 페이지 | `pnpm vitest run src/api/stream/web.test.ts src/commands/stream/list.test.ts` 의 옵션 없는 경우 | `result` 원소 종류가 변경 전과 같고, 변경 기록은 `changes` 로만 가며, 경계 안의 건수만 끝에 한 번 안내된다 | 로컬 단위 테스트 | worker | 없음 | PR 전 |
| REQ2 | 페이지 커서는 since 이후이고 자기 `createdAt` 은 since 이전인 댓글이 든 가짜 페이지 | `list.test.ts` 의 `--since` 댓글 시각 단언 | 그 댓글이 결과에서 빠지고, `createdAt` 이 없는 댓글은 커서 기준으로 남는다 | 로컬 단위 테스트 | worker | 없음 | PR 전 |
| REQ3 | 시스템 기록과 일정 하위 기록이 있는 웹 fixture | `web.test.ts` 의 `withChanges: true` 단언 | `event` 원소에 `actions`, `createdAt` 이 있고 `body` 키가 없다. 일정 기록은 `scheduleId` 를 가진다 | 로컬 단위 테스트 | worker | 없음 | PR 전 |
| REQ4 | `pageEvent`, `calendar`, `project` 가 있는 웹 fixture | `web.test.ts` 의 `withChanges: true` 단언 | 세 원소가 fixture 의 웹 값과 `toEqual` 로 같다 | 로컬 단위 테스트 | worker | 없음 | PR 전 |
| REQ5 | 변경 기록 원소와 이름 캐시가 있는 가짜 웹 클라이언트 | `list.test.ts` 의 표 출력과 `streamItemSummary` 단언, `datetime.test.ts` | 「업무 상태: 진행 전 → 진행 중」, 「일정 삭제: <제목>」, 「프로젝트 초대」 가 보이고 작성자 칸과 시각 칸이 채워진다 | 로컬 단위 테스트 | worker | 없음 | PR 전 |
| REQ6 | 변경 기록이 섞인 가짜 페이지 | `list.test.ts` 의 `--since`, `--quiet --with-changes` 단언 | 경계 이전 변경 기록이 나오지 않고 `--quiet` 에 변경 기록 id 가 있다 | 로컬 단위 테스트 | worker | 없음 | PR 전 |
| REQ7 | 공개 API 방식 설정 | `list.test.ts` 의 공개 API `--with-changes` 단언 | 경고 한 번, 출력은 옵션 없을 때와 같다 | 로컬 단위 테스트 | worker | 없음 | PR 전 |
| REQ1, REQ2, REQ3, REQ5 | 웹 방식으로 로그인한 계정, 2주 안의 업무 활동이 있는 시간대 | 빌드한 CLI 로 `stream list --since <시간대 시작> --json --with-changes` 와 표 출력, 옵션 없는 표 출력을 돌려 그 시간대의 업무 활동 수를 센다 | 댓글과 시스템 기록이 모두 시각과 함께 나오고, 옵션 없는 실행의 끝 안내 건수가 옵션을 준 실행에서 늘어난 변경 기록 수와 같다 | 사용자의 웹 방식 계정 | 코디네이터 | 없음 | PR 전 |
