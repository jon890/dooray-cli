# R0 인수 검증 계획

## 인수 검증 계획

| 요구사항 | 준비 조건 | 실행 절차 | 기대 결과 | 실행 환경 | 실행 담당 | 선행 조건 | 시점 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| REQ1 | `git archive origin/main` 을 임시 폴더에 풀어 설치·빌드 | 그 빌드로 `node scripts/help-snapshot.mjs --bin <임시>/dist/index.js --out <기준>`, 작업 브랜치 빌드 뒤 `node scripts/help-snapshot.mjs --check <기준>` | `같음` 과 종료 코드 0 | macOS 로컬, 빈 임시 HOME, 작업 브랜치를 먼저 빌드 | worker | 없음 | PR 전 |
| REQ1 | origin/main 과 작업 브랜치 | 두 쪽에서 `pnpm test` | 작업 브랜치 테스트 수가 main 이상이고 모두 통과 | macOS 로컬 | worker | 없음 | PR 전 |
| REQ5 | 작업 브랜치 | `pnpm exec vitest run src/architecture.test.ts` | 허용 목록 4건으로 통과, 판정 단위 테스트가 위반 꼴을 잡는다 | macOS 로컬 | worker | 없음 | PR 전 |
| REQ5 | 임시로 `src/utils/` 파일 하나에 `api/types.js` import 를 더한 작업 공간 | 같은 테스트 | 「허용 목록 밖의 위반」 으로 실패. 되돌린 뒤 통과 | macOS 로컬 | worker | 없음 | PR 전 |
| REQ5 | PR | CI 의 `pnpm test` 단계 | 규칙 테스트 포함 통과 | GitHub Actions | worker | push 와 PR 생성 | PR 뒤 |
| REQ6 | 작업 브랜치 | `pnpm tsc --noEmit`, `pnpm run build`, `node dist/index.js --version`, `pnpm exec vitest run src/path-alias.test.ts` | 모두 0, 버전은 package.json 과 같다 | macOS 로컬 | worker | 없음 | PR 전 |
| REQ6 | 임시로 `src/index.ts` 의 별칭을 없는 경로로 바꾼 작업 공간 | `pnpm tsc --noEmit`, `pnpm run build` | 둘 다 그 지정자를 풀지 못해 실패. 되돌린다 | macOS 로컬 | worker | 없음 | PR 전 |
| REQ7 | 작업 브랜치 | `node scripts/check-doc-paths.mjs`, `node scripts/check-doc-paths.mjs --strict` | 낡은 경로를 보고하고 기본은 0, `--strict` 는 보고가 있으면 1 | macOS 로컬 | worker | 없음 | PR 전 |
