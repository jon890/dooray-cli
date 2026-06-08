---
name: build-with-teams
description: Claude Agent Teams 파이프라인 — team-lead·critic·executor·docs-verifier 4 에이전트가 가시적으로 협업. run-phases.py 백그라운드 실행 대신 사용. "/build-with-teams", "agent team 으로 빌드", "teams 로 phase 실행", "critic 평가", "docs-verifier 검증" 같은 요청 시 반드시 이 스킬 사용.
---

# build-with-teams

task phase를 Claude Agent Teams 파이프라인으로 실행하는 시스템. `run-phases.py` 백그라운드 실행 대신 4-5명의 에이전트가 가시적으로 협업.

## 사전 검증 (실행 전 필수)

plan 인자를 받으면 **가장 먼저** 3중 검증. 하나라도 걸리면 사용자에게 알리고 **실행 차단** (사용자 확인 없이 강행 금지):

1. **main 의 index.json status**: `tasks/{plan}/index.json` 의 `status` 확인
   ```bash
   test -f tasks/{plan}/index.json || echo "TASK_MISSING"
   jq -r .status tasks/{plan}/index.json 2>/dev/null
   ```
   - `TASK_MISSING` → task 파일 부재. `/planning` 으로 먼저 설계할지 사용자에게 확인
   - `completed` → 추가 검증 필요 (PR 미머지 상태에서 `completed` 가 main 에 들어간 사고 가능성. 2·3번 결과로 판정)
   - `pending` / `in_progress` → 다음 검증으로

2. **원격 `feat/{plan}` 브랜치 존재**: 이미 작업 중이거나 PR 미머지 상태
   ```bash
   git ls-remote --heads origin "feat/{plan}" | grep -q . && echo FOUND || echo NONE
   ```
   `FOUND` → 차단 (사용자 확인 후 이어쓸지/새로 시작할지 결정).

3. **해당 plan 제목을 포함한 오픈 PR**: 작업 완료 후 머지 대기 중
   ```bash
   gh pr list --state open --search "{plan}" --json number,title,headRefName
   ```
   결과 있음 → 차단.

세 검증 모두 통과해야 신규 실행. 특히 PR 머지 전 단계에서 main의 index.json은 여전히 `pending`이므로 1번만 보면 재실행 사고를 놓친다. 2·3번이 커버.

### `completed` 마킹 ↔ 머지 commit 정합 검증 (역방향)

1번 검증에서 `status` 가 `completed` 인데 실제 머지 commit 이 `origin/main` 에 없으면 **마킹 사고** (commit 만 됐고 PR 머지 전인데 status 가 잘못 갱신된 케이스).
신규 실행 차단 전 한 번 더 확인:

```bash
git fetch origin
# task 번호 또는 task name 으로 머지 commit 검색
git log origin/main --oneline --grep "{NNN}\|{task-name}" | head -3
```

부재면 사용자에게 알리고 두 선택:
- status 를 `pending` 으로 되돌리고 신규 실행 (마킹 사고 정정)
- 머지 대기 중이면 옵션 A (이어서 작업) 흐름으로 전환

**Why**: completed 가 main 에 들어갔어도 PR 머지 전이면 작업 실제 결과물은 origin/main 에 없다. 1번만 보면 *"완료된 task"* 로 오인해서 재실행 시도 — fos-blog plan006/007 사고 패턴.

### task 단독 PR 이 이미 열려있는 경우 — 옵션 A (이어서 작업) 권장 흐름

위 2번 (FOUND) + 3번 (OPEN PR) 이 동시에 걸리고, 해당 PR 이 task 파일만 (코드 변경 0개) 머지 대기 중이라면 **옵션 A (이어서 작업)** 로 전환한다.
이는 차단이 아니라 **그 PR 을 그대로 결과물 통합 PR 로 사용**하는 흐름이다 (사후 정리 사고 회피).

**판정 기준** — `gh pr view <N> --json files,additions,deletions` 결과:
- `files` 가 `tasks/{plan}/...` 만 포함 + 코드 (`src/...`) 변경 0
- `state` = OPEN
→ 옵션 A 자동 권장 (사용자 confirm)

**옵션 A 흐름**:
1. **새 브랜치 만들지 말 것** — 기존 브랜치 그대로 사용
2. worktree 체크아웃: `git worktree add .claude/worktrees/{plan} feat/{plan}` (`-b` 없음 → 기존 브랜치 사용)
3. phase 실행 → 결과물 commit → **같은 브랜치**에 push (PR 에 commits 추가됨)

## 핵심 원칙

1. **docs-first**: docs 반영 + 커밋 → task 생성 → 실행. 순서 위반 금지
2. **가시적 협업**: 백그라운드 스크립트 대신 에이전트 팀이 각 단계를 명시적으로 수행
3. **평가 게이트**: critic 승인 없이 실행 불가. REVISE면 계획 수정 후 재평가
4. **docs 정합성**: 실행 완료 후 docs-verifier가 코드↔문서 일치 검증
5. **재시도 한도**: 무한 루프 방지 (아래 "재시도 한도" 섹션 참조)

