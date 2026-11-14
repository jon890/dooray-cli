# R5 설정·스킬 관리 분할 검증 기록

완료: PR 전 실행 검증과 문서 대조. 코디네이터가 맡긴 Claude 독립 코드·문서 리뷰에서 차단할 문제는 없었다. 실제 리뷰 링크와 현재 HEAD 는 PR 본문에 기록한다.

- 스펙: [spec.md](spec.md)
- 기술 설계: [design.md](design.md) 의 R5 절
- 계획과 인수 검증 계획: [tasks/r5/index.json](tasks/r5/index.json), [verification-plan.md](tasks/r5/verification-plan.md)
- 기준 main: `6f7a8c1` (R4 머지 뒤)
- 구현 검증 커밋: `8194a27`. 이후 문서 참조·검증 기록과 내보내는 이름 검사만 고쳤다. PR HEAD 는 PR 본문에 적는다.
- 환경: macOS, Node.js v24.22.1, pnpm 12.18.0. mock 과 임시 디렉터리만 사용했다.

## 요구사항별 증거

| 요구사항 | 사례와 명령 | 기대 결과 | 실제 결과 |
| --- | --- | --- | --- |
| REQ1 | 기준·작업 브랜치의 `pnpm test` | 기존 테스트 유지, 모두 통과 | 152개 파일 2,339개에서 152개 파일 2,343개로 증가. 재내보내기 구조와 내보내는 이름 검사만 추가했고 기존 동작의 회귀 테스트는 수정하지 않았다 |
| REQ1 | 각각 빌드한 뒤 `node scripts/help-snapshot.mjs --out`·`--check` | 도움말·등록 순서 유지 | 104개 명령 경로 일치 |
| REQ1 | 기준 main 선언과 분할한 선언을 임시 TypeScript 스크립트로 비교 | 내보내는 이름과 기존 구현 유지 | 설정의 값·타입 이름 15개와 스킬의 값·타입 이름 10개가 같다. export 수정자를 제외한 원래 선언 37개·35개와 주석이 모두 동일하다 |
| REQ1 | `src/architecture.test.ts` 의 `Object.keys(await import(...))` 검사 | 기존 진입 파일의 런타임 이름 유지 | 설정과 스킬의 기존 런타임 export 이름 목록과 정확히 일치 |
| REQ1 | `pnpm test src/config src/architecture.test.ts` | [ADR-069](../../adr/069-macos-keychain-secret-store.md)·[ADR-080](../../adr/080-secret-file-exposure-warning.md)·[ADR-081](../../adr/081-web-session-auth.md) 동작 유지 | 8개 파일 203개 통과. 파일 권한, 키체인 쓰기 실패 복원, 평문 경고, 쿠키 생략 보존을 기존 테스트로 확인했다 |
| REQ1 | `pnpm test src/skill src/architecture.test.ts` | 설치 상태·보호·복원 동작 유지 | 4개 파일 81개 통과. 변경·손상·미관리 항목 보호와 설치 실패 복원을 기존 테스트로 확인했다 |
| REQ3 | `src/architecture.test.ts`, `pnpm tsc --noEmit`, API diff 대조 | R1·R2 API 구조 유지 | API 소스 변경 없음. 기존 재내보내기 검사가 통과하고 config·skill 의 기존 진입 파일도 재내보내기만 남는다 |
| REQ5, REQ6 | 구조 테스트·타입 검사·빌드 | 의존 규칙 유지, 별칭 해석 성공 | 모두 통과. 새 파일은 `@/…` 를 쓰며 내부 구현은 기존 재내보내기 진입 파일을 가져오지 않는다 |
| REQ7 | `node scripts/check-doc-paths.mjs --strict` | 문서 경로 유지 | 낡은 src 경로 없음. 문서가 참조하는 기존 진입 파일을 유지했다 |
| REQ8 | `git diff -M --summary origin/main` | 원래 파일 이력 유지 | 이동 없음. 선언을 새 주제 파일에 나누고 원래 파일은 재내보내기로 남겼다 |

REQ3 의 스펙 원문은 R1·R2 의 API 영역 구조다. R5 에서는 그 구조가 유지됨을 확인하며, config·skill 분할을 새로운 API 요구사항으로 해석하지 않는다.

## 개발 검증

| 명령 | 결과 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 통과 |
| `pnpm tsc --noEmit` | 통과 |
| `pnpm test` | 리뷰 반영 뒤 152개 파일, 2,343개 테스트 통과 |
| `pnpm run build` | 통과 |
| `pnpm verify:package` | 통과 |
| `pnpm api:inventory` | 통과. 구현에 있고 공식에 없는 endpoint 0건 |
| `node scripts/check-pii.mjs` | 통과 |
| `node scripts/check-public-refs.mjs` | 통과 |
| `node scripts/check-doc-paths.mjs --strict` | 통과 |
| `verify_task.ts r5 --require-verification` | 구현 전 위반 0건. 검사 범위 직접 확인과 크기 추정 경고만 있음 |
| `verify_task.ts --staged phase-01.md`·`phase-02.md` | 각각 위반 0건, 경고 0건 |
| `git diff --check` | 통과 |
| `adr-docs.ts check --changed-since origin/main` | 변경 파일 위반 없음, 종료 코드 0. PR 밖 기존 위반은 수정하지 않았다 |

