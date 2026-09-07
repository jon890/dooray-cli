# Phase 02. docs-verifier 전용 agent 를 없애고 `.claude/agents/` 를 정리한다

**Execution profile**: standard

## 목표

`dooray-cli-docs-verifier` 를 없애고 `.claude/agents/` 디렉터리를 정리한다.
`build-with-teams` 는 코어 `role-docs-verifier.md` 를 쓰게 해 잃은 축을 되살린다.
`docs-check` 는 6축 판정 기준을 문서로 옮겨 쓰고, 오버레이가 그 경로를 넘긴다.

옮기면서 그 본문에서 실측으로 확인된 결함 넷을 고친다.

**범위 외**: executor 는 phase 01 이다. 코어 스킬 파일을 고치지 않는다.
6축 모델 자체를 바꾸지 않는다. 그것은 `docs-check` 의 계약이고 판정 기준만 자리를 옮긴다.

## 컨텍스트

**근거 문서**: `docs/adr/050-agent-overlay-boundary.md`.

한 agent 가 계약이 다른 두 호출자를 섬기고 있다.
그 agent 의 `description` 이 「build-with-teams 의 docs-verifier 와 docs-check 양쪽이 이 agent 를 호출한다」고 밝힌다.
`.claude/docs-check-overlay.md` 가 그것을 「반드시」 위임 대상으로 못 박고,
`.claude/build-with-teams-overlay.md` 의 「에이전트 이름」 절도 같은 agent 를 지정한다.

그래서 6축이 3축을 덮었다. 두 계약의 차이는 이렇다.

| 축 | 코어 `role-docs-verifier.md` (42줄) | 이 agent (174줄) |
| --- | --- | --- |
| 검사 축 | 셋. 결정 위반, docs 에 남은 옛 내용, docs 에 없는 새 결정 | 여섯. 부패·과대화·추론성·중복·자명성·가독성 |
| 근거 형식 | 문서 줄과 코드 줄을 짝지어 요구 | 한쪽 줄만 |
| `VIOLATION` 을 만드는 축 | 「accepted ADR 과 이번 변경을 대조한다」가 첫 축 | 없다. 개인 식별 정보 노출만 즉시 판정 |
| 회피 규칙 | 「`docs/` 를 코드에 맞춰 고치는 것으로 처리하지 않는다」 | 없다 |

이 agent 를 남길 이유가 없다.
`disallowedTools: Write, Edit` 가 유일한 후보였는데 `Bash` 를 막지 않아 리다이렉트로 파일을 쓸 수 있다.
그 제한은 agent 를 만든 첫 커밋에 함께 들어왔고 이후 한 번도 조정되지 않았다.
실제 경계는 본문의 「docs 와 코드를 직접 수정하지 않는다」 였다. 근거는 ADR-050 이 담는다.

**실측으로 확인된 결함 넷이 있다.** 줄 번호는 이 plan 을 쓴 시점의 값이고 실제 위치는 grep 으로 다시 잡는다.

| 자리 | 결함 | 실측 |
| --- | --- | --- |
| A축의 `diff` 블록 (57행 근처) | 검출 명령이 동작하지 않는다 | 실행하면 `docs/code-architecture.md` 의 트리 전체 51개와 `src/resolvers/` 19개를 비교해 무관한 차이 40여 줄을 낸다. `postRef.ts` 는 대문자 때문에 패턴에 걸리지 않는다 |
| B축의 `wc -l` (82행) | 줄 수를 첫 검출 수단으로 쓴다 | 코어 `docs-check/SKILL.md:102` 가 「줄 수만으로 과대화를 판정하지 않는다」고 정한다 |
| 89행의 참조 | 가리키는 대상이 없다 | `grep -rn "ADR 작성" .claude/` 의 결과에 「ADR 작성 기준」 절이 없다. 코드 블록 10줄 임계값도 그 파일에 없다 |
| 137행의 훅 서술 | 근거가 사실과 다르다 | `~/.claude/settings.json` 의 PostToolUse 훅 matcher 가 `Edit|Write|MultiEdit` 다. Bash heredoc 이나 `sed` 로 만든 `.md` 는 훅을 거치지 않는다 |