## 팀 구성

| 역할 | 에이전트 타입 | 기본 모델 | 책임 |
|---|---|---|---|
| **team-lead** | main session | opus | 계획 수립, task 생성, 팀 조율, **phase 별 atomic commit (6.1)**, 최종 push/PR |
| **critic** | `oh-my-claudecode:critic` | opus | 계획 평가 (APPROVE/REVISE), 실제 코드 대조 |
| **executor** | `dooray-cli-executor` (custom, project-local at `.claude/agents/`) | sonnet | phase 순차 실행, 코드 수정 (커밋 제외), `bypassPermissions`. dooray-cli 도메인 self-check 임베드 (spinner 순서 / resolver 검증 / 타입 안전성 등 TOP 패턴) |
| **code-reviewer** | `oh-my-claudecode:code-reviewer` | sonnet | 코드 품질 검사 (PASS/FIX_NEEDED), AI slop/금지사항 탐지 |
| **docs-verifier** | `dooray-cli-docs-verifier` (custom, project-local at `.claude/agents/`) | sonnet | 코드↔docs 정합성 검증 (PASS/UPDATE_NEEDED/VIOLATION). dooray-cli 도메인 지식 (ADR-001~024 / docs 영향 표 / 캐시 규약 / 개인 식별 정보 사전 점검) 자동 적용 — 매번 검사 항목 길게 전달 불요 |

### 정식 팀원 스폰 규칙 (필수)

critic / executor / code-reviewer / docs-verifier는 반드시 **TeamCreate로 생성한 팀의 정식 멤버**로 스폰. 일회성 `Agent` 호출(team_name 없이) 금지.

**왜?**
- 일회성 Agent 호출은 팀 컨텍스트 밖에서 동작 — `SendMessage`로 반복 협업 불가
- 정식 팀원은 idle 상태로 대기하며 REVISE 재평가, executor 재실행, docs-verifier 재검증 등 반복 사이클이 자연스러움

**스폰 패턴:**
```
Agent({
  subagent_type: "oh-my-claudecode:critic",
  team_name: "plan{N}",
  name: "critic",
  model: "opus",
  run_in_background: true,
  prompt: "..."
})
```

executor 스폰 시 `dooray-cli-executor` custom agent 사용 (dooray-cli 도메인 self-check 자동 적용):

```
Agent({
  subagent_type: "dooray-cli-executor",
  team_name: "plan{N}",
  name: "executor",
  model: "sonnet",
  mode: "bypassPermissions",
  run_in_background: true,
  prompt: "..."
})
```

- `team_name` + `name`을 반드시 지정 (`name`은 `critic`/`executor`/`code-reviewer`/`docs-verifier`로 통일)
- `run_in_background: true`로 idle 대기 가능
- 이후 통신은 **모두 `SendMessage({to: "critic", message: "..."})`로만** 진행

**SendMessage 회신 강제 (필수 — 텍스트 출력 누락 사고 방지)**:

스폰된 sub-agent 가 평가 / 검사 결론을 자기 화면에 텍스트로만 출력하고 종료하는 사고가 관측됨.
결과적으로 main session 까지 라우팅 안 됨 — idle 알림만 도착하고 team-lead 는 평가 결과 미수신 상태에서 다음 단계 진행 불가.

**스폰 프롬프트 + 작업 지시 메시지 양쪽**에 다음 문구를 **반드시 포함**:

```
회신은 반드시 SendMessage tool 호출로 team-lead 에게 전송할 것.
자기 화면에 텍스트만 출력하고 종료하면 main session 까지 라우팅 안 됨.
판정/결론 + 핵심 사유 1-2 문단을 SendMessage 의 message 필드로 보낼 것.
```

team-lead 는 sub-agent 의 idle 알림만 **2회 이상 연속 수신** 하고 평가 결과 메시지가 없으면 통신 누락 의심 — 즉시 SendMessage 로 재요청 + "SendMessage 로 회신 부탁" 명시.

**스폰 직후 검증 (필수, 매 Agent 호출마다)**:

`name` 파라미터를 빠뜨려도 Agent 호출은 silent 하게 성공한다 — 응답 메시지가 정식 멤버 케이스와 거의 동일해 시각 구분 불가.
정식 멤버 등록 여부는 반드시 `team config.json` 으로 직접 확인한다.

응답 형식 차이로도 1차 식별 가능:
- ✅ 정식 멤버: `agent_id: critic@plan{N}` + `name: critic` + `team_name: plan{N}` 노출
- ❌ 일회성 백그라운드: `agentId: <16자 UUID>` 만 노출 (이름·팀 정보 없음)

후자가 보이면 **즉시 재스폰**. 전자라도 다음 grep 으로 한 번 더 확인:

