# Phase 02 — README + skills/dooray-cli/SKILL.md + 완료 마킹

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- README.md skills/ tasks/030-feat-post-edit-parent/
```

기대 결과 (총 3 파일):
```
README.md
skills/dooray-cli/SKILL.md
tasks/030-feat-post-edit-parent/index.json
```

## 작업 항목

### 1. `README.md` — `post edit` 섹션에 `--parent` 사용 예 추가

기존 cc/to 사용 예 옆 또는 별도 단락:

```markdown
#### 상위 업무 변경 (`--parent`)

\`\`\`bash
# 자식 업무에 부모 지정
dooray post edit <project> <child-number> --parent <project>/<parent-number>

# 다른 부모로 변경
dooray post edit --id <postId> --parent <other-parent-postId>
\`\`\`

내부적으로 `client.updatePost` 호출 후 별도 `POST .../set-parent-post` endpoint 추가 호출. **parent 해제 (top-level 화)** 는 Dooray API 가 미지원이라 웹 UI 에서 수동 처리.

interactive ($EDITOR) 모드에서 `--parent` 사용 시 무시 + stderr 경고. **parent 만 단독 변경하려면 `--title "<원제목>"` 동반 필요** — `post edit` 가 본문 변경(`--title`/`--body`) 동반 시에만 non-interactive 분기로 들어가며, parent 변경은 그 분기 안에서만 수행됨.
```

### 2. `skills/dooray-cli/SKILL.md` — AI 자동화 시나리오

빠른 참조 표에 옵션 행 추가:

```markdown
| `dooray post edit <project> <number> --parent <ref>` | 상위 업무 설정/변경 (Issue #60) |
```

자동화 시나리오:

```markdown
## 자식 업무 먼저 → 후속 부모 지정 (Issue #60)

\`\`\`bash
# 1. 자식 업무 생성 (parent 모르고)
CHILD_ID=$(dooray post create <project> --title "subtask A" --json | jq -r '.id')

# 2. 부모 결정 후 후속 지정
dooray post edit --id "$CHILD_ID" --parent <project>/<parent-number>
\`\`\`

**한계** (cmux-browser spike 결과): Dooray API 가 `unset-parent-post` 미제공 → CLI 로 parent 해제 불가. 필요 시 웹 UI 에서 처리.
```

### 3. 마지막 phase — index.json 완료 마킹

```bash
# cwd: /Users/nhn/personal/dooray-cli
sed -i '' 's/"status": "pending"/"status": "completed"/g' tasks/030-feat-post-edit-parent/index.json
sed -i '' 's/"current_phase": 1/"current_phase": 2/' tasks/030-feat-post-edit-parent/index.json
grep -c '"status": "completed"' tasks/030-feat-post-edit-parent/index.json
# 기대: 3 (index 1 + phases 2)
grep -nE "\"current_phase\": 2" tasks/030-feat-post-edit-parent/index.json
# 기대: 1줄
```

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. 빌드 + 테스트 통과
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
# 기대: 0
pnpm build && pnpm test
# 기대: exit 0

# 2. README / SKILL.md 에 --parent 사용 예
grep -cE "post edit.*--parent <ref>|post edit.*--parent <" README.md skills/dooray-cli/SKILL.md
# 기대: 2 이상

# 3. Issue #60 역참조
grep -nE "Issue #60" README.md skills/dooray-cli/SKILL.md
# 기대: 1 이상

# 4. index.json 완료 마킹
grep -c '"status": "completed"' tasks/030-feat-post-edit-parent/index.json
# 기대: 3
grep -cE "\"current_phase\": 2" tasks/030-feat-post-edit-parent/index.json
# 기대: 1

# 5. 개인 식별 정보 grep 0건
grep -rnE "<사내 식별자 패턴 — CLAUDE.md 참조>" README.md skills/ tasks/030-feat-post-edit-parent/ 2>/dev/null | grep -vE "사내 Dooray|NHN 도메인"
# 기대: 0건 (exit 1)
```

## 작업 외 금지

- 코드 변경 금지 (phase-01 결과 그대로)
- planning docs (CLAUDE.md / prd.md / flow.md) 변경 금지 — commit `a055fa5` 으로 이미 반영
- `--parent-clear` 또는 unset 시나리오 안내 금지 (API 미지원 — 웹 UI 안내만)

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/030-feat-post-edit-parent
git add README.md skills/dooray-cli/SKILL.md tasks/030-feat-post-edit-parent/index.json
git commit -m "docs: document post edit --parent; complete task 030

Issue #60 (phase 2/2): README 사용 예 + SKILL.md 자동화 시나리오
(자식 업무 → 후속 부모 지정). unset 미지원 한계 안내. 완료 마킹."
```
