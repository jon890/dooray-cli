# R3 본문 규칙 분리 검증 기록

완료: PR 전 실행 검증과 문서 대조. 독립 리뷰는 대기하며, PR 본문의 완료 근거 블록에서 갱신한다.

- 스펙: [spec.md](spec.md)
- 기술 설계: [design.md](design.md)
- 계획과 인수 검증 계획: [tasks/r3/index.json](tasks/r3/index.json), [verification-plan.md](tasks/r3/verification-plan.md)
- 기준: R2 가 머지된 main, `fc1457412ea46b07d14ed4f59b75fd00643bda43`
- 코드 검증 커밋: `ced0eb1caebd14044c95ae639ca75fea8fb6dadd`. 이후 증거 문서만 추가한다. PR HEAD 는 PR 본문에 기록한다.
- 환경: macOS, Node.js v24.22.1, pnpm 12.18.0. mock 과 임시 디렉터리만 사용했다.

## 요구사항별 증거

| 요구사항 | 사례와 명령 | 기대 결과 | 실제 결과 |
| --- | --- | --- | --- |
| REQ1 | 기준과 작업 브랜치의 `pnpm test` | 기존 테스트 유지, 모두 통과 | 148개 파일, 2,320개에서 2,322개로 증가. 모두 통과 |
| REQ1 | 양쪽 `pnpm run build`, `node scripts/help-snapshot.mjs --check <기준 파일>` | 전체 명령 도움말과 순서 유지 | 104개 명령 경로 일치 |
| REQ5 | `src/architecture.test.ts` | utils 의 상위 계층 의존과 예외 없음 | 통과. resolver 의 전체 클라이언트 의존 예외 9건은 R4 범위로 유지 |
| REQ5 | 같은 테스트에서 IMAP 진입점의 내부 import 를 따라 readline 검사 | 직접·간접 readline 의존 없음 | 통과 |
| REQ6 | `pnpm tsc --noEmit`, `pnpm test`, `pnpm run build` | 이동 파일의 별칭과 mock 이 풀린다 | 모두 통과. 같은 폴더는 상대 경로 유지 |
| REQ7 | `node scripts/check-doc-paths.mjs` 와 이동 경로 검색 | 이번 이동으로 낡은 문서 경로가 생기지 않음 | 기존 웹 세션 계획의 12건만 남음. 이번 이동 경로는 모두 갱신 |
| REQ8 | 이동 커밋 `7194926` 의 `git show -M --summary` | 내용 수정 없이 rename 으로 기록 | 구현과 짝 테스트 26개가 100% rename |
| REQ8 | `git log --follow -- src/body/body-input.ts` | 이동 전 이력 추적 | 이동 커밋과 이전 body-input 수정 이력 확인 |

메일 UID 조회는 기존 `src/api/mail/imap.test.ts` 의 후보 선택·누락·상한·오류·연결 정리 사례로 확인했다.
새 lookup 모듈은 연결된 클라이언트를 받고, 원래 진입점이 연결과 잠금 해제를 계속 맡는다.

## 개발 검증

| 명령 | 결과 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 통과 |
| `pnpm tsc --noEmit` | 통과 |
| `pnpm test` | 148개 파일, 2,322개 테스트 통과 |
| `pnpm run build` | 통과 |
| `pnpm verify:package` | 통과 |
| `pnpm api:inventory` | 통과. 구현에 있고 공식에 없는 endpoint 0건 |
| `node scripts/check-pii.mjs` | 통과 |
| `node scripts/check-public-refs.mjs` | 통과 |
| `node scripts/check-doc-paths.mjs` | 기존 웹 세션 계획의 12건만 보고. R4 의 strict 검사 범위 |
| `verify_task.ts r3 --require-verification --audit` | 위반 0건. 검사 스크립트 범위를 직접 확인하라는 경고만 있음 |
| `git diff --check` | 통과 |

실제 Dooray API·웹·SMTP·IMAP 은 호출하지 않았다.
테스트 중 오류 문자열을 출력하는 성공 사례와 기존 Vite 설정 경고는 테스트 실패가 아니다.
계획은 단독 수행 지시에 따라 자체 대조했으며, 독립 계획 검토가 완료됐다고 기록하지 않았다.

## 결정

| 대상 | 선택과 이유 |
| --- | --- |
| 본문 입력 타입 | mention.ts 에 MentionContext(id, orgId), task-link.ts 에 TaskLinkContext(orgId)를 둔다. 함수에 필요한 칸만 받고 CachedMe 를 구조적 타입으로 그대로 전달한다 |
| utils 의 나머지 파일 | 설계 표에 없는 영역 공통 도구는 그대로 둔다. 표준 입력만 stdin.ts 로 분리해 utils 에서 body 를 가져오지 않는다 |
| UID 조회 경계 | imap.ts 는 공개 진입점과 연결·잠금을 유지하고 uid-lookup.ts 가 후보 수집과 선택을 맡는다. 순환 import 없이 호출 순서와 정리 동작을 보존한다 |
| 출력 정리 | 터미널 출력용 sanitizeFileName 래퍼만 지운다. Content-Disposition 에서 파일 경로를 정리하는 동명 함수는 역할이 달라 유지한다. 댓글 파일 목록의 호출도 직접 sanitizeForTerminal 로 바꾼다 |
| 허용 목록 범위 | 설계의 R3 완료 문구를 utils 예외 제거로 명확히 한다. R2 에 추가한 resolver 예외는 지시서대로 R4 에서 처리한다 |
| feedback 진입점 | 내용 수정 커밋에서 index.ts 와 짝 테스트를 함께 옮겼다. move 단계의 본문·영역 도구 이동과 분리한다 |

## 문서 대조와 공통화 후보

| 문서 | 영향과 확인 결과 |
| --- | --- |
| spec.md | 동작과 사용자 결정 유지. 이번 PR 의 요구사항 범위와 일치 |
| design.md | 재분류 표와 UID 조회 분리를 구현. R3 에서 지울 예외의 범위만 명확히 함 |
| docs/code-architecture.md | 현재 구조에 body/ 를 추가하고 utils 책임을 갱신. 의존 규칙 표는 변경 없음 |
| ADR-022, ADR-043, ADR-055 와 관련 pitfalls | 이동한 코드 경로만 갱신. 기존 결정과 근거 유지 |
| ADR-082 | 기존 계층 구조와 별칭 결정을 따름. 새 ADR 불필요 |
| PRD, flow, data-schema | 명령·외부 효과·저장 형식 변경 없음. 영향 없음 |

공통화 후보 없음: 코드 구조 설계와 기존 계층 규칙을 구현한 변경이며, 여러 기능에 반복된 새 도메인 규칙이 없다.
한국어 의미 점검 범위는 이번 계획·검증 기록·PR 제목과 본문이다. 기존 문서의 수정하지 않은 표현은 범위 밖으로 남겼다.

## 독립 검토와 남은 검증

독립 코드·문서 리뷰: 대기 | 코디네이터가 Claude 리뷰 worker 에게 맡긴다.
머지 뒤 추가 실행 검증은 없다. 런타임 상태와 외부 계약을 바꾸지 않는다.
R4 의 resolver 예외 제거와 명령 나무 정리, 선택 R5 는 이번 PR 밖이다.
