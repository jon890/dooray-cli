# Phase 03 — README / SKILL.md 갱신 + 빌드 검증 + task 완료 마킹

## 컨텍스트

phase-01, 02 에서 추가한 `post comment file *` 4종 명령을 사용자/AI 에이전트가 발견할 수 있도록 문서화 + task 완료 마킹.

코드 현황:
- `README.md` — 명령 사용 예 섹션 존재 (post / post comment / post file 등)
- `skills/dooray-cli/SKILL.md` — AI 에이전트 자동화 가이드. `post comment` / `post file` 사용 예 존재
- `CLAUDE.md` — "주의사항" 표 (post 하위 명령 input 분기 패턴 명시. 신규 명령도 동일 분기라 동일 표에 흡수 가능)

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- README.md skills/ CLAUDE.md tasks/020-feat-post-comment-file-commands/
```

기대 결과 (총 3~4 파일):
```
README.md
skills/dooray-cli/SKILL.md
CLAUDE.md                                              (선택 — 주의사항 표 한 줄 추가)
tasks/020-feat-post-comment-file-commands/index.json
```

## 작업 항목

### 1. `README.md` — 명령 사용 예 추가

기존 `post comment` 또는 `post file` 섹션 근처에 새 4종 명령 사용 예 추가:

```markdown
### 댓글 첨부파일 관리

\`\`\`bash
# 댓글에 파일 업로드
dooray post comment file upload <project> <post-number> <comment-id> ./image.png

# 댓글 첨부파일 목록
dooray post comment file list <project> <post-number> <comment-id>

# 댓글 첨부파일 다운로드
dooray post comment file download <project> <post-number> <comment-id> <file-id> -o ./downloads

# 댓글 첨부파일 삭제
dooray post comment file delete <project> <post-number> <comment-id> <file-id>
\`\`\`

`<comment-id>` 는 `dooray post comment list <project> <post-number>` 로 조회.
인라인 이미지로 사용하려면 업로드 후 응답의 file id 를 댓글 본문 markdown 에 \`![](/files/<id>)\` 로 삽입.
```

### 2. `skills/dooray-cli/SKILL.md` — AI 에이전트 사용 가이드

`post comment` 섹션 근처에 자동화 시나리오 추가:

```markdown
## 댓글에 인라인 이미지 첨부

1. 댓글 작성: `dooray post comment add <project> <post-number> --body "..." --json | jq -r '.id'` 으로 commentId 획득
2. 이미지 업로드: `dooray post comment file upload <project> <post-number> <commentId> ./image.png --json | jq -r '.id'` 으로 fileId 획득
3. 댓글 본문 갱신: `dooray post comment edit <project> <post-number> <commentId> --body "본문 ![](/files/<fileId>)"`
```

### 3. `CLAUDE.md` 주의사항 표 — comment 하위 명령에 file 4종 추가 언급 (선택)

기존 표에 한 줄:
```
- `post comment file *` (upload/list/download/delete) 도 `<project> <post-number> <comment-id>` 외 `--id`/`--url` 분기 동일 적용. comment-id 는 추가 positional 인자
```

(자명한 패턴 확장이므로 표에 한 줄로 충분)

### 4. 빌드 + 시나리오 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm build && pnpm test
```

phase-02 의 실증 시나리오 (upload→list→download→delete 1 사이클) 가 phase-02 commit 시점에 통과했는지 executor 메모에서 확인. 본 phase 는 추가 시나리오 없이 빌드 + 테스트만.

### 5. 마지막 phase — index.json 완료 마킹

phase-03 가 마지막이므로 본 phase commit 에 status 마킹 포함:

```bash
# cwd: /Users/nhn/personal/dooray-cli
sed -i '' 's/"status": "pending"/"status": "completed"/g' tasks/020-feat-post-comment-file-commands/index.json

# 검증: status: completed 가 4개 (index 1 + phases 3)
grep -c '"status": "completed"' tasks/020-feat-post-comment-file-commands/index.json
# 기대: 4
```

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. 빌드 + 테스트 통과
pnpm build && pnpm test
# 기대: exit 0

# 2. README 에 신규 명령 사용 예
grep -cE "post comment file (upload|list|download|delete)" README.md
# 기대: 4 이상

# 3. SKILL.md 에 자동화 시나리오 추가
grep -nE "post comment file" skills/dooray-cli/SKILL.md
# 기대: 1 이상

# 4. index.json 완료 마킹
grep -c '"status": "completed"' tasks/020-feat-post-comment-file-commands/index.json
# 기대: 4

# 5. PII grep 0건 (CLAUDE.md 의 release 규칙)
grep -rnE "tc-ocr|nhnent|nhn-comico|@(nhn|nhnent)\.com" README.md skills/ CLAUDE.md tasks/020-feat-post-comment-file-commands/ 2>/dev/null
# 기대: 0건
```

## 작업 외 금지

- 댓글 본문에 `![](/files/<id>)` 자동 append 기능 추가 금지 (별도 enhancement)
- comment cache 도입 금지
- 기존 post file 명령 문서 변경 금지 (대칭성만 유지)

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/020-feat-post-comment-file-commands
git add README.md skills/dooray-cli/SKILL.md CLAUDE.md tasks/020-feat-post-comment-file-commands/index.json
git commit -m "docs: document post comment file commands + complete task 020

README usage examples + SKILL.md inline image automation scenario.
Mark task 020 completed."
```