F축 정의도 코어와 갈렸다.
코어 `~/.claude/skills/docs-check/references/six-axis.md:126` 의 F축은 「문서 구조 무결성」이고
문서가 실제로 열리고 구조가 깨지지 않는지를 본다.
이 agent 의 F축은 「가독성」이고 한 줄 문장 수와 괄호 중첩과 200자 초과를 본다.
그래서 agent 경로로 돌면 링크와 ADR Index 무결성 검사가 사라진다.

## 의도 메모

- 6축 모델을 바꾸지 않는다. 그것은 `docs-check` 의 계약이고 이 plan 의 대상이 아니다.
  `build-with-teams` 가 그 모델을 쓰지 않게 하는 것이 목적이다.
- agent 를 없앤다. 편집 도구 제한이 `Bash` 를 막지 못해 보장이 되지 않는다.
  검토가 파일을 고쳤는지는 `git status` 로 확인한다.
- F축의 두 정의 중 어느 것을 쓸지 정한다. 옮긴 문서는 `docs-check` 전용이 되므로
  코어 `six-axis.md` 의 「문서 구조 무결성」을 따르고, 지금의 가독성 항목은 검사기에 넘긴다.
- `check-readability.py` 가 괄호 중첩과 엠대시와 범위 물결표를 이미 소유한다.
  agent 가 그 일부를 다시 적으면 갈라진다. 스크립트를 부르게 한다.

## 작업 항목

### 1. `.claude/build-with-teams-overlay.md` 의 docs-verifier 지정을 없앤다

「에이전트 이름」 절에서 docs-verifier 줄을 지운다.
코어 `references/role-docs-verifier.md` 가 그 역할의 계약 소유자라고 적는다.

오버레이가 추가할 문서 경로를 함께 적는다.
코어 `SKILL.md:141` 이 스폰 프롬프트에 「오버레이가 추가한 문서 경로」를 담으므로 그 자리를 채운다.
이 저장소에서 그 경로는 `docs/prd.md`, `docs/flow.md`, `docs/code-architecture.md`,
`docs/data-schema.md`, `docs/adr/` 다.

`docs-check` 는 계속 이 agent 를 쓴다는 것도 한 줄 적어, 두 경로가 다른 계약을 쓰는 것이 의도임을 밝힌다.

### 2. `.claude/docs-audit-axes.md` 로 6축 판정 기준을 옮긴다

`dooray-cli-docs-verifier` 본문의 6축 판정 기준과 자동 grep 명령을 이 문서로 옮긴다.
`docs-check` 오버레이가 그 경로를 넘기고, `docs-check` 만 그것을 읽는다.

옮길 때 아래를 함께 고친다. 항목 3 부터 6 이 각 결함을 다룬다.

옮기지 않는 것이 둘이다.

- `<Role>` 의 「변경 코드와 docs 의 일치를 검증한다 (build-with-teams 8단계)」 줄.
  `build-with-teams` 가 이 문서를 쓰지 않으므로 필요 없다.
  그 단계 번호는 코어의 실제 단계와도 맞지 않는다. 코어 단계는 1부터 6까지다.
- `disallowedTools` 와 `model` 을 담은 frontmatter. 문서에는 그 필드가 뜻을 갖지 않는다.

문서 첫머리에 소유자를 한 줄 밝힌다. `docs-check` 의 6축 판정 기준을 이 문서가 소유하고
`build-with-teams` 는 코어 `role-docs-verifier.md` 를 쓴다는 것이다.

### 3. A축의 검출 명령을 고친다

`resolvers` 트리만 뽑도록 범위를 좁히고 문자 클래스에 대문자를 넣는다.

지금 패턴이 `^    [a-z][a-z-]*\.ts` 라서 문서 트리 전체를 잡고 `postRef.ts` 를 놓친다.

