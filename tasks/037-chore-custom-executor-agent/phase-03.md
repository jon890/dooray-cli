# Phase 03 — build-with-teams/SKILL.md 의 executor spawn 교체 + 완료 마킹

## 목적

`.claude/skills/build-with-teams/SKILL.md` 의 executor spawn 부분을 새 custom agent (`dooray-cli-executor`) 사용으로 교체.
사용자 facing 영향 0 — README / 공개 SKILL.md 갱신 불요. 내부 개발 워크플로우 인프라 변경만.
완료 후 `index.json` 의 status 를 completed 로 마킹 — main 에서 별도 commit 하지 않고 본 phase commit 에 포함.

## 회피 대상 (사전 점검 1줄 인용)

- skill 본문 수정은 **executor 행 + spawn 코드 예시 2곳만** — 다른 섹션 (모델 라우팅 / 재시도 한도 / 검증 단계) 수정 금지
- 거울 구조 — `executor` 행이 변경됐는데 다른 섹션이 일관성 깨지는지 grep 점검 (예: "OMC executor" / "oh-my-claudecode:executor" 잔재)
- `index.json` completed 마킹 — `status`, `current_phase`, 각 phase `status` 3 필드 모두 갱신

## 변경 파일 (정확)

- `.claude/skills/build-with-teams/SKILL.md` — executor 행 + spawn 코드 예시 (2곳 또는 그 이상 — grep 결과 따라)
- `tasks/037-chore-custom-executor-agent/index.json` — completed 마킹

## 작업 항목

1. **build-with-teams/SKILL.md 의 "팀 구성" 표 executor 행 갱신**
   - 위치: `grep -n "executor.*oh-my-claudecode:executor" .claude/skills/build-with-teams/SKILL.md` 로 정확 라인 확인
   - 변경 전: `| **executor** | \`oh-my-claudecode:executor\` | sonnet | phase 순차 실행, 코드 수정 (커밋 제외), \`bypassPermissions\` |`
   - 변경 후: `| **executor** | \`dooray-cli-executor\` (custom, project-local at \`.claude/agents/\`) | sonnet | phase 순차 실행, 코드 수정 (커밋 제외), \`bypassPermissions\`. dooray-cli 도메인 self-check 임베드 (spinner 순서 / resolver 검증 / 타입 안전성 등 TOP 패턴) |`

2. **executor spawn 코드 예시 블록 신규 추가** (critic R1 — 실측 결과 기존 SKILL.md 에 executor spawn 예시 블록이 없음)
   - 위치: critic spawn 예시 코드 블록 (line 95~105 근처, ` ```\n` 로 끝나는 블록) 직후, 같은 패턴으로 executor spawn 예시 코드 블록 1개 신규 추가
   - 내용 (참고 — executor 답습 가능한 패턴):
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
   - 목적: 새 agent 이름 (`dooray-cli-executor`) 이 코드 예시로 SKILL.md 에 기록되어 추후 답습성 확보
   - 추가 grep — 기존 SKILL.md 안에 `oh-my-claudecode:executor` 가 line 83 표 행 외 더 있는지 `grep -n "oh-my-claudecode:executor" .claude/skills/build-with-teams/SKILL.md` 로 확인. 추가 매칭 있으면 전부 `dooray-cli-executor` 로 교체 (false negative 회피)

3. **사전 해소 점검 섹션 (7단계) 의 executor 관련 문장 갱신 (필요 시)**
   - "code-reviewer 검사 시작 전에 `code-review-pitfalls.md` 의 모든 항목이 코드에 적용됐는지 확인" 문장에 executor 가 사전 self-check 한다는 1줄 추가 가능 (선택)
   - executor 책임 분리가 깨지지 않는 범위에서만 — code-reviewer 의 검사 책임은 그대로 유지

4. **잔재 grep 검증 — 다른 곳에 OMC executor 언급이 남지 않았는지**
   - `grep -n "oh-my-claudecode:executor" .claude/skills/build-with-teams/SKILL.md` → 0건
   - `grep -n "oh-my-claudecode" .claude/skills/build-with-teams/SKILL.md` → critic 행은 유지 (`oh-my-claudecode:critic` / `oh-my-claudecode:code-reviewer`)

5. **`index.json` completed 마킹 + phase status 갱신**
   - 권장 도구: **Edit** (string match) — 정확한 따옴표 보존, sed 따옴표 깨짐 회피
   - 대안: `jq '.status = "completed" | ...' input.json > tmp && mv tmp input.json` (임시 파일 후 atomic mv)
   - 변경 필드:
     - `status`: `"pending"` → `"completed"`
     - `current_phase`: `1` → `3`
     - phase 1/2/3 의 `status`: `"pending"` → `"completed"`
     - `updated_at`: 현재 시각 (`2026-05-21T...Z`)

## 작업 외 금지

- 모델 라우팅 표 (`team-lead` / `critic` / `code-reviewer` / `docs-verifier` 행) 수정 — executor 모델은 sonnet 그대로
- 재시도 한도 / 검증 / 실행 절차 등 다른 섹션 본문 수정
- README / `skills/dooray-cli/SKILL.md` 수정 — 사용자 facing 영향 0
- 다른 task (035 / 036) 의 index.json 수정
- agent 파일 본문 수정 (phase-02 의 일)

## 성공 기준

```bash
# 1. executor 행 변경 확인
grep -c "dooray-cli-executor.*custom.*project-local" .claude/skills/build-with-teams/SKILL.md
# 기대: 1

# 2. spawn 코드의 subagent_type 교체
grep -c 'subagent_type.*"dooray-cli-executor"' .claude/skills/build-with-teams/SKILL.md
# 기대: 1 이상

# 3. OMC executor 잔재 0건
grep -cE "oh-my-claudecode:executor" .claude/skills/build-with-teams/SKILL.md
# 기대: 0

# 4. 다른 OMC 에이전트 (critic / code-reviewer) 는 유지
grep -cE "oh-my-claudecode:(critic|code-reviewer)" .claude/skills/build-with-teams/SKILL.md
# 기대: 2 이상 (각각 1건씩)

# 5. index.json completed 마킹
jq -r '.status, .current_phase, .phases[].status' tasks/037-chore-custom-executor-agent/index.json
# 기대: completed / 3 / completed / completed / completed

# 6. 빌드 / 테스트 (코드 변경 없음 재확인)
pnpm tsc --noEmit 2>&1 | grep -c "^src/"
pnpm test 2>&1 | tail -3
# 기대: 0건 / PASS

# 7. PII gate
grep -rnE "tc-ocr|nhnent|@(nhn|nhnent)\.com" .claude/skills/build-with-teams/SKILL.md tasks/037-chore-custom-executor-agent/
# 기대: 0건
```

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
git add .claude/skills/build-with-teams/SKILL.md tasks/037-chore-custom-executor-agent/index.json
git commit -m "$(cat <<'EOF'
chore(skill): switch build-with-teams executor to dooray-cli-executor custom agent + complete task 037

- build-with-teams/SKILL.md: 팀 구성 표 executor 행 + spawn 코드 예시 subagent_type 교체
  (oh-my-claudecode:executor → dooray-cli-executor)
- critic / code-reviewer 는 OMC 그대로 (project-local override 는 executor 만)
- task 037 완료 마킹 (status / current_phase / phase status)
EOF
)"
```
