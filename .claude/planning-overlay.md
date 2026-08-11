# planning 오버레이 — dooray-cli

공용 코어(`~/.claude/skills/planning`)에 dooray-cli 특화를 주입한다.
코어의 8단계 skeleton 을 이 레포의 도메인(TypeScript CLI)·docs 컨벤션·검증·실행기 스키마에 맞춰 채운다.

## 도메인: CLI (TypeScript / Commander.js)

- **3단계 (호출 시나리오)**: 명령 인자·플래그 조합, `--json`/`--quiet` 출력 분기, resolver 입력 형식(이름/이메일/id/URL) 자동 분기 시나리오를 구체화한다.
  - 엣지 케이스: 정상 / 에러 / 빈 상태 / 모호 매칭(후보 목록) 점검
- **4단계 (인터페이스)**: 명령 시그니처, 옵션 이름, `stdout`(데이터) / `stderr`(스피너·에러) 출력 분리를 설계한다.
  - table/json/quiet 3 포맷터 중 무엇을 갱신하는지 명시
- **5단계 (API)**: 기존 `DoorayApiClient`(`src/api/client.ts`) 메서드 재사용 가능 여부를 확인한다.
  - 새 endpoint 면 307 redirect·retry 정책(ADR-002/015) 적용 여부 점검
- **6단계 (코드 구조)**: 레이어는 `api/` → `resolvers/` → `commands/` → `formatters/`.
  - 새 resolver 는 기존 정책(정확일치 → 이름 부분일치 → 모호 시 에러+후보)을 따르는지 확인

### CLI 레포 전 규모 4단계 압축

전 규모에서 8단계를 4단계로 압축 가능 — 단 압축된 각 단계 내부에서 모호함 제거는 동일하게 수행한다.

| 압축 단계 | 원 단계 |
|---|---|
| (1+2) | 구현 가능성 + 기술 스택 |
| (3+4) | 호출 시나리오 + 인터페이스 |
| (5+6) | API + 코드 구조 |
| (7+8) | docs 영향 + task 생성 |

## docs 컨벤션

5 핵심 docs — `docs/prd.md` / `docs/flow.md` / `docs/adr/`(ADR 1개 = 파일 1개, 목록은 `docs/adr/INDEX.md`) / `docs/data-schema.md` / `docs/code-architecture.md`.
`CLAUDE.md` 는 코드 작업 지침. `README.md` + `skills/dooray-cli/SKILL.md` 는 외부 facing 사용자 가이드.

### 변경 유형별 docs 영향 표 (필수 — 누락 0 화)

신규 작업 시 해당 행을 찾아 표시된 모든 docs 를 손댄다. 표시 없으면 미손.

| 변경 유형 | CLAUDE.md | adr/ | code-architecture.md | prd.md | flow.md | data-schema.md | README.md | skills/dooray-cli/SKILL.md |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 신규 CLI 명령 (소) | — (명령별 스펙은 CLAUDE.md 에 쌓지 않는다) | — | 디렉터리 트리 + 필요 시 utils 추가 | MVP 범위 한 줄 | 사용자 흐름 섹션 | (캐시 도입 시) | 사용 예 섹션 | 빠른 참조 표 + 자동화 시나리오 |
| 신규 ADR 동반 변경 | ADR 참조 표 행 | ADR 본문 | 해당 영역 ADR-NNN 역참조 | (사용자 facing 시) | (사용자 흐름 변경 시) | (스키마 결정 시) | 사용 예 (해당 명령) | 시나리오 (해당 명령) |
| 캐시 schema / TTL 변경 | 캐시 규약 행 | ADR 갱신 (ADR-004/010) | utils/cache 섹션 | — | — | 캐시 디렉터리 + 스키마 본문 | — | — |
| 새 API 호출 패턴 (재시도/redirect 등) | — | 정책 결정 ADR | api/ 섹션 + ADR-NNN 역참조 | — | — | — | — | — |
| 기존 resolver 입력 형식 확대 | 공통 규약의 resolver 줄 (규약이 바뀔 때만) | — | resolver 주석 1줄 갱신 | — | 사용 예 (자동 분기 시나리오) | — | 사용 예 | 빠른 참조 표 |
| 의존성 추가 / 빌드 설정 | 빌드 명령 (해당 시) | ADR 작성 전 점검 후 ADR | 기술 스택 표 | — | — | — | — | — |
| 신규 스킬 추가 (`skills/<name>/`) | — | 배포 정책, 스킬이 의존하는 API 함정 | — (src 레이어 무변경 시) | MVP 범위 한 줄 | — (CLI 명령 흐름이 아니면 미손) | 스킬이 만드는 설정·산출물 스키마 | 내려받아 쓰는 방법 | — |

