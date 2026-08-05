# Phase 03 — README / SKILL.md + 빌드 검증 + task 완료 마킹

## 컨텍스트

phase-02 의 attachment guard 와 `--no-confirm` 옵션을 사용자/AI 에이전트가 인지하도록 문서화. CLAUDE.md 주의사항 표에도 한 줄 등록.

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- README.md skills/ CLAUDE.md tasks/021-feat-edit-attachment-guard/
```

기대 결과 (총 4 파일):
```
README.md
skills/dooray-cli/SKILL.md
CLAUDE.md
tasks/021-feat-edit-attachment-guard/index.json
```

## 작업 항목

### 1. `README.md` — `post edit` / `post comment edit` 섹션에 가드 동작 한 단락 추가

```markdown
#### 본문 변경 시 attachment 보호

`post edit` 와 `post comment edit` 는 본문을 통째로 replace 합니다. 새 본문에 기존 inline attachment markdown(`![](/files/<id>)`)이 빠져 있으면 stderr 에 경고를 띄우고 (y/N) 로 물어봅니다.

자동화 환경 (pipe / non-TTY) 에서는 그대로 abort 됩니다. 의도한 변경이면 `--no-confirm` 으로 다시 실행하세요.

\`\`\`bash
echo "new body" | dooray post comment edit <project> <post-number> <comment-id> --body - --no-confirm
\`\`\`
```

### 2. `skills/dooray-cli/SKILL.md` — AI 에이전트 가이드

```markdown
## 본문 수정 (attachment 보호)

`post edit` / `post comment edit` 는 full-replace 방식이다. 자동화에서는 다음 중 하나를 선택:

1. **기존 attachment 보존**: 수정 전에 `dooray post comment list <project> <post-number> --json` 로 본문에서 `/files/<id>` 패턴을 추출하여 새 본문에 그대로 유지
2. **명시적 제거**: attachment 가 더 이상 필요 없다고 판단하면 `--no-confirm` 으로 진행. 누락이 의도한 결과임을 명시
```

### 3. `CLAUDE.md` `## 주의사항` 섹션 — 한 줄 추가 (불릿 리스트, "상황별 ADR 필수 참조" 표 아님)

`## 주의사항` 섹션의 기존 불릿 리스트 끝에 다음 한 줄 추가:
```
- `post edit` / `post comment edit` 는 본문 full-replace. 새 본문에 기존 attachment markdown(`![](/files/<id>)`) 누락 시 (y/N) confirm. non-TTY 는 abort, `--no-confirm` 으로 우회.
```

### 4. 빌드 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm build && pnpm test
```

### 5. 마지막 phase — index.json 완료 마킹

```bash
# cwd: /Users/nhn/personal/dooray-cli
sed -i '' 's/"status": "pending"/"status": "completed"/g' tasks/021-feat-edit-attachment-guard/index.json
grep -c '"status": "completed"' tasks/021-feat-edit-attachment-guard/index.json
# 기대: 4
```

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. 빌드 + 테스트 통과
pnpm build && pnpm test

# 2. README 에 attachment 보호 섹션
grep -cE "attachment|--no-confirm" README.md
# 기대: 2 이상

# 3. SKILL.md 에 자동화 가이드
grep -nE "no-confirm|attachment" skills/dooray-cli/SKILL.md
# 기대: 1 이상

# 4. CLAUDE.md 주의사항 표에 한 줄 추가
grep -nE "no-confirm|attachment markdown" CLAUDE.md
# 기대: 1 이상

# 5. index.json 완료 마킹
grep -c '"status": "completed"' tasks/021-feat-edit-attachment-guard/index.json
# 기대: 4

# 6. 개인 식별 정보 grep 0건
grep -rnE "<사내 식별자 패턴 — CLAUDE.md 참조>" README.md skills/ CLAUDE.md tasks/021-feat-edit-attachment-guard/ 2>/dev/null
# 기대: 0건
```

## 작업 외 금지

- 가드 동작 변경 금지 (이미 phase-02 에서 결정)
- 옵션 B (`--preserve-attachments`) / 옵션 C (`--diff`) 추가 금지
- ADR 추가 금지

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/021-feat-edit-attachment-guard
git add README.md skills/dooray-cli/SKILL.md CLAUDE.md tasks/021-feat-edit-attachment-guard/index.json
git commit -m "docs: document attachment guard for post edit + complete task 021

README + SKILL.md + CLAUDE.md 주의사항 표에 --no-confirm 동작 명시.
Mark task 021 completed."
```
