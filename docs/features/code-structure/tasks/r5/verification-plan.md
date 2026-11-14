# R5 인수 검증 계획

## 인수 검증 계획

| 요구사항 | 준비 조건 | 실행 절차 | 기대 결과 | 실행 환경 | 실행 담당 | 선행 조건 | 시점 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| REQ1 | 기준 main 과 작업 브랜치 빌드 | 기준 빌드로 `help-snapshot.mjs --out` 후 작업 빌드로 `--check` | 모든 명령 도움말과 순서 일치 | 임시 HOME CLI | worker | 없음 | PR 전 |
| REQ1 | 기준 main 의 전체 테스트 결과 | 전후 `pnpm test`, 설정·스킬 회귀 사례 확인 | 모두 통과, 테스트 수 감소 없음 | mock 과 임시 디렉터리 | worker | 없음 | PR 전 |
| REQ1 | 원래 진입 파일의 export 목록 | TypeScript 로 기준·작업 브랜치의 값·타입 export 목록과 선언을 비교 | 이름 같음, 함수 본문 변경 없음 | 로컬 소스 검사 | worker | 없음 | PR 전 |
| REQ3 | R1·R2 완료 구조 | `src/architecture.test.ts`, `pnpm tsc --noEmit` 및 diff 확인 | API 기존 재내보내기·영역 구조 유지, config·skill 도 재내보내기만 남음 | 로컬 소스 검사 | worker | 없음 | PR 전 |
| REQ5, REQ6 | 분할한 파일 | `pnpm test src/architecture.test.ts`, `pnpm tsc --noEmit`, `pnpm run build` | 의존 위반 없음, 별칭 해석 통과 | 로컬 Node.js | worker | 없음 | PR 전 |
| REQ7 | 기존 진입 경로 유지 | `node scripts/check-doc-paths.mjs --strict` | 낡은 경로 없음 | 로컬 Node.js | worker | 없음 | PR 전 |
| REQ8 | 기준 main | `git diff -M --summary origin/main` 과 선언 비교 | 파일 이동 없이 선언 분할, 원래 파일 이력 유지 | 로컬 Git | worker | 없음 | PR 전 |

## 원격 검증

push 뒤 GitHub CI 통과를 worker 가 확인한다. 독립 코드·문서 리뷰는 코디네이터가 Claude 리뷰 worker 에게 맡긴다.
머지 뒤 추가 실행 검증은 없다. 런타임 상태·저장 형식·외부 계약을 바꾸지 않는다.
