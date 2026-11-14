# dooray-cli plan 오버레이

## 도메인: CLI (TypeScript / Commander.js)

호출 시나리오, 인터페이스, API, 코드 구조 단계가 도메인 변형을 오버레이에 위임한다.
각 단계가 대조할 소유 문서는 아래와 같다.
규약 본문을 여기 옮겨 적지 않는다.
옮기면 갈라진다.

| 단계 | 대조할 곳 |
| --- | --- |
| 호출 시나리오 | `CLAUDE.md` "명령 공통 규약" — 입력 형식, 출력 모드, 에러와 빈 상태 |
| 인터페이스 | `CLAUDE.md` 출력 규약. 표·JSON·quiet 세 포맷터 중 무엇을 고치는지 명시한다 |
| API | `src/api/<영역>/public.ts` 에 재사용할 메서드가 있는지. 새 endpoint 면 `docs/adr/INDEX.md` 에서 해당 API 함정 ADR 을 찾는다 |
| 코드 구조 | `docs/code-architecture.md` 의 레이어와 의존 방향. 새 resolver 는 기존 매칭 정책을 따른다 |

### 변경 유형별 docs 영향 표

신규 작업 시 해당 행을 찾아 표시된 모든 docs 를 손댄다. 표시 없으면 미손.

| 변경 유형 | CLAUDE.md | adr/ | code-architecture.md | prd.md | flow.md | data-schema.md | README.md | docs/guide/ | skills/dooray-cli/ (SKILL.md, references/) |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 신규 CLI 명령 (소) | — (명령별 스펙은 CLAUDE.md 에 쌓지 않는다) | — | — (디렉터리가 새로 생길 때만) | MVP 범위 한 줄 | 사용자 흐름 섹션 | (캐시 도입 시) | 사용 예 섹션 | 해당 영역 가이드 | SKILL.md 빠른 참조 표와 자동화 시나리오, 해당 references 절 |
| 신규 ADR 동반 변경 | — (ADR 목록은 `docs/adr/INDEX.md` 가 소유) | ADR 본문 | — (계층이나 의존 방향이 바뀔 때만) | (사용자 facing 시) | (사용자 흐름 변경 시) | (스키마 결정 시) | 사용 예 (해당 명령) | (사용자 facing 시) 해당 영역 가이드 | 시나리오 (해당 명령), 해당 references 절 |
| 캐시 schema / TTL 변경 | 캐시 규약 행 | ADR 갱신 | — | — | — | 캐시 디렉터리, 스키마 본문 | — | — | references/common.md 의 캐시 무효 조건 (해당 시) |
| 새 API 호출 패턴 (재시도/redirect 등) | — | 정책 결정 ADR | 의존 관계 절 (계층이 바뀔 때만) | — | — | — | — | — | references/common.md 의 에러 표 (종료 코드가 바뀔 때만) |
| 기존 resolver 입력 형식 확대 | 공통 규약의 resolver 줄 (규약이 바뀔 때만) | — | — | — | 사용 예 (자동 분기 시나리오) | — | 사용 예 | 해당 영역 가이드 | SKILL.md 빠른 참조 표, 해당 references 절 |
| 의존성 추가 / 빌드 설정 | 빌드 명령 (해당 시) | ADR 작성 전 점검 후 ADR | 기술 스택 표 | — | — | — | — | — | — |
| 신규 스킬 추가 (`skills/<name>/`) | — | 배포 정책, 스킬이 의존하는 API 함정 | — (src 레이어 무변경 시) | MVP 범위 한 줄 | — (CLI 명령 흐름이 아니면 미손) | 스킬이 만드는 설정·산출물 스키마 | 내려받아 쓰는 방법 | 해당 스킬 가이드 (있을 때) | — |

### 공개 문서 내부 참조 제거

규칙과 검사는 `scripts/check-public-refs.mjs` 가 소유한다.
plan 에서는 README 와 `skills/` 를 손대는 phase 마다 그 스크립트를 통과시킨다.

## 검증

- **task 검사기**: `plan` 스킬의 `verify_task.ts` 하나만 쓴다.
  저장소는 별도 plan 검사기를 두지 않는다. 근거는 `docs/adr/059-plan-check-owned-by-skill.md` 다.
  같은 규칙을 저장소에 다시 만들면 그 결정이 무효가 된다.
- **반복 함정 목록**: task 제출 전 self-check 의 대상은 `docs/pitfalls/` 다. 어느 카테고리를 볼지는 그 안의 `INDEX.md` 라우터가 정한다.
- **docs-verifier 흡수 원칙**: docs-verifier 의 반복 지적은 별도 회고 docs 를 신설하지 않는다.
  위 "변경 유형별 docs 영향 표"에 행 추가나 보강으로 흡수한다.