- `docs/code-architecture.md` 에서 `resolvers/` 절의 범위만 뽑는다. `sed` 로 그 절의 시작과 끝을 잘라 쓴다.
- 문자 클래스를 `[A-Za-z][A-Za-z0-9-]*` 로 바꾼다.
- 고친 뒤 실행해 `diff` 가 빈 결과를 내는지 확인한다. 지금은 40여 줄을 낸다.

걸리는 표본과 걸리지 않는 표본으로 확인하라고 본문에 적는다.
`postRef.ts` 가 걸리는지가 그 판정이다.

### 4. B축에서 줄 수를 보조 신호로 내린다

`wc -l` 을 첫 검출 수단으로 쓰지 않는다. 코어가 그것을 금한다.
아래 패턴 목록을 판정 기준으로 올리고, 줄 수는 후보를 좁히는 신호로만 쓴다고 적는다.

### 5. 89행의 없는 참조를 고친다

「임계값의 단일 소스는 planning 오버레이의 ADR 작성 기준이다」를 지운다.
그 절이 존재하지 않는다. 코드 블록 10줄 임계값을 이 agent 본문이 소유한다고 적는다.

### 6. F축을 코어 정의로 맞춘다

절 제목을 「문서 구조 무결성」으로 바꾸고, 코어 `six-axis.md` 의 검출 대상을 따른다.
링크가 실제로 열리는지, 표와 코드 펜스가 닫혔는지, 헤딩 층이 깨지지 않았는지, ADR Index 가 본문과 맞는지다.

지금의 가독성 항목은 검사기에 넘긴다.

- 137행의 훅 서술을 고친다. 훅은 `Edit`·`Write`·`MultiEdit` 가 파일을 바꿨을 때만 돈다.
  Bash 로 만든 `.md` 는 거치지 않는다. 그러므로 「훅이 자동 검사하므로 형식만 본다」는 성립하지 않는다.
- 그 자리에 검사기를 파일 경로로 직접 돌리라고 적는다.
  `bash ~/.claude/scripts/korean-style-check.sh <파일>` 과
  `python3 ~/.claude/scripts/check-readability.py <파일>` 이다.
- 괄호 중첩과 200자 초과 같은 항목을 목록에서 지운다. `check-readability.py` 가 그것을 소유한다.
  스크립트가 잡지 못하는 항목만 남긴다.

### 7. `.claude/agents/` 를 제거하고 `docs-check` 오버레이를 고친다

`git rm .claude/agents/dooray-cli-docs-verifier.md` 로 지운다.
phase 01 이 executor 를 이미 지웠으므로 이 디렉터리가 비고, 빈 디렉터리는 git 이 추적하지 않는다.

`.claude/docs-check-overlay.md` 의 「검증 위임」 절을 고친다.

- agent 위임을 없애고 `.claude/docs-audit-axes.md` 를 읽으라고 적는다.
- `Agent({ subagent_type: "dooray-cli-docs-verifier", ... })` 예시를 지운다.
  하위 에이전트를 띄울 때는 그 문서 경로를 프롬프트에 담는다고 적는다.
- 「agent 는 read-only (`disallowedTools: Write, Edit`)」 문장을 지운다.
  그 보장이 성립하지 않았고 이제 그 필드도 없다.
  대신 검토가 파일을 고치지 않는 것은 지시로 지키고 `git status` 로 확인한다고 적는다.
- 「Fallback: agent 를 못 쓰는 환경에서는」 문장을 고친다. 이제 agent 가 없으므로 fallback 이 기본 경로다.

`tasks/**` 가 F축 검사 대상에서 빠져 있는지도 확인한다. 앞선 변경이 이미 그것을 했다.

```bash
# cwd: <repo root>
grep -c "tasks/\*\*" .claude/docs-audit-axes.md
```

0 이어야 한다. 0 이 아니면 옮기면서 뺀다.

### 8. 문서 검사를 이 phase 의 테스트로 돌린다

