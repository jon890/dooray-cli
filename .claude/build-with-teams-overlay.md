# build-with-teams 오버레이 — dooray-cli

공용 코어(`~/.claude/skills/build-with-teams`)에 dooray-cli 특화를 주입한다.

## 통합 검증 명령

`CLAUDE.md` "빌드 & 실행" 섹션이 단일 소스. 요약:

- **패키지 매니저**: `pnpm`
- **통합 검증**: `pnpm run build && pnpm test` (테스트 없으면 `pnpm run build` 단독)
- **타입 체크 전용**: `pnpm tsc --noEmit` (런타임 번들에는 미사용)
- **마이그레이션 도구**: 없음 — `~/.dooray/cache/` 파일 기반 캐시. schema 변경은 `src/cache/`로 처리
- **worktree 직후 setup**: `pnpm install`

## 에이전트 이름

- **executor**: `dooray-cli-executor` (project-local, `.claude/agents/dooray-cli-executor.md`) — phase 시작 직전 TOP 패턴 self-check grep 자체 수행
- **docs-verifier**: `dooray-cli-docs-verifier` (project-local, `.claude/agents/dooray-cli-docs-verifier.md`) — ADR·docs 영향 표·개인 식별 정보 사전 점검 등 도메인 지식 내장

## index.json 스키마 (레포 특화 — 강제)

코어 예시와 다른 점:

- task 레벨 — `related_docs`/`depends_on` 대신 `updated_at`/`current_phase`/`error_message`/`blocked_reason` 필수
- phase 레벨 — `model` 대신 `allowedTools` 필수

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

## common-pitfalls 경로

critic/executor 는 task 파일 제출·실행 전 아래 경로를 self-check 한다:

- `docs/pitfalls/plan/` — critic 의 plan 평가 회피
- `docs/pitfalls/team/` — team 협업 회피
- `docs/pitfalls/code-review/` — code-reviewer 의 코드 검사 회피

라우터는 `docs/pitfalls/INDEX.md`.

**docs-verifier 흡수 원칙**: docs-verifier 의 반복 지적은 별도 회고 docs 를 신설하지 않고 `.claude/planning-overlay.md` "변경 유형별 docs 영향 표"에 행 추가·보강으로 흡수한다.

## 개인 식별 정보 / 사내 식별자 노출 금지

금지 유형과 검증 grep 의 단일 소스는 `CLAUDE.md` "개인 식별 정보 / 사내 식별자 노출 금지" 섹션.
사내 식별자를 여기에 나열하면 그 자체가 노출이므로, 공개 도메인 화이트리스트 외 검출 방식을 쓴다.

```bash
# cwd: <repo root>
grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ CLAUDE.md .claude/ src/ 2>/dev/null \
  | grep -vE "dooray\.com|gov-dooray\.com|dooray\.co\.kr|gov-dooray\.co\.kr|helpdesk\.dooray\.com|github\.com|npmjs\.com|example\.com|youtube\.com|anthropic\.com|x\.com"
grep -rnE "[0-9]{15,}" README.md skills/ docs/ .claude/ 2>/dev/null | grep -vE "1234567890123456789|9876543210987654321|2939987647631384419|<postId>|<pageId>"
```

## plan 네이밍 (코어 기본값과 다름)

**형식**: `tasks/{NNN}-{task-name}/` — 코어 기본값(`plan{N}-{slug}`)과 다르다. `plan` 접두어를 붙이지 않는다.

- `NNN` = 3자리 zero-padded 순차 번호. Issue 연결은 `index.json`의 `description` 필드에 남긴다.
- `task-name` = 케밥 케이스 + 카테고리 접두(`feat-`/`fix-`/`refactor-`/`chore-`/`docs-`) — 아래 branch prefix 와 반드시 일치.

**번호 충돌 방지**:

```bash
# cwd: <repo root>
ls tasks/ | grep -E "^[0-9]{3}-" | sort
gh pr list --state open --json number,headRefName,title --jq '.[] | "\(.headRefName) \(.title)"'
```

다음 가용 번호(가장 큰 번호 + 1) 사용. 번호 없는 레거시 폴더는 count 에서 제외.

**서브넘버 규칙**: 동일 도메인 확장·동일 패턴 복제 후속 작업은 같은 번호에 서브넘버(`006-2-feat-...`). 다른 도메인·독립 실행이면 별도 번호.

## 커밋 컨벤션

- **task 파일 + planning docs**: main 브랜치 직접 commit — 별도 branch 분기 금지.
- **커밋 순서 (docs-first, 2개 커밋으로 분리)**:
  1. docs 최신화 커밋 + push (`docs(scope): ...`) — task 생성 전 필수
  2. task 파일(`index.json` + `phase-*.md`) 커밋 + push — 실행 전 필수
- **실제 코드 구현 branch** (task 실행 단계):

  | 카테고리 | branch prefix | 예시 |
  |---|---|---|
  | 신규 기능 task | `feat/{NNN}-{slug}` | `feat/033-feat-post-edit-tag-options` |
  | 버그 수정 task | `fix/{NNN}-{slug}` | `fix/032-fix-member-group-resolver-guard` |
  | 리팩토링 task | `refactor/{NNN}-{slug}` | `refactor/028-refactor-client-throw-await` |
  | 메타 작업 (task 폴더 없음) | `chore/{topic}` | `chore/replace-foreign-terms` |
  | docs 단독 (task 폴더 없음) | `docs/{topic}` | `docs/readability-6-patterns` |

  task 폴더명 접두와 branch prefix 가 반드시 일치 (`032-fix-...` → `fix/032-fix-...`).
- **PR 제목 형식**: `type(scope): description`. PR 본문에 commit 목록 나열 금지 — GitHub Commits 탭으로 충분.
