# Phase 01. executor 전용 agent 를 없애고 오버레이로 옮긴다

**Execution profile**: standard

## 목표

`.claude/agents/dooray-cli-executor.md` 를 제거하고 그 내용을 `build-with-teams` 오버레이로 옮긴다.
코어 `role-executor.md` 가 다시 executor 계약의 소유자가 되게 한다.

그리고 코어가 오버레이에 위임했는데 비어 있는 두 항목을 채운다.

**범위 외**: `docs-verifier` 는 phase 02 다.
코어 스킬 파일을 고치지 않는다. `~/.claude/skills/` 는 다른 저장소이므로 이 저장소에서 쓰지 않는다.
`src/` 를 고치지 않는다. 이 plan 은 하네스 지침만 다룬다.

## 컨텍스트

**근거 문서**: `docs/adr/050-agent-overlay-boundary.md`.

`dooray-cli-executor` 는 82줄이고 `model: sonnet` 만 갖는다. 도구 제한이 없다.
그래서 agent 파일이어야 할 이유가 없다. 근거는 ADR-050 의 「왜 `disallowedTools` 만 남는가」 다.

**이 agent 가 코어 계약을 덮으면서 잃은 것이 있다.** `grep` 으로 확인했고 0건이다.
`role-executor.md` 의 「테스트」, 「단언 대상」, 「테스트 품질」, 「중단 조건」 네 절이 그 agent 에 없다.
`EXECUTOR_ESCALATE` 판정도 없다.

옮길 내용은 그 agent 본문의 넷이다.

| 절 | 담은 것 |
| --- | --- |
| `<Role>` | 대기 규칙. team-lead 의 명시적 시작 지시 전까지 시작하지 않는다 |
| `<Preparation>` | 읽을 순서 셋. `CLAUDE.md`, `docs/pitfalls/INDEX.md` 라우터, 영역 ADR |
| `<Verification>` | phase 완료 전 통과 조건과 pitfalls 검사와 개인 식별 정보 점검 |
| `<Self_Discipline>` | 그 agent 가 지키던 자기 규율 |

코어가 오버레이에 위임하는 항목은 일곱이다. `~/.claude/skills/build-with-teams/SKILL.md:43-51` 의 표다.
그중 둘이 이 저장소 오버레이에 없다.

- 브랜치 이름 형식, 작업 공간을 만들고 정리하는 방법 (1, 2, 6단계)
- `index.json` 필드와 phase 파일 규격의 레포 변형 (3단계)

비어 있으면 코어가 사용자에게 되묻는 경로로 떨어진다.
같은 코어 문서 88행이 2단계에서 「만드는 방법은 오버레이가 소유한다」고 못 박는다.

실측한 관행은 이렇다. 이것을 적는다.

- 브랜치 이름은 `plan{N}-{종류}-{슬러그}` 다. `plan061-feat-wiki-page-move` 가 그 예다.
- 작업 공간은 Orca 워크트리다. `worktrees/dooray-cli/{이름}` 아래에 생기고 `.gitignore` 가 그 디렉터리를 무시한다.
- 워크트리를 만든 직후 `pnpm install` 을 실행한다. 오버레이의 「검증 명령」 절이 이미 그것을 적는다.
- 정리는 PR 머지 뒤에 한다. 미커밋과 미전송을 확인하고, 워크트리를 제거하고, 머지된 브랜치를 지운다.
- `index.json` 과 phase 파일 규격은 공용 코어의 `references/task-create.md` 를 그대로 쓴다. 이 저장소 변형이 없다.

`.claude/build-with-teams-overlay.md` 의 「planning 오버레이가 단일 소스인 항목」 표가
`planning` 오버레이의 없는 절 셋을 가리킨다. 「index.json 스키마」, 「plan 네이밍」, 「branch / 커밋 / 핸드오프」다.
`grep -n '^#' .claude/planning-overlay.md` 로 확인하면 그 절들이 없다. 그 표도 함께 고친다.