이 phase 는 코드를 바꾸지 않으므로 검사가 완료 판정이다.

```bash
# cwd: <repo root>
~/.claude/skills/korean-check/scripts/check.sh .claude/docs-audit-axes.md .claude/build-with-teams-overlay.md .claude/docs-check-overlay.md
node scripts/check-pii.mjs
```

둘 다 종료 코드 0 이어야 한다.
`korean-check` 의 검사기는 손대지 않은 줄의 기존 엠대시로 1 이 나올 수 있다.
그 경우 이 phase 가 추가한 줄에 위반이 없는지 아래로 확인하고 넘어간다.

```bash
# cwd: <repo root>
git diff --unified=0 -- .claude/ | grep '^+' | grep -v '^+++' | grep -c '—'   # = 0
```

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm run build
pnpm test
```

셋 다 통과해야 한다. 이 plan 은 `src/` 를 고치지 않는다.

변경이 실제로 들어갔는지 확인한다.

```bash
# cwd: <repo root>
ls .claude/agents 2>/dev/null | wc -l                                    # = 0
grep -rc "dooray-cli-docs-verifier" .claude/ | grep -c ":[1-9]"          # = 0
grep -c "role-docs-verifier" .claude/build-with-teams-overlay.md         # >= 1
grep -c "docs-audit-axes" .claude/docs-check-overlay.md                  # >= 1
grep -c "disallowedTools" .claude/docs-audit-axes.md                     # = 0
grep -c "훅이 저장 시점에 자동 검사" .claude/docs-audit-axes.md            # = 0
grep -c "planning 오버레이의 ADR 작성 기준" .claude/docs-audit-axes.md     # = 0
grep -c "문서 구조 무결성" .claude/docs-audit-axes.md                     # = 1
```

여덟 기대값이 모두 맞아야 한다.
첫째가 0 인 것은 `.claude/agents/` 가 사라졌다는 근거다.
둘째가 0 인 것은 그 agent 를 가리키는 참조가 `.claude/` 어디에도 남지 않았다는 근거다.
다섯째가 0 인 것은 문서로 옮기면서 뜻을 갖지 않는 frontmatter 필드를 빼왔다는 근거다.

**A축 명령이 실제로 도는지 확인한다.** 이것이 이 phase 의 핵심이다.

```bash
# cwd: <repo root>
grep -c "A-Za-z" .claude/docs-audit-axes.md   # >= 1
```

그리고 옮긴 문서의 A축 블록을 그대로 실행해 `diff` 가 빈 결과를 내는지 본다.
지금은 40여 줄을 낸다. 고친 뒤 0 줄이어야 한다.
실행한 명령과 결과 줄 수를 보고에 적는다.

## plan 완료 마킹

이 plan 의 마지막 phase 다. 위 검증을 모두 통과시킨 뒤 `index.json` 을 고치고,
**이 phase 의 단일 commit 에 그 변경을 함께 넣는다.** 별도 commit 이나 amend 로 미루지 않는다.

```bash
# cwd: <repo root>
PLAN=tasks/plan064-chore-agent-contract-boundary
sed -i '' 's/"status": "pending"/"status": "completed"/g' $PLAN/index.json
sed -i '' 's/"current_phase": 1/"current_phase": 2/' $PLAN/index.json
grep -c '"status": "completed"' $PLAN/index.json     # = 3 (최상위 1 + phase 2)
grep -c '"current_phase": 2' $PLAN/index.json        # = 1
```

두 기대값이 맞아야 한다. `phases` 배열 항목에 `status` 키가 없으면 먼저 각 항목에 넣는다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `.claude/agents/dooray-cli-docs-verifier.md` | 삭제 |
| `.claude/docs-audit-axes.md` | 신규 |
| `.claude/build-with-teams-overlay.md` | 수정 |
| `.claude/docs-check-overlay.md` | 수정 |
| `tasks/plan064-chore-agent-contract-boundary/index.json` | 수정 |
