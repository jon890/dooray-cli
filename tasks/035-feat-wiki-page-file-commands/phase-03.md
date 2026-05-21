# Phase 03 — README + skills/dooray-cli/SKILL.md + 빌드/실증 검증 + 완료 마킹

## 컨텍스트

Phase-01 (인프라) + Phase-02 (5 명령) 가 완료되어 `wiki page file <verb>` 가 동작한다.
본 phase 는 사용자 facing 문서 (README + 공개 SKILL.md) 갱신 + 동작 실증 + index.json 완료 마킹.

planning 결정 docs (CLAUDE.md / docs/*) 는 task 생성 시점에 이미 main 에 commit 되어 있으므로 본 phase 에서 손대지 않는다.

## 변경 파일 (정확)

기대 결과 (총 3 파일):
```
README.md                                          (수정 — 위키 섹션 아래에 page file 5 명령 사용 예 추가)
skills/dooray-cli/SKILL.md                         (수정 — 빠른 참조 표 + 시나리오 추가)
tasks/035-feat-wiki-page-file-commands/index.json  (완료 마킹: status: completed, current_phase: 3)
```

## 작업 항목 (5개 이하)

### 1. `README.md` — 위키 섹션 아래에 page file 사용 예 추가

`### 위키` 섹션 (line 328) 끝의 코드 블록 직후, `### 메일` 섹션 (line 340) 직전에 추가:

```markdown
#### 위키 페이지 첨부파일 (Issue #70)

post 의 `post file` 명령군과 동일 패턴 — `<project> <page-id>` 외에도 `--id`/`--url`/positional URL 지원.

```bash
# 목록 (general 첨부 + inline image 둘 다 표시, type 컬럼)
dooray wiki page file list <project> <page-id>

# 업로드 (기본 general — 페이지 하단 첨부 영역)
dooray wiki page file upload <project> <page-id> --file ./SKILL.md
# stdout: attachFileId + 파일 메타 출력

# 인라인 이미지 업로드 (본문 markdown 은 사용자가 직접 박음)
dooray wiki page file upload <project> <page-id> --file ./diagram.png --type inline_image
# stdout 에 본문 삽입용 markdown snippet 안내

# 다운로드
dooray wiki page file download <project> <page-id> --file-id <id> -o ./

# 페이지 모든 첨부 (files + images) 일괄 다운로드
dooray wiki page file download-all <project> <page-id> -o ./attachments/

# 삭제 (confirm 없이 즉시)
dooray wiki page file delete <project> <page-id> --file-id <id>

# URL 모드 (--id 모드는 --project 동반 필요)
dooray wiki page file list "https://<tenant>.dooray.com/wiki/<wikiId>/<pageId>"
dooray wiki page file upload --id <pageId> --project <project> --file ./README.md
```

**주의**:
- `upload` 시 multipart 필드 순서 (`type` → `file`) 가 중요. 클라이언트가 자동으로 강제 (ADR-029 참조)
- `inline_image` 로 올린 파일은 본문에 markdown 으로 박혀야 위키에서 보임 — upload stdout 의 snippet 을 복사해서 `dooray wiki page edit` 으로 본문에 직접 추가
- `delete` 는 confirm 없이 즉시 삭제 (실수 방지 책임은 호출자)
```
```

(외부 백틱은 마크다운 escape — 실제 파일에는 안쪽 ` ``` ` 그대로 박힘)

### 2. `skills/dooray-cli/SKILL.md` — 빠른 참조 표 + 시나리오

기존 SKILL.md 구조 확인 후 wiki 섹션의 표·시나리오를 grep 으로 찾아 page file 행 추가:

```bash
# 위치 찾기
grep -nE "wiki page (get|create|edit)|wiki 페이지|wiki page file" skills/dooray-cli/SKILL.md
```

발견되는 wiki 관련 표 / 시나리오 섹션에 다음 5 명령 행 추가:

| 명령 | 용도 |
|---|---|
| `dooray wiki page file list <project> <page-id>` | 페이지 첨부 (general + inline) 목록 조회 |
| `dooray wiki page file upload <project> <page-id> --file <path> [--type inline_image]` | 첨부 또는 인라인 이미지 업로드 (multipart type 순서 ADR-029) |
| `dooray wiki page file download <project> <page-id> --file-id <id> -o <dir>` | 단일 파일 다운로드 |
| `dooray wiki page file download-all <project> <page-id> -o <dir>` | 페이지 모든 첨부 일괄 다운로드 |
| `dooray wiki page file delete <project> <page-id> --file-id <id>` | 첨부 삭제 (confirm 없음) |

시나리오 1 줄 추가 (이슈 #70 핵심 사용 사례):

> **스킬 파일 팀 공유**: 팀 위키에 스킬 파일 (예: `SKILL.md`) 을 `wiki page file upload` 로 첨부 → 팀원이 `wiki page file download-all` 로 일괄 받아 `~/.claude/skills/` 에 그대로 설치.

### 3. 빌드 + lint + test 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
# 기대: 0

pnpm build && pnpm test
# 기대: exit 0 — phase-01 의 단위 테스트 통과 유지

# CLI 트리 확인
node dist/index.js wiki page --help 2>&1 | grep "file"
# 기대: "file" 서브명령 노출
node dist/index.js wiki page file --help 2>&1 | grep -cE "^  (list|upload|download|download-all|delete)"
# 기대: 5
```

### 4. 동작 실증 (사용자 환경 1회)

```bash
# cwd: /Users/nhn/personal/dooray-cli
# 실제 wiki 페이지 + 테스트용 파일 준비 후
# (사용자 환경에 의존 — executor 가 실제 wiki 의 <project> 와 <page-id> 알아야 함)

# 1) general 업로드
node dist/index.js wiki page file upload <project> <page-id> --file ./README.md
# 기대: attachFileId / name / size / type 출력. type 은 general

# 2) list 로 방금 업로드한 파일 확인
node dist/index.js wiki page file list <project> <page-id>
# 기대: README.md 행 출력 (Type 컬럼이 general)

# 3) inline_image 업로드 (--type inline_image)
node dist/index.js wiki page file upload <project> <page-id> --file ./icon.png --type inline_image
# 기대: 업로드 + 본문 삽입용 snippet 안내 (`![icon.png](/wikis/.../files/...)`)

# 4) download
node dist/index.js wiki page file download <project> <page-id> --file-id <id-from-list> -o /tmp/

# 5) download-all
node dist/index.js wiki page file download-all <project> <page-id> -o /tmp/wiki-attach/
# 기대: 각 파일 ✓ 마크 + "완료: N/N"

# 6) delete
node dist/index.js wiki page file delete <project> <page-id> --file-id <id>
# 기대: 즉시 삭제 + "삭제 완료" 메시지

# 7) URL 모드
node dist/index.js wiki page file list "https://<tenant>.dooray.com/wiki/<wikiId>/<pageId>"
# 기대: positional URL 파싱 → wikiId/pageId 추출 → list 출력
```

executor 메모: 실증은 dry-run 옵션이 없으므로 (post file 도 없음) 실 wiki 에 부담이 없도록 본인 스크래치 wiki 사용 권장.

### 5. PII gate + index.json 완료 마킹 + 최종 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# PII gate (CLAUDE.md "PII / 사내 식별자 노출 금지" 섹션)
grep -rnE "tc-ocr|nhnent|nhn-comico|@(nhn|nhnent)\.com" README.md skills/ docs/ CLAUDE.md 2>/dev/null
# 기대: 0건

grep -rnE "[0-9]{15,}" README.md skills/ docs/ 2>/dev/null | \
  grep -vE "1234567890123456789|9876543210987654321|<postId>|<pageId>|<wikiId>|<id>"
# 기대: 0건 (실제 ID 노출 없음)
```

index.json 수정 (status: "completed" + current_phase: 3 + 모든 phase status 갱신):

```json
{
  "status": "completed",
  "current_phase": 3,
  "phases": [
    { "number": 1, "status": "completed", ... },
    { "number": 2, "status": "completed", ... },
    { "number": 3, "status": "completed", ... }
  ],
  "updated_at": "<현재 ISO 시각>"
}
```

## code-review-pitfalls 회피 항목

본 phase 는 docs 작성 + 빌드 검증 + 마킹. 코드 변경 없음 — review pitfall 의 대부분 카테고리 무관.

- **외과적 변경**: README/SKILL.md 의 다른 섹션 (post / mail / member) 손대지 않음. wiki 섹션과 PII gate 외에는 무변경
- **6 가지 가독성 패턴 (CLAUDE.md docs/ADR 작성 형식)**: 새로 추가하는 표·코드 블록은 sub-bullet 분리, semantic line break 적용. 한 bullet 에 다중 속성 압축 금지

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. 빌드 + 테스트
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
pnpm build && pnpm test
# 둘 다 exit 0

# 2. README + SKILL 갱신
grep -c "wiki page file" README.md
# 기대: 5 이상 (5 명령 + 설명)
grep -c "wiki page file" skills/dooray-cli/SKILL.md
# 기대: 5 이상

# 3. CLI 5 명령 노출
node dist/index.js wiki page file --help 2>&1 | grep -cE "^  (list|upload|download|download-all|delete)"
# 기대: 5

# 4. PII gate 0건
grep -rnE "tc-ocr|nhnent|nhn-comico|@(nhn|nhnent)\.com" README.md skills/ docs/ CLAUDE.md 2>/dev/null | wc -l
# 기대: 0

# 5. index.json completed
jq -r '.status' tasks/035-feat-wiki-page-file-commands/index.json
# 기대: completed
```

## 작업 외 금지

- planning docs (CLAUDE.md / docs/adr.md / docs/code-architecture.md / docs/prd.md / docs/flow.md) 변경 금지 — task 생성 시점에 main commit 으로 이미 반영됨
- 코드 변경 금지 — phase-01/02 산출물 그대로 사용
- 신규 ADR 추가 금지
- 다른 명령 (post / member 등) README/SKILL 섹션 정리 금지 — 본 task scope 외

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
git add README.md skills/dooray-cli/SKILL.md tasks/035-feat-wiki-page-file-commands/index.json
git commit -m "$(cat <<'EOF'
docs(readme,skill): document wiki page file 5 commands + complete task 035 (Issue #70 phase 3/3)

- README: 위키 섹션에 wiki page file 5 명령 사용 예 + URL 모드 + multipart 순서 주의 (ADR-029)
- skills/dooray-cli/SKILL.md: 빠른 참조 표 + 스킬 파일 팀 공유 시나리오
- task 035 완료 마킹

closes #70
EOF
)"
```
