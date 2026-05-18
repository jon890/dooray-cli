---
name: plan-and-build
description: AI 에이전트 하네스 기반 대규모 구현 자동화. 논의·계획·task 생성·phase 순차 실행까지 자기완결로 진행. 새 기능 추가, 다중 phase 리팩토링에 사용. "/plan-and-build", "plan and build", "여러 phase 로 나눠 진행", "하네스로 자동 실행" 같은 요청 시 반드시 이 스킬 사용.
---

# plan-and-build

새 기능이나 대규모 변경을 phase 단위로 분리하고, `run-phases.py` 하네스를 통해 Claude Code가 자동으로 순차 실행하는 시스템.

## 핵심 원칙 — 사용자에게 묻지 말고 자동으로 따를 것

**모든 작업은 반드시 이 순서를 자동으로 따른다. 사용자가 매번 지시하지 않아도 된다 — 사용자 개입 없이 자기완결적으로 동작해야 한다:**

1. 논의가 필요하면 먼저 논의
2. **docs 반영 + 커밋** (task 생성 전 필수, 건너뛰기 금지)
3. **task 파일 생성 + 커밋** (실행 전 필수)
4. task 실행
5. 완료 후 검증

이 순서를 어기면 안 된다. "docs 반영해줘", "task 생성해줘"를 사용자가 반복 요청할 필요 없다.

## 실행 절차

### 1. 문서 파악

`docs/` 하위 문서들을 읽어 프로젝트 기획·아키텍처·설계 의도를 파악한다. 필요 시 여러 Explore 에이전트를 병렬로 사용.

참조 문서: `docs/prd.md`, `docs/data-schema.md`, `docs/flow.md`, `docs/code-architecture.md`, `docs/adr.md`, `CLAUDE.md`

### 2. 논의

구체화·기술 논의 사항을 사용자에게 제시. 사용자가 충분히 논의됐다고 판단하면 다음 단계로.

### 2.5. docs 최신화 + 커밋 (task 생성 전 필수)

논의 결과를 반드시 **task 생성 전에** docs에 반영. task 내부(phase)에서는 docs를 수정하지 않는다.

**순서**: docs 최신화 → **docs 별도 커밋 + push** → task 생성 → task 실행

**docs-first 커밋 원칙**:
- docs 변경사항을 먼저 단독 커밋 (`docs(scope): ...`)
- 그 후 task 파일 생성 및 실행
- 장점: task 실패 시에도 docs는 main에 남아있음, task 커밋과 분리되어 history 명확

### 3. 구현 계획 초안

`.claude/skills/planning/task-create.md`를 정확히 숙지한 후 다음을 포함한 초안 작성:

- phase별 분리 이유와 작업 목록
- 성공 기준 (실행 가능한 명령어)
- 논의 필요한 사항

사용자 피드백을 받아 계획을 확정.

### 4. Task 생성

`.claude/skills/planning/task-create.md` 형식에 따라 task와 phase 파일을 생성:

```
tasks/{NNN}-{task-name}/
  index.json
  phase-01.md
  phase-02.md
  ...
```

각 phase 프롬프트는 **자기완결적**이어야 한다 — 이전 대화 없이 독립 실행 가능.

### 5. 실행

**실행 전 필수 확인**: `git status --porcelain`으로 working directory 상태 확인.

- **이상적**: clean 상태 (docs 커밋 완료 후)
- **허용 가능**: task와 무관한 format-on-save만 존재
- **금지**: 같은 working directory에서 다른 task와 병렬 실행

**병렬 실행 규칙**: 두 task 동시 실행은 반드시 **git worktree 분리** 또는 **claude teams**(subagent) 사용. 같은 working directory에서 `run-phases.py`를 2개 동시 실행 금지.

**반드시 `run-phases.py`를 Bash `run_in_background: true`로 실행한다.**

```bash
# cwd: <repo root>
# 전체 실행 (백그라운드)
python3 .claude/skills/plan-and-build/run-phases.py tasks/{NNN}-{task-name}

# 특정 phase부터 재개
python3 .claude/skills/plan-and-build/run-phases.py tasks/{NNN}-{task-name} --from-phase 3
```

**Task phase에서 파일 커밋 규칙**:
- 각 phase는 **자신의 변경 + 암묵적 의존성** 모두 커밋
- 예: DB 스키마 변경 → 관련 타입 파일도 자동 수정됨 → 함께 커밋
- Phase N (commit)에서 **반드시 `git status --porcelain` 실행 후 task 관련 파일 모두 선별하여 add**
- 명시적 목록에 없더라도 task의 변경으로 수정된 파일은 포함
- `git add -A` 금지 — 다른 task 변경/format-on-save 혼입 방지

### 5.1. 실패 복구 — 반드시 실패한 phase부터 재시작

**Phase가 타임아웃/에러로 실패한 경우, 해당 phase를 "완료"로 판단하지 말 것.**

- 타임아웃은 "작업 중간"에서 끊긴 것. "완료 직전"이 보장되지 않음
- diff가 많아 보여도 일부 파일만 수정하고 나머지를 놓쳤을 수 있음
- **각 phase는 자기완결적으로 설계됨** — 이미 수정된 파일은 건너뛰고 놓친 파일을 잡아냄

**복구 절차**:
1. `--from-phase {실패한 phase 번호}`로 재시작 (다음 phase가 아닌 **실패한 phase**)
2. index.json의 해당 phase status를 `"pending"`으로 리셋
3. phase가 스스로 현재 코드 상태를 읽고 남은 작업을 판단하게 위임

**금지**: 실패한 phase의 diff를 눈으로 보고 "거의 완료됐으니 다음으로 넘기자"는 판단.

