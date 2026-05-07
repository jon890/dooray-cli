# Phase 03 — README + SKILL.md + 빌드 검증 + task 완료

## 컨텍스트

phase-01 / phase-02 산출물을 사용자/AI 에이전트가 발견하도록 docs 갱신. 자동화 스킬 (스크립트가 댓글에 인라인 이미지 삽입) 시나리오를 SKILL.md 의 자동화 섹션에 명시.

## 작업 항목 (4개)

### 1) `README.md` — `post comment file *` 사용 예 추가

기존 `post file *` 4 명령 섹션 옆 (또는 자동화 섹션) 에 한 블록 추가:

```markdown
### 댓글 첨부 파일 (`post comment file *`)

자동화로 댓글에 인라인 이미지 / 파일을 삽입할 때 사용. 4 명령 (list/upload/download/delete) 모두 `<project> <post-number> <comment-id>` 또는 `--id <postId> --comment-id <logId>` / `--url <url> --comment-id <logId>` 패턴 지원 (ADR-020).

```bash
# 첨부 목록
dooray post comment file list <project> <post-num> <comment-id>

# 업로드 (post-level files API 로 업로드 + 댓글 본문에 markdown reference append)
dooray post comment file upload <project> <post-num> <comment-id> ./screenshot.png

# 다운로드 (post-level 파일과 동일 — UX 일관성 wrapper)
dooray post comment file download <project> <post-num> <comment-id> <file-id> --out ./out.png

# 삭제 (댓글 본문 markdown 제거 + post-level 파일 삭제, --yes 로 confirm 생략)
dooray post comment file delete <project> <post-num> <comment-id> <file-id> --yes
```

> Dooray REST API 가 댓글 전용 attachment endpoint 를 제공하지 않아 내부적으로
> post-level files API 와 댓글 본문 PUT 의 합성으로 동작 (ADR-024). 단일 명령
> = 단일 파일 — 다중 파일은 호출자가 반복 호출.
```

### 2) `skills/dooray-cli/SKILL.md` — 자동화 시나리오 추가

기존 자동화 섹션 (post 본문 첨부 안내 옆) 에 댓글 첨부 시나리오 한 블록 추가. 키워드: "스크립트가 스크린샷을 댓글에 삽입", "에이전트가 결과 파일을 첨부 댓글로 보고".

예:
```markdown
**시나리오 — 댓글에 스크린샷 자동 첨부**:

```bash
# 1. 댓글을 먼저 만든다 (텍스트만, --json 으로 commentId 획득)
COMMENT_ID=$(dooray post comment add <project> <post-num> --body "스크린샷 보고:" --json | jq -r '.id')

# 2. 그 댓글에 파일을 첨부 (post-level 업로드 + 댓글 본문 markdown 자동 추가)
dooray post comment file upload <project> <post-num> "$COMMENT_ID" ./screenshot.png
```
```

### 3) 빌드 + 시나리오 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. build + test
pnpm run build && pnpm test
# 기대: 모든 vitest pass + 신규 10 케이스 추가

# 2. 4 명령 --help smoke
for sub in list upload download delete; do
  node dist/index.js post comment file $sub --help | head -3
done

# 3. PII 검증 (README + SKILL.md)
grep -rnE "tc-ocr|nhnent|nhn-comico|@(nhn|nhnent)\.com" README.md skills/dooray-cli/SKILL.md docs/adr.md tasks/020-feat-post-comment-file-commands/ 2>/dev/null
# 기대: 0건
```

### 4) Task 완료 처리

`tasks/020-feat-post-comment-file-commands/index.json` 의 `status` → `"completed"`, `current_phase` → `3`, 모든 phases[*].status → `"completed"`, `updated_at` → 현재 ISO 8601.

**권장**: Edit 도구로 4개 위치 직접 치환. 또는 portable node 한 줄:

```bash
node -e "const fs=require('fs');const f='tasks/020-feat-post-comment-file-commands/index.json';const d=JSON.parse(fs.readFileSync(f,'utf8'));d.status='completed';d.current_phase=3;d.phases.forEach(p=>p.status='completed');d.updated_at=new Date().toISOString();fs.writeFileSync(f,JSON.stringify(d,null,2)+'\n');"
grep -c '"status": "completed"' tasks/020-feat-post-comment-file-commands/index.json
# 기대: 4 (root + phases 3)
```

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. README 에 4 명령 모두 등장
grep -cE "post comment file (list|upload|download|delete)" README.md
# 기대: 4 이상

# 2. SKILL.md 에 자동화 시나리오 추가
grep -cE "post comment file upload" skills/dooray-cli/SKILL.md
# 기대: 1 이상

# 3. ADR-024 명시 (README 또는 SKILL.md)
grep -cE "ADR-024" README.md skills/dooray-cli/SKILL.md
# 기대: 1 이상

# 4. PII 0 건 (README + SKILL.md + docs + tasks/020)
grep -rnE "tc-ocr|nhnent|nhn-comico|@(nhn|nhnent)\.com" README.md skills/dooray-cli/SKILL.md docs/adr.md tasks/020-feat-post-comment-file-commands/ 2>/dev/null

# 5. index.json completed
grep -c '"status": "completed"' tasks/020-feat-post-comment-file-commands/index.json
# 기대: 4
```

## 작업 외 금지

- 코드 변경 — phase-01 / phase-02 에서 마무리. 본 phase 는 docs 만
- ADR 신규 추가 — ADR-024 단일
- pre-commit hook / CI workflow 변경 (별도 plan)

## Blocked 조건

- 빌드 / 테스트 실패 → phase-01 / phase-02 결함, 해당 phase 재시작
- PII grep 1 건 이상 → 해당 위치를 placeholder 또는 승인 dummy 로 교체
