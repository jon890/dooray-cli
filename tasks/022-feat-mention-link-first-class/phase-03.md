# Phase 03 — `--dry-run` 미리보기 + README / SKILL.md + 완료 마킹

## 컨텍스트

phase-01, 02 의 mention/linkTask 합성 결과를 사용자가 송신 전에 확인할 수 있도록 `--dry-run` 옵션 추가. non-interactive 모드 4 명령에만 적용. interactive ($EDITOR) 모드는 사용자가 본문을 직접 보고 작성하므로 dry-run 의미 약함 → 미적용.

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- src/commands/post/ README.md skills/ CLAUDE.md tasks/022-feat-mention-link-first-class/
```

기대 결과 (총 7~8 파일):
```
src/commands/post/comment/add.ts
src/commands/post/comment/edit.ts
src/commands/post/create.ts
src/commands/post/edit.ts
README.md
skills/dooray-cli/SKILL.md
CLAUDE.md
tasks/022-feat-mention-link-first-class/index.json
```

## 작업 항목

### 1. 4 명령에 `--dry-run` 옵션

```ts
.option("--dry-run", "API 호출 없이 합성된 본문만 stdout 출력 (mention/link-task 적용 결과 미리보기)")
```

action 안에서 mention prepend + linkTask append 까지 마친 `bodyContent` 직후, API 호출 (`createPost` / `updatePost` / `createPostComment` / `updatePostComment`) 직전에:

```ts
if (opts.dryRun) {
  process.stdout.write(bodyContent + "\n");
  return;
}
// 기존 API 호출 흐름
```

`--dry-run` 은 spinner 비활성화 (이미 task 019 의 spinner 정책 — `--json/--quiet` 와는 별도 개념이지만 dry-run 도 자동화 친화 → spinner 시작 전에 종료하거나 상관없이 stdout 만 출력).

`--json` 과 함께 쓸 때: `process.stdout.write(JSON.stringify({ body: bodyContent }) + "\n")`. quiet 모드는 `bodyContent` 만.

### 2. `README.md` — 사용 예 섹션 갱신

기존 mention 예시 옆에 task link + dry-run 예 추가:

```markdown
#### 멘션·내부 링크 자동 삽입

\`\`\`bash
# 댓글에 멤버·그룹 멘션
dooray post comment add <project> <post-number> \
  --body "주간 리포트 첨부" \
  --mention "홍길동" \
  --mention-group <project>/dev

# 본문에 다른 업무 링크 append
dooray post create <project> \
  --title "이번 주 작업" \
  --body "관련 이슈" \
  --link-task <project>/470

# 송신 전 합성 결과 미리보기
dooray post comment add <project> <post-number> --body "..." --link-task <project>/470 --dry-run
\`\`\`
```

### 3. `skills/dooray-cli/SKILL.md` — AI 에이전트 가이드

```markdown
## 멘션·링크 자동 삽입 (first-class)

`post create`, `post edit`, `post comment add`, `post comment edit` 모두 지원:

- `--mention <name>` (반복) — 이름으로 멤버 resolve 후 dooray:// markdown prepend
- `--mention-group <code>` (반복) — 그룹 코드로 resolve
- `--link-task <project>/<number>` (반복) — 다른 업무 link 를 본문 끝에 append. 19자리 postId 도 가능
- `--dry-run` — API 호출 없이 합성 결과만 stdout. CI / 자동화 검증용
```

### 4. `CLAUDE.md` 주의사항 표 — 한 줄 추가

```
- `post create` / `post edit` / `post comment add/edit` 4 명령 모두 `--mention` / `--mention-group` / `--link-task` / `--dry-run` 동일 옵션 지원. mention 은 prepend, link-task 는 append, 적용 순서는 mention → link-task. interactive ($EDITOR) 모드의 `post edit` 는 mention/link-task 무시 + 경고
```

### 5. 빌드 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm build && pnpm test
```

### 6. 마지막 phase — index.json 완료 마킹

```bash
# cwd: /Users/nhn/personal/dooray-cli
sed -i '' 's/"status": "pending"/"status": "completed"/g' tasks/022-feat-mention-link-first-class/index.json
grep -c '"status": "completed"' tasks/022-feat-mention-link-first-class/index.json
# 기대: 4
```

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. 빌드 + 테스트 통과
pnpm build && pnpm test

# 2. --dry-run 4 명령
grep -lE "--dry-run|dryRun" src/commands/post/create.ts src/commands/post/edit.ts src/commands/post/comment/add.ts src/commands/post/comment/edit.ts | wc -l | tr -d ' '
# 기대: 4

# 3. README / SKILL.md / CLAUDE.md 갱신
grep -cE "link-task|--mention" README.md skills/dooray-cli/SKILL.md CLAUDE.md
# 기대: 3 이상 (각 파일에 1 이상)

# 4. index.json 완료 마킹
grep -c '"status": "completed"' tasks/022-feat-mention-link-first-class/index.json
# 기대: 4

# 5. PII grep 0건
grep -rnE "tc-ocr|nhnent|nhn-comico|@(nhn|nhnent)\.com" README.md skills/ CLAUDE.md tasks/022-feat-mention-link-first-class/ 2>/dev/null
# 기대: 0건
```

## 작업 외 금지

- placeholder 치환 흐름 추가 금지
- mention 의 escape 정책 변경 금지
- task-link cache 도입 금지

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/022-feat-mention-link-first-class
git add src/commands/post/create.ts src/commands/post/edit.ts src/commands/post/comment/add.ts src/commands/post/comment/edit.ts README.md skills/dooray-cli/SKILL.md CLAUDE.md tasks/022-feat-mention-link-first-class/index.json
git commit -m "feat(commands): add --dry-run + document mention/link-task across post commands

Issue #33 (phase 3/3): preview composed body before send (no API call).
README + SKILL.md + CLAUDE.md document mention/link-task/dry-run rollout.
Mark task 022 completed."
```
