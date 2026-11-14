# R4 명령 정리 검증 기록

완료: PR 전 실행 검증과 문서 대조. 독립 리뷰는 대기하며, PR 본문의 완료 근거 블록에서 갱신한다.

- 스펙: [spec.md](spec.md)
- 기술 설계: [design.md](design.md)
- 계획과 인수 검증 계획: [tasks/r4/index.json](tasks/r4/index.json), [verification-plan.md](tasks/r4/verification-plan.md)
- 기준: R3 가 머지된 main, `db068cb`
- 코드 검증 커밋: `3dd06dab6da4d2e35b5a17615b3f558266ef7853`. 이후 계획·증거 문서만 추가한다. PR HEAD 는 PR 본문에 기록한다.
- 환경: macOS, Node.js v24.22.1, pnpm 12.18.0. mock 과 임시 디렉터리만 사용했다.

## 요구사항별 증거

| 요구사항 | 사례와 명령 | 기대 결과 | 실제 결과 |
| --- | --- | --- | --- |
| REQ1 | 기준(`db068cb`)과 작업 브랜치의 `pnpm test` | 기존 테스트 유지, 모두 통과 | 148개 파일 2,322개에서 152개 파일 2,338개로 증가. 모두 통과 |
| REQ1 | 기준 빌드로 `node scripts/help-snapshot.mjs --out`, 작업 브랜치 빌드로 `--check` | 전체 명령 도움말과 순서 유지 | 104개 명령 경로 일치 |
| REQ1 | `src/commands/command-trees.test.ts` | project·post·wiki·mail 나무의 하위 명령 이름과 순서가 기존과 같다 | 통과 |
| REQ4 | `pnpm tsc --noEmit`, `src/architecture.test.ts` | resolver 가 영역 인터페이스만 받고 `api/dooray-client.ts` 를 가져오지 않는다 | 통과. 9곳이 `PostClient`·`ProjectClient`·`WikiClient`·`MemberClient`·`MessengerClient` 나 그 교집합을 받는다 |
| REQ5 | 같은 테스트의 「허용 목록이 비어 있다」 | 허용 목록 0건, 위반 0건 | 통과 |
| REQ7 | `node scripts/check-doc-paths.mjs --strict` | 낡은 경로 0건 | 「낡은 src 경로 없음」, 종료 코드 0. 웹 세션 계획의 12건을 지금 경로로 고쳤다 |
| REQ7 | `.github/workflows/ci.yml` | CI 에 같은 검사 단계가 있다 | 「Check source paths in docs」 단계를 공개 문서 참조 검사 뒤에 더했다 |
| REQ8 | `git diff -M --summary origin/main` | 이번 PR 은 파일을 옮기지 않는다 | 이동 없음. 새 파일만 더하고 기존 파일은 제자리에서 줄었다. 이동 스크립트를 쓰지 않았다 |

## 개발 검증

| 명령 | 결과 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 통과 |
| `pnpm tsc --noEmit` | 통과 |
| `pnpm test` | 152개 파일, 2,338개 테스트 통과 |
| `pnpm run build` | 통과 |
| `pnpm verify:package` | 통과 |
| `pnpm api:inventory` | 통과. 구현에 있고 공식에 없는 endpoint 0건 |
| `node scripts/check-pii.mjs` | 통과 |
| `node scripts/check-public-refs.mjs` | 통과 |
| `node scripts/check-doc-paths.mjs --strict` | 통과 |
| `verify_task.ts r4 --require-verification --audit` | 위반 0건. 검사 스크립트 범위를 직접 확인하라는 경고만 있음 |
| `git diff --check` | 통과 |

실제 Dooray API·웹·SMTP·IMAP 은 호출하지 않았다.
테스트 중 오류 문자열을 출력하는 성공 사례와 기존 Vite 설정 경고는 테스트 실패가 아니다.
계획은 단독 수행 지시에 따라 자체 대조했으며, 독립 계획 검토가 완료됐다고 기록하지 않았다.

## 결정

