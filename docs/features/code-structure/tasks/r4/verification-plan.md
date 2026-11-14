# R4 인수 검증 계획

환경: Node.js 와 pnpm, 로컬 mock 과 임시 디렉터리. 실제 Dooray API·웹·메일 서버는 부르지 않는다.
기준: R3 가 머지된 origin/main 을 수정 전에 빌드한다.

## 인수 검증 계획

| 요구사항 | 준비 조건 | 실행 절차 | 기대 결과 | 실행 환경 | 실행 담당 | 선행 조건 | 시점 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| REQ1 | 기준 테스트와 빌드, 기준 도움말 스냅숏 | pnpm test, pnpm run build, help-snapshot --check | 테스트 수가 줄지 않고 도움말이 순서까지 같다 | 로컬 mock | worker | 없음 | PR 전 |
| REQ4 | resolver 인터페이스 좁히기 | pnpm tsc --noEmit, architecture.test.ts | resolver 가 영역 인터페이스만 받고 api/dooray-client.ts 를 가져오지 않는다 | 로컬 | worker | 없음 | PR 전 |
| REQ5 | 허용 목록 비우기 | architecture.test.ts | 허용 목록이 비어 있고 위반 0건 | 로컬 | worker | 없음 | PR 전 |
| REQ7 | 문서 경로 갱신, CI 단계 | check-doc-paths.mjs --strict, ci.yml 확인 | 낡은 경로 0건, CI 에 단계가 있다 | 로컬 | worker | 없음 | PR 전 |

R4 는 파일을 옮기지 않고 새 파일만 더하므로 REQ8(이동 이력)은 이번 PR 의 검증 대상이 아니다.
공통 검증: pnpm api:inventory, pnpm verify:package, check-pii.mjs, check-public-refs.mjs, git diff --check.
독립 리뷰: 대기. 코디네이터가 Codex 리뷰 worker 에게 맡긴다.
계획 검토: 단독 수행 지시에 따라 자체 대조만 수행하며 독립 검토 완료로 취급하지 않는다.
