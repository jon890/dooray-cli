# R3 인수 검증 계획

환경: Node.js 와 pnpm, 로컬 mock 과 임시 디렉터리. 실제 Dooray API·웹·메일 서버는 부르지 않는다.
기준: R2 가 머지된 origin/main 을 수정 전에 빌드한다.

## 인수 검증 계획

| 요구사항 | 준비 조건 | 실행 절차 | 기대 결과 | 실행 환경 | 실행 담당 | 선행 조건 | 시점 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| REQ1 | 기준 테스트와 빌드 | pnpm test, pnpm run build, help-snapshot --check | 테스트 수가 줄지 않고 도움말이 같다 | 로컬 mock | worker | 없음 | PR 전 |
| REQ5 | utils 재분류 | architecture.test.ts, IMAP 의 import 연결 확인 | utils 예외 없음, resolver 예외 유지, IMAP 조회에 readline 의존 없음 | 로컬 | worker | 없음 | PR 전 |
| REQ6 | rewrite 완료 | pnpm tsc --noEmit, pnpm test, pnpm run build | 별칭과 mock 이 모두 풀린다 | 로컬 | worker | 없음 | PR 전 |
| REQ7 | 문서 경로 갱신 | check-doc-paths.mjs, 이동 전 경로 검색 | 이번 이동으로 낡은 경로가 생기지 않는다 | 로컬 | worker | 없음 | PR 전 |
| REQ8 | 이동 커밋 | git show -M --summary, git log --follow | 내용이 같은 이동 이력 유지 | 로컬 git | worker | 없음 | PR 전 |

공통 검증: pnpm api:inventory, pnpm verify:package, check-pii.mjs, check-public-refs.mjs, git diff --check.
독립 리뷰: 대기. 코디네이터가 Claude 리뷰 worker 에게 맡긴다.
계획 검토: 하위 에이전트 금지 지시에 따라 자체 대조만 수행하며 독립 검토 완료로 취급하지 않는다.
