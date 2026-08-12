# planning 오버레이 — dooray-cli

공용 코어(`~/.claude/skills/planning`)에 dooray-cli 특화를 주입한다.
코어의 8단계 skeleton 을 이 레포의 도메인(TypeScript CLI)·docs 컨벤션·검증·실행기 스키마에 맞춰 채운다.

## 도메인: CLI (TypeScript / Commander.js)

코어 `step-3` 부터 `step-6` 이 도메인 변형을 오버레이에 위임한다.
각 단계가 대조할 소유 문서는 아래와 같다. 규약 본문을 여기 옮겨 적지 않는다 — 옮기면 갈라진다.

| 단계 | 대조할 곳 |
| --- | --- |
| 3 호출 시나리오 | `CLAUDE.md` "명령 공통 규약" — 입력 형식, 출력 모드, 에러와 빈 상태 |
| 4 인터페이스 | `CLAUDE.md` 출력 규약. 표·JSON·quiet 세 포맷터 중 무엇을 고치는지 명시한다 |
| 5 API | `src/api/client.ts` 에 재사용할 메서드가 있는지. 새 endpoint 면 `docs/adr/INDEX.md` 에서 해당 API 함정 ADR 을 찾는다 |
| 6 코드 구조 | `docs/code-architecture.md` 의 레이어와 의존 방향. 새 resolver 는 기존 매칭 정책을 따른다 |

### CLI 레포 전 규모 4단계 압축

전 규모에서 8단계를 4단계로 압축 가능 — 단 압축된 각 단계 내부에서 모호함 제거는 동일하게 수행한다.

| 압축 단계 | 원 단계 |
|---|---|
| (1+2) | 구현 가능성, 기술 스택 |
| (3+4) | 호출 시나리오, 인터페이스 |
| (5+6) | API, 코드 구조 |
| (7+8) | docs 영향, task 생성 |

## docs 컨벤션

필수 관리 문서 다섯은 코어 `SKILL.md` "필수 관리 문서" 가 소유한다. 이 레포의 추가 사항만 여기 둔다.

- ADR 은 1개가 파일 1개이고 목록은 `docs/adr/INDEX.md` 다
- `README.md` 와 `skills/` 는 외부 facing 이라 내부 추적 번호를 넣지 않는다

### 변경 유형별 docs 영향 표 (필수 — 누락 0 화)

신규 작업 시 해당 행을 찾아 표시된 모든 docs 를 손댄다. 표시 없으면 미손.

| 변경 유형 | CLAUDE.md | adr/ | code-architecture.md | prd.md | flow.md | data-schema.md | README.md | skills/dooray-cli/SKILL.md |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 신규 CLI 명령 (소) | — (명령별 스펙은 CLAUDE.md 에 쌓지 않는다) | — | 디렉터리 트리, 필요 시 utils 추가 | MVP 범위 한 줄 | 사용자 흐름 섹션 | (캐시 도입 시) | 사용 예 섹션 | 빠른 참조 표, 자동화 시나리오 |
| 신규 ADR 동반 변경 | — (ADR 목록은 `docs/adr/INDEX.md` 가 소유) | ADR 본문 | 해당 영역 ADR-NNN 역참조 | (사용자 facing 시) | (사용자 흐름 변경 시) | (스키마 결정 시) | 사용 예 (해당 명령) | 시나리오 (해당 명령) |
| 캐시 schema / TTL 변경 | 캐시 규약 행 | ADR 갱신 (ADR-004/010) | utils/cache 섹션 | — | — | 캐시 디렉터리, 스키마 본문 | — | — |
| 새 API 호출 패턴 (재시도/redirect 등) | — | 정책 결정 ADR | api/ 섹션, ADR-NNN 역참조 | — | — | — | — | — |
| 기존 resolver 입력 형식 확대 | 공통 규약의 resolver 줄 (규약이 바뀔 때만) | — | resolver 주석 1줄 갱신 | — | 사용 예 (자동 분기 시나리오) | — | 사용 예 | 빠른 참조 표 |
| 의존성 추가 / 빌드 설정 | 빌드 명령 (해당 시) | ADR 작성 전 점검 후 ADR | 기술 스택 표 | — | — | — | — | — |
| 신규 스킬 추가 (`skills/<name>/`) | — | 배포 정책, 스킬이 의존하는 API 함정 | — (src 레이어 무변경 시) | MVP 범위 한 줄 | — (CLI 명령 흐름이 아니면 미손) | 스킬이 만드는 설정·산출물 스키마 | 내려받아 쓰는 방법 | — |

**갱신 시점 분리**: `README.md` 와 `skills/` 는 코드 산출물에 의존하므로 **마지막 phase** 에서 갱신한다.
나머지 결정 docs 를 task 생성 전에 반영하는 것은 코어 7단계가 요구한다.

### ADR 작성 전 점검