**갱신 시점 분리**: planning 결정 docs(`adr/`·`code-architecture.md`·`CLAUDE.md`·`data-schema.md`·`flow.md`·`prd.md`)는 **task 생성 전 즉시 반영 + commit**.
`README.md` 와 `skills/dooray-cli/`(사용자 가이드)는 코드 산출물에 의존하므로 **마지막 phase** 에서 갱신한다.
이 분리를 phase 작성 시 명시적으로 따른다.
planning 결정 docs 를 phase 안에서 고치면 안 된다.

### ADR 작성 전 점검 (필수 자문)

아래 3개에 **모두 NO** 여야 ADR 로 기록한다. 하나라도 YES 면 대안 채널(`CLAUDE.md` 규칙 / 코드 주석 / 커밋 메시지 / 다른 docs)로 내려보낸다.

1. `package.json`·lockfile·`tsconfig.json`·`src/api/types.ts`·디렉터리 트리 중 어느 하나를 보면 같은 정보를 얻는가?
2. "왜 X 를 선택했다"를 1~2 문장 이상으로 설명하기 어려운가?
3. 다른 프로젝트에서도 일반적으로 하는 선택인가?

**유지 적격**(3개 모두 NO):

- 라이브러리 고유 함정 (ky retry 정책, imapflow UID 처리 등)
- 실험 결과 (캐시 cold/warm 응답 시간 등 실측 수치)
- 대안 기각 근거
- 정책·규칙
- 비용·성능 트레이드오프

