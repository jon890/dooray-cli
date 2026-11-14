# R1 타입 분할 검증 기록

완료: PR 전 실행 검증과 문서 대조. 독립 코드·문서 리뷰는 대기 중이다.

- 스펙: [spec.md](spec.md)
- 기술 설계: [design.md](design.md)
- 계획·인수 검증 계획: `tasks/r1/`
- 환경: macOS, Node.js v24.22.1, pnpm 12.18.0. 테스트는 mock 과 임시 디렉터리만 쓴다.
- 기준: R0 가 머지된 origin/main 을 수정 전에 빌드하고 도움말·테스트·문서 경로·인벤토리를 수집했다.
- 검증 커밋: PR 본문의 완료 근거 블록에 현재 HEAD 를 기록한다.

## 요구사항별 증거

| 요구사항 | 명령·절차 | 기대 결과 | 실제 결과 |
| --- | --- | --- | --- |
| REQ1 | 기준과 작업 브랜치에서 `pnpm test` | 기존 테스트를 유지하고 모두 통과 | 2,286개에서 2,305개로 증가, 모두 통과 |
| REQ1 | 양쪽 `pnpm run build`, `node scripts/help-snapshot.mjs --check <기준 파일>` | 모든 명령 도움말 일치 | 104개 명령 경로 일치 |
| REQ3 | 기존 선언과 영역 선언을 이름별로 비교, `pnpm tsc --noEmit` | DTO 필드·선택 여부·공개 이름 유지 | 기존 선언 163개 본문 일치, 타입 검사 통과 |
| REQ3 | `src/architecture.test.ts` | 기존 통합 파일은 재내보내기만 유지 | 재내보내기 검사 통과, 공개 구현 분할은 R2 범위 |
| REQ5 | `pnpm exec vitest run src/architecture.test.ts src/api` | 영역에서 통합 진입점을 가져오는 의존 거부 | 관련 테스트 345개 통과. 허용 목록은 목적지 경로만 갱신 |
| REQ6 | `pnpm tsc --noEmit`, `pnpm test`, `pnpm run build` | 별칭이 같은 모듈을 가리킴 | 모두 통과. 새 타입 파일은 다른 폴더의 타입을 별칭으로 가져옴 |
| REQ7 | `node scripts/check-doc-paths.mjs` 전후 비교 | R1 에서 낡은 코드 경로가 늘지 않음 | 기존 12건 그대로. 실제 파일 이동이 없어 문서 경로 치환 없음 |
| REQ8 | `scripts/move-paths.test.mjs`, `git log --follow --oneline -- src/api/types.ts` | 이동 단계의 내용 보존과 기존 이력 유지 | 임시 git 저장소의 구현·짝 테스트를 100% rename 으로 탐지. 원래 타입 파일의 최초 이력 조회 가능 |

## 개발 검증

| 명령 | 결과 |
| --- | --- |
| `pnpm test` | 147개 파일, 2,305개 테스트 통과 |
| `pnpm tsc --noEmit` | 통과 |
| `pnpm run build` | 통과 |
| `pnpm verify:package` | 통과 |
| `pnpm api:inventory` | 통과, 기준과 출력 일치 |
| `node scripts/check-pii.mjs` | 통과 |
| `node scripts/check-public-refs.mjs` | 통과 |
| `git diff --check` | 통과 |

이동 도구 테스트는 이동 전에 존재하던 파일을 덮어쓰지 않는지, 표 전체의 충돌을 쓰기 전에 찾는지,
경로 탈출과 symlink 를 거부하는지 확인한다.
정적 import, 재내보내기, 동적 import, vitest mock, 템플릿 표현식과 문서 경로도 확인한다.
실제 Dooray API·웹·SMTP·IMAP 은 부르지 않았다.

## 기술 결정

| 결정 | 선택과 이유 |
| --- | --- |
| 공통 타입 | 응답 봉투·오류 DTO 만 common 에 두었다. 이름이 일반적이어도 영역 데이터는 그 영역에 둔다 |
| 프로젝트 타입 | 프로젝트 참조·태그·마일스톤·워크플로·그룹·템플릿은 project 에 둔다. project 메서드가 제공하는 데이터다 |
| 멤버와 소속 정보 | Member·EmailUser·Group·MemberOrganization 은 member 에 둔다. 소속 응답에 쓰는 바쁨 시간 조회 타입은 calendar 에서 직접 가져온다 |
| 타입 파일 크기 | 영역 파일이 설계의 분할 기준보다 작아서 types-주제 파일은 만들지 않았다 |
| 선언 분할과 파일 이동 | R1 은 이동 스크립트의 대상이 아니다. 선언 분할과 소비자 import 수정은 직접 수행하고 별도 커밋으로 남겼다. 충돌하면 두 변경을 직접 다시 맞춘다 |

## 문서 정합성과 공통화 후보

| 문서 | 영향 | 대조 결과 |
| --- | --- | --- |
| spec.md | 요구사항·사용자 결정 유지 | R1 부분 범위와 일치 |
| design.md | 기존 R1 배치·이동 도구 계약 적용 | 설계 변경 없음 |
| `docs/code-architecture.md` | 실제 타입 위치와 의존 금지 규칙 변경 | 구현·규칙 테스트와 일치하도록 수정 |
| ADR-082 | 계층 유지와 api 영역 분할 | 결정 변경 없음 |
| PRD·flow·data-schema | 사용자 명령·호출 흐름·저장 형식 유지 | 영향 없음 |

후보 없음: 코드 구조 설계와 현재 의존 규칙을 대조했다.
공통 응답 구조는 이미 common/types.ts 로 모았고, 추가 공유 계약으로 추출할 도메인 규칙 변경이 없다.
기존 문서 경로 오류는 이번 PR 에서 이동하지 않은 파일을 가리키므로 후속 구조 정리 범위에 남긴다.

한국어 검사는 이번 변경에 새로 쓴 줄과 PR 제목·본문을 대상으로 한다.
기존 구조 문서의 범위 밖 표현은 고치지 않는다.

## 독립 검토와 남은 작업

단독 worker 로 구현하고 검증했다. 하위 에이전트와 helper worker 는 띄우지 않았다.
계획 critic 과 독립 코드·문서 리뷰는 코디네이터의 Claude 리뷰 worker 에게 넘긴다.
같은 에이전트의 자체 대조를 독립 리뷰 통과로 기록하지 않는다.
독립 리뷰가 끝나기 전까지 계획은 보존한다.

남은 것은 원격 CI, 독립 리뷰 반영과 코디네이터의 머지다.
머지·배포 뒤 제품 실행 검증은 필요 없다. 사용자 동작과 저장 데이터 형식은 바뀌지 않았다.
이번 PR 은 R1 이며 공개 구현 분할과 후속 구조 정리는 완료 범위에 포함하지 않는다.
