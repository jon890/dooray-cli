# R2 인수 검증 계획

환경: Node.js 와 pnpm, 로컬 mock 및 임시 git 저장소. 실제 Dooray API·웹·SMTP·IMAP 은 부르지 않는다.
기준: origin/main(R1 머지 뒤)을 수정 전에 빌드하고 도움말·테스트 수·인벤토리 출력을 세션 임시 폴더에 저장한다.

## 인수 검증 계획

| 요구사항 | 준비 조건 | 실행 절차 | 기대 결과 | 실행 환경 | 실행 담당 | 선행 조건 | 시점 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| REQ1 | 기준 빌드와 도움말 파일 | 전체 테스트와 작업 빌드 뒤 help-snapshot --check | 테스트 수가 줄지 않고 도움말이 같다 | 로컬 mock | worker | 없음 | PR 전 |
| REQ2 | 기준 인벤토리 출력 | 작업 브랜치의 `pnpm api:inventory` 와 diff | 출력이 같다 | 로컬 | worker | 없음 | PR 전 |
| REQ3 | 공개 구현 분할 | tsc, `api/client.ts` 재내보내기 검사 | 구현이 `api/<영역>/public.ts` 에 있고 client.ts 는 재내보내기만 남는다 | 로컬 | worker | 없음 | PR 전 |
| REQ4 | 조립 함수 | `createPublicClient` 에서 영역 하나를 빼고 tsc, architecture.test.ts | tsc 가 실패한다. 공개·웹 상호 import 가 0건이고 resolvers·services 규칙이 허용 목록 밖을 막는다 | 로컬 | worker | 없음 | PR 전 |
| REQ8 | 메일 파일 이동 | move 커밋의 `git diff -M --summary` | 8개 파일이 100% rename 으로 잡힌다 | 로컬 git | worker | 없음 | PR 전 |

독립 코드·문서 리뷰는 코디네이터가 Codex 리뷰 worker 에게 맡긴다. PR 본문에 실제 리뷰 결과가 오기 전까지 대기로 적는다.