**ADR 구조**: `## ADR-NNN: {제목}` → **결정** → **맥락** → **대안 기각** → (선택) **트레이드오프**/**적용 범위**.

**금지**:

- 코드 블록 10줄 이상 (1~3줄 식별자 예시만 허용)
- 파일 경로 3개 이상 나열
- "변경 항목 1/2/3/4" 작업 내역
- CLAUDE.md 스택 규칙 반복

### 공개 문서 내부 참조 제거 (필수 — README / SKILL 갱신 시)

`README.md` 와 `skills/` 는 사용자·에이전트 대상이라 `ADR-NNN`, `Issue #NN`, `task NNN` 같은 내부 참조를 남기지 않는다.
문장에 녹은 참조도 번호를 빼고 재작성한다.

검증 grep 은 `CLAUDE.md` "공개 문서(README · 공개 SKILL) — 내부 참조 번호 제외" 섹션에 있다.

## index.json 스키마 (레포 특화 — `build-with-teams` 강제)

`build-with-teams` 워크플로우가 아래 필드를 엄격히 강제한다.
코어 예시와 다른 점:

- task 레벨 — `related_docs`/`depends_on` 대신 `updated_at`/`current_phase`/`error_message`/`blocked_reason` 필수
- phase 레벨 — `model` 대신 `allowedTools` 필수

필드 목록:

```jsonc
{
  "name": "{NNN}-{task-name}",           // 디렉터리명과 일치
  "description": "무엇을 구현하는 task인지 한 줄 설명",
  "created_at": "2026-07-14T00:00:00Z",   // ISO 8601
  "updated_at": "2026-07-14T00:00:00Z",   // team-lead 자동 갱신
  "status": "pending",                    // pending | running | completed | failed | blocked
  "current_phase": 0,                     // 0 = 미시작
  "total_phases": 3,                      // phases 배열 길이와 일치
  "error_message": null,
  "blocked_reason": null,
  "phases": [
    {
      "number": 1,                        // 1부터 순차 증가
      "title": "phase 제목",
      "file": "phase-01.md",
      "status": "pending",
      "allowedTools": ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
      "model": "sonnet"                   // (선택) haiku | sonnet | opus
    }
  ]
}
```

모든 필드 필수 — 생략하면 build-with-teams 가 task 를 읽지 못한다.

검증 체크리스트:

- `total_phases` == `phases` 배열 길이
- 모든 phase 에 `number`/`title`/`file`/`status`/`allowedTools` 존재
- `number` 가 1부터 순차 증가
- 각 `file` 이 실제 존재

## 검증

- **critic/code-review 회피 패턴**: task 파일 제출 전 아래 경로를 self-check 한다.
  - `docs/pitfalls/plan/` — critic 의 plan 평가 회피
  - `docs/pitfalls/team/` — team 협업 회피
  - `docs/pitfalls/code-review/` — code-reviewer 의 코드 검사 회피
- **docs-verifier 흡수 원칙**: docs-verifier(`.claude/agents/dooray-cli-docs-verifier.md`)의 반복 지적은 별도 회고 docs 를 신설하지 않는다.
  - 위 "변경 유형별 docs 영향 표"에 행 추가/보강으로 흡수한다.
  - 코어 `build-with-teams/SKILL.md` 의 docs-verifier 검증 단계가 이 표를 그대로 검증 기준으로 쓴다 — 표를 수정하면 그쪽 검증도 함께 달라지는지 확인한다.
- **개인 식별 정보 노출 금지**: task 파일 제출 전 `CLAUDE.md` "개인 식별 정보 / 사내 식별자 노출 금지" 섹션의 검증 grep 을 실행해 0건을 확인한다.
  - 코어 planning 스킬의 task 자가 점검 항목에 더해 이 검사도 수행한다.

## plan 네이밍

**형식**: `tasks/{NNN}-{task-name}/` — 코어 기본값(`plan{N}-{slug}`)과 다르다. `plan` 접두어를 붙이지 않는다.

- `NNN` = 3자리 zero-padded 순차 번호. Issue 연결은 폴더명이 아니라 `index.json`의 `description` 필드에 남긴다.
- `task-name` = 케밥 케이스 간결 요약이며 카테고리 접두(`feat-`/`fix-`/`refactor-`/`chore-`/`docs-`)로 시작한다.
- `index.json`의 `name` 필드는 폴더명과 **동일**하게 설정.

### 번호 충돌 방지 (필수)

```bash
# cwd: <repo root>
ls tasks/ | grep -E "^[0-9]{3}-" | sort
gh pr list --state open --json number,headRefName,title --jq '.[] | "\(.headRefName) \(.title)"'
```

다음 가용 번호(가장 큰 번호 + 1) 사용. 번호 없는 레거시 폴더는 count 에서 제외(소급 rename 금지).

### 서브넘버 규칙

동일 도메인 확장/동일 패턴 복제 후속 작업은 같은 번호에 서브넘버를 붙인다 (예: `006-feat-wiki-page-edit-non-interactive` → `006-2-feat-wiki-page-bulk-edit`). 서로 다른 도메인/독립 실행 가능이면 별도 번호.

## branch / 커밋 / 핸드오프

- **task 파일과 planning docs 는 plan 브랜치에 commit** — main 직접 commit 금지.
  - 브랜치 이름은 `plan{NNN}-{task-name}` 으로, task 디렉터리 `tasks/{NNN}-{task-name}` 와 1:1 대응한다.
  - planning 은 PR 을 만들지 않는다. 이 브랜치에 구현 커밋이 이어 붙어 PR 1개로 닫힌다 — 계획과 코드가 같은 PR 에서 함께 검토된다.
  - main 에 docs 를 먼저 넣으면 코드가 머지되지 않아도 문서만 앞서 나가고, `build-with-teams` 의 사전 검증(원격 plan 브랜치에 task 존재)도 성립하지 않는다.
- **커밋 순서 (docs-first, 2개 커밋으로 분리)** — 두 커밋 모두 plan 브랜치에 쌓는다:
  1. docs 최신화 커밋 + push (`docs(scope): ...`) — task 생성 전 필수, 건너뛰기 금지
  2. task 파일(`index.json` + `phase-*.md`) 커밋 + push — 실행 전 필수
- **핸드오프**: `/build-with-teams` 로 안내한다. `tasks/{NNN}-{task-name}` 디렉터리를 인자로 받아 Agent Teams 가시적 협업(team-lead·critic·executor·docs-verifier)을 수행한다.