## 의도 메모

- 코어 계약을 오버레이에 베껴 넣지 않는다. 그러면 같은 계약이 두 곳에 생겨 코어가 바뀔 때 갈라진다.
  이번 유실이 그 형태로 생겼다.
- 오버레이는 코어가 위임한 자리만 채운다. 역할이 무엇을 해야 하는지는 코어가 소유한다.
- `model` 을 오버레이에 값으로 적는다. agent 파일 없이 스폰 시점에 넘길 수 있다.
- 완료된 plan 의 phase 파일을 고치지 않는다. 그 판정은 `harness-cleanup` 이 소유한다.

## 작업 항목

### 1. `.claude/build-with-teams-overlay.md` 의 「에이전트 이름」 절을 고친다

지금 executor 와 docs-verifier 를 전용 agent 로 지정한다.
executor 줄을 없애고, 코어 `role-executor.md` 를 쓴다는 것과 등급을 적는다.

담을 내용은 이렇다.

- executor 는 전용 agent 를 쓰지 않는다. 코어 `references/role-executor.md` 가 계약의 소유자다.
- 스폰 시 `model` 은 `sonnet` 을 기본으로 하고, 코어 `references/executor-routing.md` 의 규모별 등급 표가 그것을 올릴지 정한다.
- 아래 항목 2 에서 만드는 문서 경로를 스폰 프롬프트에 함께 넘긴다.

docs-verifier 줄은 phase 02 가 고친다. 이 phase 에서 손대지 않는다.

### 2. `.claude/executor-notes.md` 를 새로 만든다

`dooray-cli-executor` 본문의 저장소 고유 지침을 옮긴다. 코어 계약과 겹치는 것은 옮기지 않는다.

담을 것은 넷이다.

- **대기 규칙.** team-lead 의 명시적 시작 지시 전까지 작업을 시작하지 않는다.
  critic 의 `REVISE` 가 오는 중에 이전 plan 으로 실행하면 한 cycle 을 버린다.
  근거는 `docs/pitfalls/plan/executor-not-waiting-for-critic.md` 다.
- **읽을 순서.** 코드를 쓰기 전에 셋을 읽는다.
  `CLAUDE.md` 의 코드 컨벤션과 빌드 명령과 개인 식별 정보 규칙,
  `docs/pitfalls/INDEX.md` 라우터 표에서 `code-review` 행이 가리키는 디렉터리 중 이번 phase 와 관련된 파일,
  새 endpoint 나 캐시나 resolver 를 다루면 `docs/adr/INDEX.md` 의 해당 영역 ADR 이다.
  pitfalls 는 파일이 많으므로 전부 읽지 않고 라우터가 지시하는 것만 읽는다.
- **phase 완료 전 통과 조건.** `pnpm tsc --noEmit` 과 `pnpm run build` 와 `pnpm test` 셋이다.
  `pnpm run build` 는 tsup 이라 타입을 보지 않으므로 `tsc --noEmit` 을 따로 돌린다.
- **개인 식별 정보 점검.** `node scripts/check-pii.mjs` 를 통과시킨다.
  공개 문서를 고쳤으면 `node scripts/check-public-refs.mjs` 도 돌린다.

**코어 계약과 겹치는 것을 옮기지 않는다.** 테스트 범위와 단언 대상과 테스트 품질과 중단 조건은
코어 `role-executor.md` 가 소유한다. 그 내용을 이 파일에 적지 않는다.
파일 첫머리에 그 사실을 한 줄 밝힌다.

### 3. `.claude/agents/dooray-cli-executor.md` 를 제거한다

`git rm` 으로 지운다.

### 4. 「planning 오버레이가 단일 소스인 항목」 표를 고친다

그 표가 가리키는 네 절 중 셋이 `planning` 오버레이에 없다.
「index.json 스키마」, 「plan 네이밍」, 「branch / 커밋 / 핸드오프」다.
「검증」만 실제로 존재한다.