| 대상 | 선택과 이유 |
| --- | --- |
| 명령 나무의 꼴 | 설계 문구의 `<영역>Command()` 대신 기존 영역(member·messenger·stream·calendar)과 같은 `export const <영역>Command = new Command(…)` 로 내보낸다. 한 저장소에 두 꼴이 섞이지 않게 하려는 것이다 |
| post·wiki 묶음 | post 의 `comment`·`file` 묶음은 각 폴더의 `index.ts` 가 맡고(`comment/file/index.ts` 와 같은 꼴), wiki 의 `page` 묶음은 `wiki/index.ts` 안에 둔다 |
| 주제 파일 이름 | 한 영역의 파일 이름 결이 달라 영역마다 맞췄다. stream `feed.ts`, messenger `channel-list.ts`, wiki `page-move-request.ts`, calendar `event-delete-rules.ts`·`event-edit-rules.ts`, post `comment/comment-lookup.ts` |
| 자르는 선 | 옵션 값 읽기(`--size`, `--since` 같은 것)와 출력은 명령 파일에 남긴다. 서버 응답을 읽는 규칙, 요청 본문 조립, 기존 값으로 채우는 조회, 반복 일정 거부는 주제 파일로 뺀다 |
| 대상 위키 풀이 | 「프로젝트 id 꼴이면 그대로, 아니면 프로젝트 코드로 푼다」 는 이름 풀이라 `resolvers/wiki.ts` 의 `resolveTargetWikiId` 로 보냈다 |
| 서비스로 보낸 것 | 없다. 여섯 파일에는 캐시 무효화가 필요한 쓰기가 없었다 |
| resolver 인터페이스 | 부르는 메서드의 영역 인터페이스만 받는다. 둘 이상이면 교집합(`PostClient & ProjectClient`)을 인라인으로 적었다. 별칭 타입을 새로 만들지 않았다 |
| 허용 목록 | 상수는 남기고 비운다. 테스트가 비어 있음을 확인해, 다시 채우려면 테스트를 바꿔야 한다 |
| 낡은 경로 | `web-convert.ts` 는 만들어지지 않고 `stream/web.ts` 안에 들어갔으므로 그 파일로 고쳤다 |

## 문서 대조와 공통화 후보

| 문서 | 영향과 확인 결과 |
| --- | --- |
| spec.md | 동작과 사용자 결정 유지. R4 의 요구사항 범위와 일치 |
| design.md | R4 절에 명령 나무의 꼴과 뺀 자리를 적었다. 결정을 뒤집지 않았다 |
| docs/code-architecture.md | 의존 규칙의 허용 목록 문구, 구조 정리 도구 표(CI 단계), 「지금」 의 commands 설명을 고쳤다 |
| [ADR-082](../../adr/082-code-structure.md) | 기존 결정을 따름. 새 ADR 불필요 |
| PRD, flow, data-schema | 명령·외부 효과·저장 형식 변경 없음. 영향 없음 |

공통화 후보 없음: 코드 구조 설계를 구현한 변경이며, 여러 기능에 반복된 새 도메인 규칙이 없다.
한국어 의미 점검 범위는 이번 계획·검증 기록·커밋 메시지·PR 제목과 본문이다. 기존 문서의 수정하지 않은 표현은 범위 밖으로 남겼다.

## 독립 검토와 남은 검증

독립 코드·문서 리뷰: 대기. 코디네이터가 Codex 리뷰 worker 로 띄운다. 결과를 받으면 PR 본문의 완료 근거 블록에서 갱신한다.
머지 뒤 추가 실행 검증은 없다. 런타임 상태와 외부 계약을 바꾸지 않는다.
R5(선택, `config/store.ts`·`skill/manager.ts` 분할)는 이번 PR 밖이다.

## docs-consolidate 후보 (기능 전체 R0~R4)

정리는 코디네이터가 사용자와 정한 뒤 `docs-consolidate` 로 한다. 여기서는 후보만 적는다.

| 후보 | 근거 | 제안 |
| --- | --- | --- |
| `r1-verification.md`·`r2-verification.md`·`r3-verification.md`·`r4-verification.md` | 같은 표 꼴로 PR 마다 실행 결과를 적은 기록이고, 머지된 PR 의 증거가 되었다 | 하나의 「실행 기록」 으로 접거나, 결과 요약만 `design.md` 에 두고 나머지는 PR 본문을 가리킨다 |
| `tasks/r0` ~ `tasks/r4` | 모두 `completed` 이고 변경 파일 표가 코드 이력과 겹친다 | 완료 처리 뒤 보관하거나 지운다. `git log` 와 PR 이 같은 정보를 갖는다 |
| `design.md` 의 「R3 의 파일 재분류」 와 「R4 의 명령 정리」 | 구현이 끝난 PR 별 절이라 목표 구조만 남기면 된다 | 결과 구조는 `docs/code-architecture.md` 가 갖고 있어 설계 절을 줄인다 |
| `docs/code-architecture.md` 의 「지금」 구조 | R5 를 제외하면 정리가 끝나 「지금」 과 「목표」 가 같다 | R5 결정 뒤 「지금」 을 지우고 목표만 남긴다 |