```bash
# cwd: 무관 (절대경로)
python3 -c "import json; m=json.load(open('$HOME/.claude/teams/plan{N}/config.json'))['members']; print('\n'.join(f\"{x['name']}@{x['agentType']}\" for x in m))"
# 기대: team-lead 외에 critic / executor / code-reviewer / docs-verifier 가 표시되어야 함
# 보이지 않으면 일회성 agent — name 파라미터 추가하여 재스폰
```

team-lead 외 멤버가 0명이면 직전 Agent 호출에서 `name` 누락. `agentId: <UUID>` 백그라운드 agent 는 결과 와도 무시하고 **새로 정식 멤버로 스폰**.

**팀원 self-shutdown 패턴 대응 (관측)**:

`oh-my-claudecode:code-reviewer` / `dooray-cli-docs-verifier` 같은 검증 에이전트는 `run_in_background: true` + idle prompt 로 스폰해도 **idle 알림 직후 자체 shutdown 하는 경향** 이 있다.
critic 은 응답 후 idle 유지에 성공하지만 검증 에이전트는 일관되지 않음.

**우회**:

- 검사 대상 결과물이 준비된 시점에 **즉시 새로 spawn** (idle 대기 의존 금지)
- team-lead 가 code-reviewer / docs-verifier 의 종료 알림 수신 시 침묵 말고 **새로 스폰 + 즉시 검사 지시 메시지** 묶음으로 처리

**적용 시점**:

- code-reviewer: executor 완료 직후 (executor 와 동시 스폰 X — executor 완료 후 새로 스폰이 안전)
- docs-verifier: 8단계 검증 직전 새로 스폰

**팀원 프롬프트/메시지는 worktree 절대경로로 전달한다 (필수).**

sub-agent는 main 워킹 디렉터리에서 실행될 수 있다.
상대경로나 `tasks/{plan}/...` 형태로 지시하면 worktree 브랜치에 커밋된 최신 파일이 아니라 main 의 구버전 또는 미존재 파일을 읽어 오판 사고가 발생한다.

- 파일 참조는 반드시 `/Users/.../.claude/worktrees/{plan이름}/tasks/{plan}/phase-XX.md` 형식의 절대경로
- 팀원이 구버전을 본다고 의심되면 `grep`한 실제 파일 내용을 메시지에 붙여 넣고 절대경로 재확인 요청

## 모델 라우팅 (task 규모 기반)

task의 `index.json` + phase 파일을 읽고 규모를 판정하여 팀원 모델을 동적으로 조정.

### 규모 판정 기준

| 규모 | 조건 |
|---|---|
| **소** | `total_phases: 1`, 버그 수정/UI 미세 조정/단순 설정 변경 |
| **중** | `total_phases: 2~3`, 기존 기능 확장/리팩토링/스키마 단순 추가 |
| **대** | `total_phases: 4+` 또는 아키텍처/신규 도메인/DB 스키마 대규모 변경 |

### 규모별 모델 표

| 규모 | team-lead | critic | executor | code-reviewer | docs-verifier |
|---|:---:|:---:|:---:|:---:|:---:|
| **소** | sonnet | sonnet | sonnet | sonnet | sonnet |
| **중** | sonnet | opus | sonnet | sonnet | sonnet |
| **대** | opus | opus | sonnet | sonnet | opus |

executor/code-reviewer는 모든 규모에서 sonnet 고정. 사용자가 명시적으로 모델을 지정하면 라우팅보다 우선.

## 재시도 한도 (필수)

무한 루프 방지를 위해 각 게이트에 한도 적용. 한도 초과 시 자동으로 `PHASE_BLOCKED` 처리하여 사용자(team-lead)에게 결정 위임.

| 게이트 | 한도 | 초과 시 동작 |
|---|---|---|
| **critic REVISE** | 3회 | `PHASE_BLOCKED: critic REVISE 한도 초과 — team-lead 결정 필요` |
| **code-reviewer FIX_NEEDED** | 2회 | `PHASE_BLOCKED: code-reviewer FIX 한도 초과 — 수동 검토 필요` |
| **docs-verifier UPDATE/VIOLATION** | 2회 | `PHASE_BLOCKED: docs-verifier 한도 초과 — docs/코드 정합성 수동 점검` |

team-lead는 한도 카운터를 메모리(`.omc/state/`)에 기록하여 재실행 시에도 유지.

## 실행 절차

### 1. 팀 생성

```
TeamCreate → team name: plan{N}
```

critic + docs-verifier를 `run_in_background: true`로 스폰. 대기 상태로 준비.

### 2. 문서 파악 + 논의

team-lead가 `docs/` 하위 문서를 읽고 사용자와 논의.

### 3. docs 최신화 + 커밋

논의 결과를 task 생성 전에 docs에 반영. docs 변경사항 단독 커밋.