### 6. 완료 후 처리

1. `index.json` status 확인 → `completed` 이면 성공
2. 사용자에게 로컬 테스트 요청
3. 사용자 확인 후 **git commit + push** 진행
4. 다음 plan으로 이동

### 7. 알림 (DOORAY_WEBHOOK_URL 설정 시 자동)

run-phases.py 종료 코드에 따라 웹훅 알림 발송:

| exit code | 의미 | 메시지 |
|---|---|---|
| 0 | 성공 | `✅ Task {name} 완료 (N phases)` |
| 1 | 오류 | `❌ Task {name} phase {n} 실패` |
| 2 | blocked | `⚠️ Task {name} phase {n} blocked` |

---

## 구조

```
tasks/
  {task-name}/
    index.json        # task 메타데이터 + phase 목록
    phase-01.md       # 자기완결적 실행 프롬프트
    phase-02.md
    ...

.claude/skills/
  plan-and-build/
    run-phases.py     # phase 순차 실행기 (실시간 스트리밍, --from-phase 지원)
  planning/
    task-create.md    # task/phase 작성 가이드
```

## Phase 모델 라우팅 (토큰 효율 최우선)

**원칙**: 계획/설계는 Opus, 실제 구현은 Sonnet, 단순 작업은 Haiku.

| 모델 | 용도 | 예시 |
|---|---|---|
| `haiku` | 기계적 작업 (git, 빌드 검증, 파일 삭제) | 빌드 검증 + 커밋 phase, 단순 삭제 |
| `sonnet` | **실제 구현 대부분** — 코드 작성/수정/rename/리팩토링 | 함수 작성, 컴포넌트 수정, rename, repo 수정 |
| `opus` | **계획/설계/논의** (task 외부에서만) + 복잡 알고리즘 설계 | planner, architect, deep-interview |

**Task phase에서 opus 사용 금지 원칙** (예외만 허용):
- ❌ 기계적 rename/이동: sonnet으로 충분
- ❌ 파일 수가 많다는 이유만으로 opus
- ❌ 여러 레이어 동시 수정: sonnet으로 충분
- ✅ 새로운 아키텍처 설계가 phase 안에 포함된 경우: opus 허용
- ✅ 복잡한 알고리즘 구현 (도메인 핵심 신규 설계): opus 허용

**판단 기준**: "이 phase는 *무엇을 할지 결정*하는 작업인가, *이미 결정된 것을 수행*하는 작업인가?"
- 결정 = opus / 수행 = sonnet

## Phase 프롬프트 작성 핵심 규칙

1. **원자적 단일 책임**: 성격이 다른 작업은 반드시 별도 phase로 분리
2. **작업 항목 5개 이하**: 5개 초과 시 반드시 분리 (실증: 11개 항목 중 뒤 3개 누락)
3. **자기완결적**: 이전 대화 컨텍스트 없이 `claude --print`로 독립 실행
4. **먼저 읽을 문서 명시**: 각 phase 상단에 반드시 참조할 파일 경로 나열
5. **기존 코드 참조 섹션**: 패턴 파악용 기존 파일 경로 명시
6. **구체적 시그니처**: 생성할 함수의 이름, 파라미터, 반환 타입 명시
7. **성공 기준에 모든 작업 검증 포함**: grep/test/diff/build 명령으로 표현
8. **Blocked 조건**: 자동 복구 불가능한 상황의 마커 (`PHASE_BLOCKED: ...`)

## CLI 레이어 phase 가이드 (dooray-cli)

CLI 도구의 레이어는 `commands/ → resolvers/ → cache/store + api/client`. 새 명령 추가 시 권장 phase 분리:

| Phase | 내용 | 모델 |
|---|---|---|
| 1 | API client 메서드 + 타입 (`src/api/client.ts`, `src/api/types.ts`) | sonnet |
| 2 | Resolver (`src/resolvers/` — 캐시 + API 호출 통합) | sonnet |
| 3 | Cache store 변경 (`src/cache/store.ts` — 필요 시에만) | sonnet |
| 4 | Command 등록 (`src/commands/` — Commander.js) + Formatter (`src/formatters/`) | sonnet |
| 5 | 벤치마크 (`scripts/benchmark.sh` — cold/warm 측정) | sonnet |
| N-1 | `pnpm run build` + smoke test (`node dist/index.js {command} --help`) | haiku |
| N | 커밋 + push (+ 필요 시 `npm publish`) | haiku |

**레이어 역류 금지**: resolver가 command를 import하거나, cache가 resolver를 import하는 등 역방향 의존 금지. phase 1→5 순서는 의존 방향과 일치.

**placeholder 치환값 (dooray-cli)**:

| Placeholder | 값 |
|---|---|
| `{{PKG_MGR}}` | `pnpm` |
| `{{BUILD_CMD}}` | `pnpm run build` (tsup) |
| `{{TEST_CMD}}` | `pnpm test` (없으면 `node dist/index.js {command} --help` smoke test) |
| `{{CI_CMD}}` | `pnpm run build && pnpm test` (테스트 없으면 `pnpm run build`만) |
| `{{MIGRATION_TOOL}}` | (없음 — `~/.dooray/cache/` 파일 기반 캐시. schema 변경은 코드로 처리) |
| `{{POST_WORKTREE_SETUP}}` | `pnpm install` |

## Exit Codes

| 코드 | 의미 |
|---|---|
| 0 | 모든 phase 완료 |
| 1 | phase 실행 오류 (index.json error_message 참고) |
| 2 | 사용자 개입 필요 (index.json blocked_reason 참고) |
