# R1 인수 검증 계획

환경: Node.js 와 pnpm, 로컬 mock 및 임시 git 저장소. 실제 Dooray API 와 웹은 부르지 않는다.
기준: origin/main 과 같은 최초 HEAD 를 빌드하고 도움말·테스트·문서 경로·인벤토리를 세션 임시 폴더에 저장한다.

## 인수 검증 계획

| 요구사항 | 준비 조건 | 실행 절차 | 기대 결과 | 실행 환경 | 실행 담당 | 선행 조건 | 시점 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| REQ1 | 기준 빌드와 도움말 파일 | 전체 테스트와 작업 빌드 뒤 help-snapshot --check | 테스트 수가 줄지 않고 도움말이 같다 | 로컬 mock·임시 git 저장소 | worker | 없음 | PR 전 |
| REQ3 | 타입 분할 | 타입 검사와 api/types.ts 재내보내기 확인 | DTO 선언이 영역에 있고 원래 이름이 유지된다. 공개 구현은 R2 에 남는다 | 로컬 mock·임시 git 저장소 | worker | 없음 | PR 전 |
| REQ5 | 규칙 추가 | architecture.test.ts | 영역에서 types.ts·client.ts 로 돌아가는 의존을 잡는다 | 로컬 mock·임시 git 저장소 | worker | 없음 | PR 전 |
| REQ6 | 직접 경로 import | 타입 검사·vitest·빌드 | 별칭이 같은 모듈을 가리킨다 | 로컬 mock·임시 git 저장소 | worker | 없음 | PR 전 |
| REQ7 | 기준 문서 경로 결과 | check-doc-paths 전후 비교와 이동 도구 테스트 | R1 에서 낡는 경로가 없고 이동 경로가 문서에서도 갱신된다 | 로컬 mock·임시 git 저장소 | worker | 없음 | PR 전 |
| REQ8 | 임시 git fixture | 이동 도구 테스트와 git log --follow | 이동 단계 100% rename, 분할·경로 수정 커밋 분리, 원래 파일 이력 유지 | 로컬 mock·임시 git 저장소 | worker | 없음 | PR 전 |

독립 코드·문서 리뷰는 코디네이터가 Claude 리뷰 worker 에게 맡긴다. PR 본문에 실제 리뷰 결과가 오기 전까지 대기로 적는다.