테스트가 오류 문자열을 출력하는 성공 사례와 기존 Vite 설정 경고는 실패가 아니다.
실제 Dooray API·웹·SMTP·IMAP 과 사용자 설정·키체인에 접근하지 않았다.
계획은 단독 수행 지시에 따라 자체 대조했다. 독립 계획 검토나 독립 인수 검토가 완료됐다고 기록하지 않는다.

## 결정

| 대상 | 선택과 이유 |
| --- | --- |
| 설정 파일 처리 | `store-file.ts` 가 경로·파일 검증 읽기·원자적 쓰기를 맡는다. 파일 권한을 다루는 처리를 함께 읽을 수 있다 |
| 설정값·결과 타입 | `store-values.ts` 가 값 검증·비밀값을 숨기는 오류 이유를, `store-types.ts` 가 읽기·삭제 결과와 저장 타입을 맡는다 |
| 설정 비밀값 저장 | `store-secrets.ts` 에 키체인 이전·변경 계획·실패 시 복원을 함께 둔다. 저장 순서를 나누지 않는다 |
| 설정 읽기·갱신·경고 | `store-read.ts` 는 조회, `store-write.ts` 는 갱신, `store-security.ts` 는 파일 보안 검사와 프로세스마다 한 번 내는 경고를 맡는다 |
| 스킬 타입·파일 항목 | `types.ts` 는 계약과 상수, `paths.ts` 는 경로 규칙, `entries.ts` 는 링크·파일 오류·패키지 확인을 맡는다 |
| 스킬 읽기·쓰기 | `inspect.ts` 는 상태 조회, `store.ts` 는 해시 검증·임시 복사·격리, `install.ts` 는 링크 교체·백업·복원을 맡는다 |
| 기존 진입 파일 | `src/config/store.ts`·`src/skill/manager.ts` 는 동일한 이름만 명시적으로 재내보낸다. 외부 호출부와 문서 경로는 그대로다 |
| 커밋 단위 | 계획·설정 분할·스킬 분할·검증 기록으로 나눈다. 파일 전체 이동이 없어 이동 커밋은 만들지 않는다 |

## 문서 대조와 남은 작업

스펙·설계의 R5 범위와 대조했다. [ADR-069](../../adr/069-macos-keychain-secret-store.md)·[ADR-080](../../adr/080-secret-file-exposure-warning.md)·[ADR-081](../../adr/081-web-session-auth.md), PRD, flow, data-schema 의 동작과 저장 형식은 바뀌지 않아 수정하지 않았다.
`docs/code-architecture.md` 의 계층 책임과 진입 경로는 유지한다. 독립 리뷰 P4 를 반영해 `skill/manager.ts` 는 기존 import 경로를 지키는 진입 파일이고 실제 구현은 같은 폴더의 주제 파일에 있다고 고쳤다. config 쪽에는 진입 파일을 실제 구현 위치라고 설명한 줄이 없어 수정하지 않았다.
한국어 의미 점검 범위는 R5 계획·검증 기록·커밋 메시지·PR 제목과 본문이다. 반영하지 않은 발견은 없다.

자동 리뷰는 동작 변경을 찾지 못했고 P3 문서 참조 1건을 지적했다. 코디네이터가 수정 범위를 허용한 `docs/pitfalls/code-review/sensitive-file-mode-missing.md` 의 `ensureDir`·`writeConfigFile` 예시 경로만 `src/config/store-file.ts` 로 고쳤다.
Claude 독립 리뷰는 P1·P2·P3 0건, P4 1건, P5 2건이었다. 기존 선언·export·보안 동작과 의존 방향을 대조했고, 같은 코드 커밋에서 관련 테스트 303개와 타입·PII 검사를 통과했다.
P4 구현 위치 설명을 고쳤다. P5 과거 문서의 줄 번호는 문서 worker 가 함수 이름으로 바꾸므로 이 PR 에서는 손대지 않는다. P5 export 이름 고정 테스트는 코디네이터 지시에 따라 추가했다. `Object.keys(await import(...))` 로 두 진입 파일의 런타임 이름을 검사하며 실제 설정·키체인 조회 함수는 호출하지 않는다.

남은 작업은 리뷰 반영 뒤 PR CI 와 코디네이터의 머지다. 머지 뒤 별도 실행 검증은 없다.

## docs-consolidate 후보 (R0~R5)

| 후보 | 근거 | 제안 |
| --- | --- | --- |
| `tasks/r0` 부터 `tasks/r5` | 구현 작업과 변경 파일 표를 담은 계획으로 코드 이력과 겹친다 | R5 머지 뒤 계획 수명 규칙에 따라 완료 기록을 정리한다 |
| `r1-verification.md` 부터 `r5-verification.md` | PR 별 실행 결과를 같은 형식으로 보존한다 | PR 완료 근거와 연결되는 실행 기록으로 모은다 |
| `design.md` 의 PR 별 작업 절 | R5 까지 구현되면 미래 설계가 아니라 구현 이력이 된다 | 유지할 구조 결정과 완료한 작업 기록을 구분한다 |
| `docs/code-architecture.md` 의 지금·목표 구조 | R5 로 마지막 선택 항목까지 구현한다 | 다른 문서 worker 의 변경과 합쳐 현재 구조만 남긴다 |
| 과거 스펙의 줄 번호 참조 | 독립 리뷰 P5 에서 파일 분할 뒤 줄 번호가 낡은 곳을 확인했다 | 문서 worker 가 줄 번호를 함수 이름으로 바꾼다 |

이 PR 에서는 후보만 기록하고 다른 PR 의 계획·증거와 전역 문서는 정리하지 않는다. 새 공통 도메인 규칙 후보는 없다.
