# Phase 03 — README + skills/dooray-cli/SKILL.md + 빌드/실증 검증 + 완료 마킹

## 컨텍스트

Phase-01 (인프라) + Phase-02 (6 명령) 완료 후 `wiki page comment <verb>` 가 동작한다.
본 phase 는 사용자 facing 문서 갱신 + 동작 실증 + index.json 완료 마킹.

planning 결정 docs (CLAUDE.md / docs/code-architecture.md / docs/prd.md / docs/flow.md) 는 task 생성 시점에 이미 main 에 commit 되어 있으므로 본 phase 에서 손대지 않는다.

## 변경 파일 (정확)

기대 결과 (총 3 파일):
```
README.md                                              (수정 — 위키 섹션에 page comment 6 명령 사용 예 추가)
skills/dooray-cli/SKILL.md                             (수정 — 빠른 참조 표 + 시나리오 추가)
tasks/036-feat-wiki-page-comment-commands/index.json   (완료 마킹: status: completed, current_phase: 3)
```

## 작업 항목 (5개 이하)

### 1. `README.md` — 위키 섹션의 page file 사용 예 직후에 page comment 추가

task 035 phase-03 에서 추가된 `#### 위키 페이지 첨부파일` 섹션 직후에 다음 추가:

```markdown
#### 위키 페이지 댓글

post 의 `post comment` 명령군과 동일 패턴 — `<project> <page-id>` 외에도 `--id`/`--url`/positional URL 지원.

```bash
# 목록 (최신순)
dooray wiki page comment list <project> <page-id>
dooray wiki page comment list <project> <page-id> --latest 5

# 최신 1건 shortcut
dooray wiki page comment latest <project> <page-id>

# 단일 조회
dooray wiki page comment get <project> <page-id> <comment-id>

# 추가 — interactive ($EDITOR) 또는 옵션
dooray wiki page comment add <project> <page-id>                          # $EDITOR
dooray wiki page comment add <project> <page-id> --body "회의 결정 사항"
dooray wiki page comment add <project> <page-id> --body-file ./note.md
echo "댓글" | dooray wiki page comment add <project> <page-id> --body -

# 수정 — interactive ($EDITOR, 기존 본문 prefill) 또는 옵션
dooray wiki page comment edit <project> <page-id> <comment-id> --body "..."

# 삭제 (confirm 없이 즉시)
dooray wiki page comment delete <project> <page-id> <comment-id>

# URL 모드
dooray wiki page comment list "https://<tenant>.dooray.com/wiki/<wikiId>/<pageId>"
```

**post comment 와의 차이**:
- mention / cc / 받는 사람 미지원 — wiki API 부재
- 첨부 파일 미지원 — wiki comment 전용 endpoint 부재 (페이지 본문 파일은 `wiki page file` 사용)
- 본문은 markdown 그대로 전송 (mimeType 자동)
```
```

### 2. `skills/dooray-cli/SKILL.md` — 빠른 참조 표 + 시나리오 1줄

task 035 phase-03 의 `wiki page file` 표 옆 / 직후에 추가:

| 명령 | 용도 |
|---|---|
| `dooray wiki page comment list <project> <page-id> [--latest N]` | 페이지 댓글 목록 (최신순) |
| `dooray wiki page comment latest <project> <page-id>` | 최신 댓글 1건 shortcut |
| `dooray wiki page comment get <project> <page-id> <comment-id>` | 단일 댓글 본문 + 메타 |
| `dooray wiki page comment add <project> <page-id> --body "..."` | 댓글 추가 ($EDITOR fallback) |
| `dooray wiki page comment edit <project> <page-id> <comment-id> --body "..."` | 댓글 수정 |
| `dooray wiki page comment delete <project> <page-id> <comment-id>` | 댓글 삭제 (confirm 없음) |

시나리오 1줄:

> **회의록 결정사항 자동 누적**: 회의록 위키 페이지에 자동화 봇이 `wiki page comment add` 로 결정사항을 댓글로 누적, `wiki page comment list --latest 20` 으로 최근 토론 흐름 추적.

### 3. 빌드 + lint + test

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
pnpm build && pnpm test
# 둘 다 exit 0

node dist/index.js wiki page comment --help 2>&1 | grep -cE "^  (list|latest|get|add|edit|delete)"
# 기대: 6
```