"자명하면 ADR 로 남기지 않는다" 는 판정은 코어 7단계가 요구한다.
이 레포에서 자명한지 보려면 `package.json`, lockfile, `tsconfig.json`, `src/api/types.ts`, 디렉터리 트리를 본다.
그중 하나만 봐도 같은 정보를 얻으면 ADR 이 아니다.

남길 가치가 있던 것은 이 레포에서 이런 성격이었다.

- 라이브러리 고유 함정 (ky retry 정책, imapflow UID 처리 등)
- 실측 수치 (캐시 응답 시간, API 제한 헤더 값 등)
- 대안 기각 근거, 정책, 비용·성능 트레이드오프

본문 구조와 넣지 않을 것은 코어 `task-create.md` "ADR 구조 템플릿" 이 소유한다.
채워진 예시는 `docs/adr/026-wiki-api-pitfalls.md` 다.

### 공개 문서 내부 참조 제거 (필수 — README / SKILL 갱신 시)

규칙과 검증 grep 은 `CLAUDE.md` "공개 문서(README · 공개 SKILL) — 내부 참조 번호 제외" 가 소유한다.
planning 에서는 README 와 `skills/` 를 손대는 phase 마다 그 grep 을 통과시킨다.

## index.json 스키마

기본 형태는 코어 `task-create.md` 의 스키마를 따른다. 전체 객체를 여기 복제하지 않는다.

이 레포는 중단된 plan 을 이어서 실행할 수 있도록 상태 필드를 더한다.
코어는 "이어서 작업" 과 "새로 시작" 분기를 요구하면서 어떤 필드가 그것을 나르는지는 레포에 맡긴다.

| 위치 | 필드 | 쓰임 |
| --- | --- | --- |
| task, phase | `status` | `pending` / `running` / `completed` / `failed` / `blocked` |
| task | `current_phase` | 어디까지 끝났는지. 0 이 미시작 |
| task | `error_message`, `blocked_reason` | 왜 멈췄는지. 없으면 `null` |

`verify-task.sh` 는 `execution_profile` 스키마와 phase 파일 위생만 본다.
아래는 검사하지 않으므로 직접 확인한다.

- `name` 이 디렉터리명과 같은가
- `total_phases` 가 `phases` 배열 길이와 같은가
- `number` 가 1부터 순차 증가하는가
- 각 `file` 이 실제로 있는가

## 검증

- **반복 함정 목록**: 코어가 요구하는 task 제출 전 self-check 의 대상은 `docs/pitfalls/` 다. 어느 카테고리를 볼지는 그 안의 `INDEX.md` 라우터가 정한다.
- **docs-verifier 흡수 원칙**: docs-verifier(`.claude/agents/dooray-cli-docs-verifier.md`)의 반복 지적은 별도 회고 docs 를 신설하지 않는다.
  - 위 "변경 유형별 docs 영향 표"에 행 추가나 보강으로 흡수한다.
  - 그 agent 가 이 표를 검증 기준으로 그대로 쓴다 — 표를 고치면 검증도 함께 달라진다.
- **개인 식별 정보 노출 금지**: task 파일 제출 전 `CLAUDE.md` 의 검증 grep 을 실행해 0건을 확인한다.

## plan 네이밍

**형식**: `tasks/{NNN}-{task-name}/` — 코어 기본값(`plan{N}-{slug}`)과 다르다. `plan` 접두어를 붙이지 않는다.

- `NNN` 은 3자리 zero-padded 순차 번호다. Issue 연결은 폴더명이 아니라 `index.json` 의 `description` 에 남긴다
- `task-name` 은 케밥 케이스이며 카테고리 접두(`feat-`/`fix-`/`refactor-`/`chore-`/`docs-`)로 시작한다
- 서브넘버 표기도 코어의 `plan003-2` 가 아니라 `006-2-feat-...` 형태다

### 번호 확인

번호 선점 원칙과 서브넘버 규칙은 코어 `SKILL.md` "동시성 안전" 이 소유한다.
다만 이 레포는 번호가 브랜치가 아니라 `tasks/` 디렉터리에 있어 확인 명령이 다르다.

```bash
# cwd: <repo root>
ls tasks/ | grep -E "^[0-9]{3}-" | sort
gh pr list --state open --json number,headRefName,title --jq '.[] | "\(.headRefName) \(.title)"'
```

번호 없는 레거시 폴더는 세지 않는다. 소급해서 이름을 바꾸지 않는다.

## branch 와 핸드오프

브랜치 전략과 docs-first 두 커밋 순서는 코어 `SKILL.md` 의 "동시성 안전" 과 "완료 후" 가 소유한다.
이 레포의 차이만 여기 둔다.

- 브랜치 이름은 `plan{NNN}-{task-name}` 으로, task 디렉터리 `tasks/{NNN}-{task-name}` 와 1:1 대응한다
- main 에 docs 를 먼저 넣지 않는다. `build-with-teams` 의 사전 검증이 원격 plan 브랜치에서 task 를 찾으므로 성립하지 않는다
- 핸드오프는 `/build-with-teams` 로 안내하고 `tasks/{NNN}-{task-name}` 디렉터리를 인자로 준다