**반영 대상의 단일 소스 — phase 파일 docs 목록 금지 (PR #84 회고)**:
planning 결정 docs (adr.md / code-architecture.md / CLAUDE.md / data-schema.md / flow.md / prd.md) 를 반영할 때
phase 파일의 "변경 파일" 목록을 따라가지 말고 **planning SKILL 8단계 A항 "변경 유형별 docs 영향 표" 의 해당 행** 을 단일 소스로 본다.

- phase 파일이 일부 docs 를 빠뜨려도 영향 표 행에 표시된 모든 열을 반영해야 한다.
- 특히 `flow.md` (사용 예 / 자동 분기 시나리오) 는 phase 목록에서 자주 누락된다 — 영향 표 행을 직접 확인.
- 누락 시 docs-verifier 가 8단계에서 UPDATE_NEEDED 로 잡지만, 3단계에서 표를 보면 재작업이 사라진다.

### 4. task 파일 생성

`tasks/{NNN}-{task-name}/` 디렉터리에 `index.json` + `phase-{N}.md` 생성.
phase 프롬프트 규칙은 기존 `plan-and-build`와 동일:

- 원자적 단일 책임, 작업 항목 5개 이하
- 자기완결적 (이전 대화 없이 독립 실행 가능)
- 성공 기준에 모든 작업 검증 포함
- **마지막 phase는 "task 완료 처리" 단계를 포함**
  - `index.json`의 `status` 를 `"completed"` 로
  - 모든 phase `status` 도 `"completed"` 로 업데이트
  - executor 가 같은 phase 에서 수행하고 team-lead 가 최종 커밋에 포함

task 파일 생성 후 커밋.

### 5. critic 평가 (게이트)

team-lead → critic에게 계획 전송 (SendMessage).

critic 평가 관점:

1. Phase 순서/의존성이 올바른가?
2. 누락된 작업이 있는가?
3. 각 phase의 리스크는?
4. Phase 크기가 5개 이하인가?
5. 성공 기준이 충분한가?
6. **실제 코드와 일치하는가?** (파일 존재, 함수명, 줄 수 검증)
7. **`common-pitfalls.md`의 모든 패턴이 사전 해소되었는가?**

판정:
- **APPROVE** → 6단계로
- **REVISE** → 문제점 수정 후 재평가 (5단계 반복, 한도 3회)

### 6. executor 실행

critic APPROVE 후 executor를 `run_in_background: true`, `mode: "bypassPermissions"`로 스폰.
critic 승인 + docs-verifier 검증의 이중 안전망이 있으므로 executor는 권한 확인 없이 실행.

executor에게 전달할 정보:
- task 파일 경로 (worktree 절대경로)
- critic의 minor notes (있으면)
- 프로젝트 환경 가정 (레포별 변형 참조)

executor 규칙:
- phase-{N}.md를 순서대로 읽고 실행
- 각 phase 완료 후 성공 기준 검증
- **커밋은 하지 않음** — phase 별 commit 은 team-lead 가 수행 (아래 6.1 참조)
- **마지막 phase 에서 `tasks/{NNN}-{task-name}/index.json` 의 다음 필드를 `completed` 로 업데이트**
  - `status` / `current_phase` / 각 phase `status`
  - 별도 phase 아닌 마지막 phase 작업 내 스텝으로 처리
- phase 완료/실패 시 즉시 team-lead 에게 SendMessage 보고 → team-lead 가 그 phase 를 commit 한 후 다음 phase 진행 지시

### 6.1 phase 별 atomic commit (필수)

executor 가 phase-{N} 완료 보고하면 team-lead 가 즉시 그 phase 의 변경사항만 commit. 다음 phase 시작 전에 commit 이 끝나야 한다.

**commit 메시지 출처**: 각 phase 파일의 `## 커밋` 섹션에 명시된 `git commit -m "..."` 그대로 사용.
team-lead 가 자체 작성 금지 — phase 작성자가 의도한 단일 책임 메시지를 보존한다.

**commit 단위**:
- 각 phase 의 `변경 파일 (정확)` 섹션이 정의한 파일 목록만 staging
- 다른 phase scope 의 파일이 dirty 면 **commit 금지** + executor 에게 scope 위반 보고 요청

**중간 phase commit 패턴**:

```bash
# cwd: /Users/.../.claude/worktrees/{plan}
# branch: feat/{plan}
git add <phase-NN.md 의 변경 파일 정확히>
git commit -m "<phase-NN.md 의 ## 커밋 섹션 메시지>"
```

**마지막 phase commit**: phase 작업 + `index.json` completed 마킹이 같은 commit 에 포함됨 (task 파일 설계 시 마지막 phase 의 작업 항목으로 명시).

**FIX_NEEDED 발생 시**: code-reviewer 의 PASS/FIX_NEEDED 판정은 task 종료 시 1회 (8단계 참조).
- FIX_NEEDED 면 이미 commit 된 phase 들을 amend 하지 않고, 별도 `fix(<scope>): <지적 사항>` commit 추가
- amend 금지 — 이미 push 됐을 수 있고, history 연속성 보존이 디버깅 가치가 더 큼

**push 주기**: 매 phase commit 후 즉시 push 하지 않고 task 종료 시 일괄 push (9단계).
PR 생성 직전이라 commit 누적이 자연스러움.
단 worktree 가 길어지면 (1시간 이상) 중간 push 1회 허용.

### 7. 코드 품질 검사 (code-reviewer)

executor 완료 후 team-lead가 **code-reviewer 팀원에게 SendMessage로 검사 요청**. team-lead가 직접 수행하지 않는다 (건너뛰기 방지).

**code-reviewer 스폰 시점**: executor와 동시에 `run_in_background: true`로 스폰하되, executor 완료 후 SendMessage로 검사 시작 지시.

**사전 해소 점검 (필수)**: code-reviewer 검사 시작 전에 `.claude/skills/_shared/code-review-pitfalls.md` 의 모든 항목이 코드에 적용됐는지 확인.
적용 안 됐으면 그 자리에서 FIX_NEEDED 회신 (executor 재투입).
본 docs 가 회피 패턴의 단일 소스 — 13 항목과 별도로 grep 점검.
executor (`dooray-cli-executor`) 는 phase 시작 직전 TOP 패턴 self-check grep 을 자체 수행한다 — code-reviewer 점검과 이중 방어.

**code-reviewer에게 전달할 검사 항목:**

1. **금지사항**: `console.log`, `as any`, native UI dialogs (alert/confirm/prompt) — grep 검증
2. **타입 분리**: 인라인 타입이 있으면 `types/`로 분리 필요 여부
3. **unsafe `as` 캐스트**: `as Record<...>`, `as { ... }` → Zod 검증 또는 타입 가드 대체
4. **불필요한 주석 (AI slop)**: 함수명을 자국어로 번역한 것에 불과한 주석
5. **매직 넘버/문자열**: 상수 추출 필요한 하드코딩 값
6. **에러 처리**: `Promise.all` vs `Promise.allSettled`, try-catch 누락

**dooray-cli 특화 검사 항목 (CLI 변형 — 위 6 항목에 추가):**

7. **exitCode 누락**: catch 블록에서 `process.exit(N)` 또는 `throw new DoorayCliError(msg, N)` 누락 시 호출 스크립트가 실패 인지 못함 — grep으로 catch 패턴 검증
8. **HTTP 클라이언트 (`ky` 외 금지)**: `axios` / `node-fetch` / `got` import → 번들 크기 증가 + 일관성 위반. `grep -rn "from ['\"]axios\|from ['\"]node-fetch\|from ['\"]got" src/`
9. **stdout vs stderr 혼동**: 데이터는 stdout, 스피너/에러/진행 로그는 stderr. `console.error` vs `console.log` 오용 검증
10. **캐시 atomic write**: `~/.dooray/cache/` 쓰기는 temp 파일 + rename 패턴 (race 방지). `writeFile` 직접 호출 금지
11. **캐시 schema 검증**: 캐시 read 시 Zod 또는 타입 가드로 검증 — 이전 버전 스키마 오염 방지
12. **`--subject` / `--body` non-interactive 옵션**: `post edit` / `comment edit` / `post create` 등에서 누락 — AI 에이전트·스크립트 호출 차단 방지
13. **member resolver 모호성**: 이름 부분일치가 모호하면 에러 + 후보 목록 출력 (silent matching 금지)

**code-reviewer가 검사할 범위**: executor가 변경한 파일만 (`git diff --name-only` 기준).

판정 (SendMessage로 team-lead에게 회신):
- **PASS** → 8단계로
- **FIX_NEEDED** → team-lead가 executor에게 수정 목록 전달 → executor 수정 → code-reviewer 재검사 (한도 2회)

**FIX_NEEDED 처리 시 필수 루프 — 자기-면제 금지 (CRITICAL)**:

code-reviewer 가 FIX 회신에 *"재검사 불필요"* / *"단순 변경이라 검증 생략 가능"* 같은 자기-면제 문구를 포함하더라도 **그대로 수용 금지**.
자기 자신의 검토를 자기가 면제하는 것은 OMC `<execution_protocols>` 의 "Never self-approve in the same active context" 위반.

수정 주체와 무관하게 **모든 FIX 후 재검사 SendMessage 강제**:

| 수정 시나리오 | 처리 |
|---|---|
| executor 가 수정 (다중 파일·로직 변경) | executor 수정 commit → code-reviewer 재검사 SendMessage |
| team-lead 직접 수정 (1줄 이동·rename·typo 등 trivial fix) | team-lead 수정 commit → **여전히** code-reviewer 재검사 SendMessage |
| code-reviewer 본인 *"재검사 불필요"* 명시 | 무시. 재검사 SendMessage. |

빌드/테스트 통과는 자체 검증을 대신하지 못한다 — 정적 검사·관습·매직넘버 같은 항목은 빌드를 통과해도 잡혀야 한다.
재검사 한도 2회 카운터는 동일하게 적용 — 한도 초과 시 `PHASE_BLOCKED`.

**Why**: trivial 한 1줄 수정도 회귀 가능.
더 중요한 건 일관성 — "code-reviewer 가 면제했으니 OK" 가 한 번 통과되면 다음 plan 부터는 더 큰 수정도 면제 요청이 들어올 수 있다.
그때도 자기-승인 회피 원칙이 깨진다.

### 8. docs-verifier 검증 (문서 부패 포함)

executor 완료 후 team-lead → docs-verifier에게 검증 요청.

검증 관점:
1. ADR 결정사항 위반 여부
2. 레이어 규칙 준수
3. 코딩 규칙 (strict, any 금지, 절대경로, 1타입1파일)
4. docs 업데이트 필요 여부
5. 의사결정 의도 보존 여부
6. **문서 부패 검증 (필수)**: 코드에서 제거/변경된 기능이 docs에 아직 남아 있는지

**dooray-cli 특화 docs-verifier 검사 항목 (CLI 변형 — 위 6 항목에 추가):**

7. **planning docs 영향 표 100% 적용 검증** — `.claude/skills/planning/SKILL.md` 8단계 A항 "변경 유형별 docs 영향 표" 의 해당 행 식별 + 표시된 모든 docs 갱신 확인
   - 단일 항목 (✓ 표시) 이라도 누락이면 UPDATE_NEEDED
   - 이 표가 검증 항목의 단일 소스 — docs-verifier 는 **별도 체크리스트 보유 금지**, 표 거울만 본다

8. **역참조 규칙 준수**: 새 ADR 추가 시 `docs/code-architecture.md` 또는 `CLAUDE.md` ADR 참조 표 둘 중 한 곳에 ADR-NNN 한 줄 추가 됐는가?
   - 출처: planning SKILL C항 "역참조 규칙"

9. **갱신 시점 분리 위반 없는가**
   - planning 결정 docs (`adr.md` / `code-architecture.md` / `CLAUDE.md` / `data-schema.md` / `flow.md` / `prd.md`) 를 phase 안에서 변경하면 VIOLATION
   - 사용자 가이드 docs (`README.md` / `skills/dooray-cli/SKILL.md`) 는 phase 마지막에서만 변경 OK

10. **`skills/dooray-cli/SKILL.md` (공개 스킬) dogfooding** — CLI 는 공개 스킬도 검증 대상
    - 새/삭제/변경된 명령·옵션이 공개 스킬에 반영되지 않으면 외부 사용자가 오작동 경로를 따라감
    - docs 영향 표 행에 표시되어 있을 때 적용

판정:
- **PASS** → 9단계로
- **UPDATE_NEEDED** → team-lead가 docs 업데이트 후 재검증 (한도 2회)
- **VIOLATION** → team-lead가 코드 수정 지시 (executor 재투입, 한도 2회)

**UPDATE_NEEDED / VIOLATION 처리 시 필수 루프 — 자기-면제 금지**:

code-reviewer 와 동일 원칙 (위 7단계 "자기-면제 금지" 박스 참조).
docs-verifier 가 *"내용 확인 수준으로 충분"* / *"재검증 없이 PR 진행 가능"* 같은 자기-면제 문구를 회신에 포함하더라도 **그대로 수용 금지**.

| 수정 시나리오 | 처리 |
|---|---|
| docs 갱신 (UPDATE_NEEDED) — team-lead 직접 수정 / executor 재투입 무관 | docs 수정 commit → docs-verifier 재검증 SendMessage 강제 |
| 코드 수정 (VIOLATION) — executor 재투입 | executor 수정 commit → docs-verifier 재검증 SendMessage 강제 |
| docs-verifier 본인 *"재검증 불요"* 명시 | 무시. 재검증 SendMessage. |

재검증 한도 2회 카운터 동일 적용. 한도 초과 시 `PHASE_BLOCKED: docs-verifier 한도 초과 — docs/코드 정합성 수동 점검`.

**Why**: 7단계와 동일. 일관성 측면.
UPDATE_NEEDED 가 3곳 같이 잡혔는데 그중 1곳을 잘못 갱신했어도 자기-면제로 묻히면 다음 plan 부터 PASS 신뢰성이 떨어진다.

### 9. 완료 + PR 생성

1. team-lead 가 누적 commit 검토 — `git log --oneline feat/{plan}..origin/main` 의 역순으로 phase 별 commit 이 의도대로 들어갔는지 확인
   - 마지막 phase commit 에 `index.json` completed 가 포함됐는지 grep 검증
2. 통합 검증 명령 (`{{CI_CMD}}`) 최종 확인 — 모든 phase 누적 후에도 build/test 통과 확인
3. (FIX_NEEDED 처리 commit 들이 있었다면 그대로 push, amend 금지)
4. `git push origin feat/{plan}` — n 개 commit 일괄 push
5. **PR 생성** — `gh pr create` (main 대상). PR description 에는 개요·결정·검증만 담는다.
   - **commit 목록은 나열하지 않는다** — GitHub PR 의 Commits 탭에서 바로 확인 가능 (본문 중복 + 해시 변경 시 유지보수 부담)
6. **index.json 완료 상태는 PR 브랜치에만 존재** — 메인 워킹 디렉토리에서는 **건드리지 않는다**:
   - 마지막 phase 커밋이 이미 `index.json` 의 `status="completed"` + 모든 phase `status="completed"` 를 포함해야 한다
   - task 파일 설계 시 마지막 phase 에 해당 업데이트 명시 (4단계 참조)
   - main에서 별도 커밋 **금지** 이유:
     - 이중 진실원 회피
     - main에 진행 중인 다른 작업(다른 plan의 미푸시 커밋, unstaged 변경)과 의도치 않게 섞여 push될 위험
     - PR 머지로 자동 반영되므로 중복 커밋
   - "재실행 사고 방지"는 main 커밋이 아니라 **실행 전 3중 사전 검증**(status + 원격 feat 브랜치 + 오픈 PR)으로 막는다
7. **review 회고 (조건부 필수 — 학습 루프)** — PR 생성 직후, 팀 shutdown 직전
   - **트리거 조건**: 이번 plan 에서 critic 의 **REVISE** 또는 code-reviewer 의 **FIX_NEEDED** 또는 docs-verifier 의 **UPDATE_NEEDED / VIOLATION** 이 1회 이상 발생한 경우
   - 1-shot APPROVE + PASS + PASS 로 진행된 plan 은 회고 단계 skip

   회고가 트리거된 경우 team-lead 가 자문 후 필요 시 회고 commit (main 디렉터리에서):
   - **critic** REVISE 지적 중 *반복 가능성* 있는 패턴 → `.claude/skills/_shared/common-pitfalls.md` 해당 섹션에 항목 추가
   - **code-reviewer** FIX_NEEDED 지적 중 *반복 가능성* 있는 패턴 → `.claude/skills/_shared/code-review-pitfalls.md` 해당 카테고리에 항목 추가 (또는 새 카테고리 신설)
   - **docs-verifier** UPDATE_NEEDED / VIOLATION 지적 중 *반복 가능성* 있는 항목 → planning SKILL 8단계 A항 docs 영향 표에 행 추가 또는 기존 행 보강
     - 별도 회고 docs 신설 금지 — 거울 구조 유지
   - **반복 가능성 판정 기준**: 다른 plan 에서 같은 카테고리 (예: 헬퍼 추출 / 새 resolver / spinner UX) 작업 시 또 발생할 수 있는가?
     - 1회성 typo / 명령 이름 오타 등은 제외
   - 회고 commit 메시지 규약: `docs(skill): accumulate review learnings from PR #<N>`. PR 번호와 사고 plan 번호를 본문에 명시
   - 트리거됐지만 추가할 패턴이 0개여도 **자문 자체는 수행**. "이번엔 신규 항목 없음" 결정 보고 후 다음 단계로
8. 팀 shutdown (SendMessage `shutdown_request`)

## worktree 기반 격리 실행 (필수)

작업 간 충돌을 방지하기 위해 반드시 **git worktree** 사용. worktree는 프로젝트 내부 `.claude/worktrees/` 하위에 생성 (프로젝트 부모 디렉터리 오염 방지).

**전제**: `.gitignore`에 `.claude/worktrees/`가 등록되어 있어야 한다.

### 오타 worktree 잔재 자동 정리 (pre-flight + post-flight 모두 필수)

worktree 생성 직전과 정리 직후 두 시점에 모두 아래 명령으로 `.claude` 외 `.cla*` 디렉터리를 탐지.
명백한 오타 변형 (`.claire-worktrees`, `.calude-*`, `.claud-*`) 은 사용자 동의 없이 즉시 `rm -rf` + 1줄 보고.
단 `.claude-` 로 시작하는 (의도된 다른 디렉터리) 가 있다면 사용자에게 먼저 확인.

```bash
# cwd: <repo root>
STRAY=$(find . -maxdepth 1 -type d -name '.cla*' ! -name '.claude' 2>/dev/null)
if [ -n "$STRAY" ]; then
  echo "⚠️ 오타 worktree 디렉터리 잔재 발견 — 자동 제거:"
  echo "$STRAY"
  echo "$STRAY" | xargs -I{} rm -rf {}
fi
```

**Why**: 오타 디렉터리 (예: `.claire-worktrees/plan011-...`) 가 빌드 / 테스트 / 타입 검사 도구 (eslint / tsc / vitest) 의 file scan 에 잡혀 사고 유발. 다음 plan 시작 시점에 자동 정리되도록 점검화.

### 필수 선행 체크 — 로컬 main이 origin에 푸시되었는가?

worktree 는 `origin/main` 에서 분기되므로 **로컬 main 에만 있고 푸시 안 된 커밋은 worktree 에 반영되지 않는다**.
critic 이 "task 파일 없음" 으로 오판하거나 executor 가 구버전 환경에서 실행하는 사고 방지.

```bash
# cwd: <repo root>
git fetch origin
git log --oneline origin/main..main   # 결과가 있으면 로컬 main이 앞서 있음 → 푸시 필요
```

결과가 비어 있지 않으면 `git push origin main` 먼저 수행.

```bash
# cwd: <repo root>
git fetch origin
mkdir -p .claude/worktrees
git worktree add .claude/worktrees/{plan이름} -b feat/{plan이름} origin/main
cd .claude/worktrees/{plan이름}
pnpm install   # 레포별 변형 (의존성 설치 + 코드 생성 등)
```

**worktree 정리**: 메인 워킹 디렉토리로 돌아가서 `git worktree remove .claude/worktrees/{plan이름}`

이렇게 하면 여러 plan을 **동시 병렬 실행**해도 서로 간섭하지 않는다.

## 프로젝트 환경 가정 (레포별 변형)

이 섹션은 레포별 `skills-variants/{repo}/build-with-teams-env.md`에서 채운다. 포함 항목:

- 패키지 매니저 + 통합 검증 명령
- 빌드/테스트/린트/포맷 명령
- 마이그레이션 도구 + 비대화형 환경 함정
- worktree 직후 필수 setup (의존성 설치, 코드 생성 등)
- 코드 규칙 (`CLAUDE.md` 권위 명시)

executor·code-reviewer에게 프롬프트 전달 시 이 섹션을 참조 또는 요약 인용.

## 실패 복구

executor가 phase 실패 보고 시:
1. team-lead가 실패 원인 분석
2. phase 수정 필요 시 → critic 재평가 (5단계부터)
3. 단순 에러 수정 시 → executor에게 재실행 지시

## 실행 흐름 요약

```
[사전 검증 — main index.json status + 원격 feat 브랜치 + 오픈 PR (3중 체크)]
    → [worktree 생성 (origin/main 기반)]
    → [docs 최신화 + 커밋]
    → [task 파일 생성 + 커밋]  ← 마지막 phase에 index.json completed 업데이트 스텝 포함
    → [critic 평가] ←─ REVISE면 계획 수정 후 재평가 (한도 3회)
    → [executor 실행 phase-1] → [team-lead phase-1 commit] → ... → [phase-N (index.json completed 포함)] → [team-lead phase-N commit]
    → [코드 품질 검사 (task 종료 후 1회)] ←─ FIX_NEEDED면 executor 재투입 (한도 2회) → 추가 fix commit (amend 금지)
    → [docs-verifier 검증 (문서 부패 포함)] ←─ VIOLATION/UPDATE_NEEDED면 재투입 (한도 2회) → 추가 fix commit
    → [team-lead 일괄 push]  ← PR 브랜치에 phase 별 atomic commit + 필요 시 fix commit 누적
    → [PR 생성]  ← main에 별도 커밋 금지
    → [review 회고]  ← critic/code-reviewer/docs-verifier 반복 패턴 → common-pitfalls / code-review-pitfalls / planning docs 영향 표 갱신
    → [worktree 정리 + 팀 shutdown]
```

## vs plan-and-build

| | plan-and-build | build-with-teams |
|---|---|---|
| 실행 방식 | `run-phases.py` 백그라운드 | Claude Agent Teams 가시적 협업 |
| 평가 단계 | 없음 | critic APPROVE 게이트 |
| docs 검증 | 없음 | docs-verifier 자동 검증 |
| 진행 상황 | 로그 파일 확인 | 에이전트 메시지로 실시간 확인 |
| 실패 복구 | `--from-phase` 재시작 | team-lead 판단 → executor 재지시 |
| 적합 규모 | 소·중 | 중·대 |

## dooray-cli 환경 가정 (프로젝트 변형)

executor / code-reviewer / docs-verifier 프롬프트에 아래 컨텍스트를 함께 전달.

- **패키지 매니저**: `pnpm`
- **빌드 명령**: `pnpm run build` (tsup CJS 단일 번들, shebang 포함 — `dist/index.js`)
- **테스트 명령**: `pnpm test` (없으면 `node dist/index.js {command} --help` smoke test로 대체)
- **통합 검증 (`{{CI_CMD}}`)**: `pnpm run build && pnpm test` (테스트 없으면 `pnpm run build` 단독)
- **마이그레이션 도구**: 없음 — `~/.dooray/cache/` 파일 기반 캐시. schema 변경은 코드(`src/cache/`)로 처리
- **worktree 직후 setup**: `pnpm install`
- **코드 규칙 권위**: 프로젝트 루트 `CLAUDE.md` (ky 강제 / stdout vs stderr / `DoorayCliError` / 캐시 디렉토리 규약)
- **스킬 폴더 이원화**: `skills/` = 공개 사용자 가이드, `.claude/skills/` = 내부 개발 스킬
  - 인사이트 이식·docs-verifier 모두 `.claude/skills/` 대상
  - 공개 스킬 정합성 검사 (dooray-cli docs-verifier 항목 10) 만 예외적으로 `skills/dooray-cli/SKILL.md` 참조