### 4. 동작 실증 (사용자 환경 1회)

```bash
# cwd: /Users/nhn/personal/dooray-cli
# 실제 wiki 페이지 + 권한 필요

# 1) add — interactive ($EDITOR)
node dist/index.js wiki page comment add <project> <page-id>
# $EDITOR 열림 → 본문 입력 → 저장 → "댓글 추가 완료 (id: ...)"

# 2) add — --body 옵션
node dist/index.js wiki page comment add <project> <page-id> --body "테스트 댓글"
# 기대: 즉시 추가, id 출력

# 3) list
node dist/index.js wiki page comment list <project> <page-id>
# 기대: 방금 추가한 댓글이 최상단 (최신순)

# 4) latest
node dist/index.js wiki page comment latest <project> <page-id>
# 기대: 1건 detail 출력

# 5) get
node dist/index.js wiki page comment get <project> <page-id> <comment-id-from-list>

# 6) edit — --body
node dist/index.js wiki page comment edit <project> <page-id> <comment-id> --body "수정됨"

# 7) edit — $EDITOR (기존 본문 prefill 확인)
node dist/index.js wiki page comment edit <project> <page-id> <comment-id>

# 8) delete
node dist/index.js wiki page comment delete <project> <page-id> <comment-id>

# 9) URL 모드
node dist/index.js wiki page comment list "https://<tenant>.dooray.com/wiki/<wikiId>/<pageId>"
```

### 5. 개인 식별 정보 사전 점검 + index.json 완료 마킹 + 최종 커밋

```bash
# 개인 식별 정보 사전 점검
grep -rnE "tc-ocr|nhnent|nhn-comico|@(nhn|nhnent)\.com" README.md skills/ docs/ CLAUDE.md 2>/dev/null
# 기대: 0건

grep -rnE "[0-9]{15,}" README.md skills/ docs/ 2>/dev/null | \
  grep -vE "1234567890123456789|9876543210987654321|<postId>|<pageId>|<wikiId>|<id>|<comment-id>"
# 기대: 0건
```

index.json 수정 (모든 phase status: completed, current_phase: 3).

## code-review-pitfalls 회피 항목

본 phase 는 docs + 마킹. 코드 변경 없음.

- **외과적 변경**: README / SKILL.md 의 다른 섹션 무변경. wiki 섹션과 개인 식별 정보 사전 점검 외 손대지 않음
- **6 가독성 패턴 (CLAUDE.md docs/ADR 작성 형식)**: 새 표·코드 블록은 sub-bullet 분리, semantic line break

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
pnpm build && pnpm test
# 둘 다 exit 0

grep -c "wiki page comment" README.md
# 기대: 6 이상
grep -c "wiki page comment" skills/dooray-cli/SKILL.md
# 기대: 6 이상

node dist/index.js wiki page comment --help 2>&1 | grep -cE "^  (list|latest|get|add|edit|delete)"
# 기대: 6

jq -r '.status' tasks/036-feat-wiki-page-comment-commands/index.json
# 기대: completed
```

## 작업 외 금지

- planning docs 변경 금지
- 코드 변경 금지
- 신규 ADR 추가 금지
- 다른 명령 (post / member / 등) README/SKILL 섹션 정리 금지

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
git add README.md skills/dooray-cli/SKILL.md tasks/036-feat-wiki-page-comment-commands/index.json
git commit -m "$(cat <<'EOF'
docs(readme,skill): document wiki page comment 6 commands + complete task 036

- README: 위키 섹션에 wiki page comment 6 명령 + post comment 와의 차이 (mention/cc/file 부재)
- skills/dooray-cli/SKILL.md: 빠른 참조 표 + 회의록 결정사항 자동 누적 시나리오
- task 036 완료 마킹
EOF
)"
```