- 없는 세 행을 지운다.
- `index.json` 스키마와 phase 파일 규격은 공용 코어의 `references/task-create.md` 가 소유한다고 적는다.
- 브랜치와 작업 공간은 아래 항목 5 가 이 파일에 적으므로, 그 절을 가리키게 한다.

### 5. 오버레이에 「브랜치와 작업 공간」 절을 새로 넣는다

코어가 위임한 자리를 채운다. 위 컨텍스트에 적은 실측 관행 다섯을 담는다.
브랜치 이름 형식, 작업 공간 위치, 만든 직후 `pnpm install`, 정리 절차, `index.json` 규격의 소유자다.

정리 절차는 순서를 적는다. 미커밋과 미전송을 확인하고, 워크트리를 제거하고, 머지된 브랜치를 지운다.
`release/*` 브랜치와 미머지 브랜치는 남긴다.

### 6. 문서 검사를 이 phase 의 테스트로 돌린다

이 phase 는 코드를 바꾸지 않으므로 검사가 완료 판정이다.

```bash
# cwd: <repo root>
bash ~/.claude/scripts/korean-style-check.sh .claude/build-with-teams-overlay.md .claude/executor-notes.md
python3 ~/.claude/scripts/check-readability.py .claude/build-with-teams-overlay.md .claude/executor-notes.md
node scripts/check-pii.mjs
```

셋 다 종료 코드 0 이어야 한다.

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm run build
pnpm test
```

셋 다 통과해야 한다. 이 plan 은 `src/` 를 고치지 않으므로 회귀가 없어야 한다.

변경이 실제로 들어갔는지 확인한다.

```bash
# cwd: <repo root>
ls .claude/agents/*.md | wc -l                                        # = 1
ls .claude/agents/dooray-cli-executor.md 2>/dev/null | wc -l          # = 0
grep -c "dooray-cli-executor" .claude/build-with-teams-overlay.md     # = 0
grep -c "role-executor" .claude/build-with-teams-overlay.md           # >= 1
grep -c "executor-notes" .claude/build-with-teams-overlay.md          # >= 1
ls .claude/executor-notes.md >/dev/null && echo "notes 있음"
grep -c "index.json 스키마" .claude/build-with-teams-overlay.md        # = 0
grep -c "task-create" .claude/build-with-teams-overlay.md             # >= 1
grep -c "브랜치와 작업 공간" .claude/build-with-teams-overlay.md        # = 1
```

여덟 기대값이 모두 맞아야 한다.
`dooray-cli-executor` 가 0 인 것은 전용 agent 지정이 사라졌다는 근거다.
`index.json 스키마` 가 0 인 것은 없는 절을 가리키는 참조가 사라졌다는 근거다.

**코어 계약을 베껴 넣지 않았는지 확인한다.** 이것이 이 phase 의 핵심이다.

```bash
# cwd: <repo root>
grep -c "단언 대상" .claude/executor-notes.md      # = 0
grep -c "테스트 품질" .claude/executor-notes.md    # = 0
grep -c "중단 조건" .claude/executor-notes.md      # = 0
grep -c "EXECUTOR_ESCALATE" .claude/executor-notes.md   # = 0
```

넷 다 0 이어야 한다. 하나라도 있으면 코어와 갈라질 계약을 새로 만든 것이다.

`planning` 오버레이의 절이 실제로 없는 것을 확인하고 표를 고쳤는지 본다.

```bash
# cwd: <repo root>
grep -c "plan 네이밍" .claude/planning-overlay.md   # = 0
grep -c "plan 네이밍" .claude/build-with-teams-overlay.md   # = 0
```

둘 다 0 이어야 한다. 앞은 그 절이 원래 없다는 것이고, 뒤는 없는 절을 가리키지 않게 됐다는 것이다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `.claude/agents/dooray-cli-executor.md` | 삭제 |
| `.claude/executor-notes.md` | 신규 |
| `.claude/build-with-teams-overlay.md` | 수정 |
