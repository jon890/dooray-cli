# wiki

위키 페이지 조회(트리 포함), 첨부파일 다운로드/공유, 인라인 이미지 업로드, 댓글 누적 시나리오를 다룬다.

## 체이닝 예시 — 위키

### 위키 페이지 조회

```bash
# 1. 위키 페이지 목록
dooray wiki pages <project> --json
# → [{ "id": "<pageId>", "subject": "설계 문서", ... }]

# 2. 페이지 내용 조회
dooray wiki page get <project> <pageId> --json

# 3. 전체 계층을 트리로 훑기 (--json 은 flat 배열 — wiki pages 와 동일 스키마로 파싱)
dooray wiki tree <project> --json
```


### 첨부파일 일괄 다운로드 후 실패 분리

```bash
# --json 으로 구조화 출력 → jq 로 성공/실패 분리
RESULT=$(dooray post file download-all <project> <number> -o ./ --json)
echo "$RESULT" | jq -r '.failed[] | "\(.fileId): \(.error)"' >&2
echo "$RESULT" | jq -r '.succeeded[].path'
# exit code 1 이 설정되어 있으면 실패 있는 상태
```


### 위키 페이지 첨부파일 — 스킬 파일 팀 공유

**스킬 파일 팀 공유**: 팀 위키에 스킬 파일 (예: `SKILL.md`) 을 `wiki page file upload` 로 첨부 → 팀원이 `wiki page file download-all` 로 일괄 받아 `~/.claude/skills/` 에 그대로 설치.

```bash
# 업로드 (일반 첨부)
dooray wiki page file upload <project> <page-id> --file ~/.claude/skills/my-skill/SKILL.md

# 팀원 쪽에서 일괄 다운로드
dooray wiki page file download-all <project> <page-id> -o ~/.claude/skills/my-skill/

# 첨부 목록 확인 (type 컬럼: general / inline_image)
dooray wiki page file list <project> <page-id>
```


### 위키 페이지 인라인 이미지 업로드 후 본문 자동 삽입

`--type inline_image` 로 업로드 시 `--json` 응답에 `markdownSnippet` 필드가 포함됩니다.
jq 로 추출해 본문에 바로 삽입하는 자동화가 가능합니다.

```bash
# 1. 인라인 이미지 업로드 — --json 으로 markdownSnippet 추출
SNIPPET=$(dooray wiki page file upload <project> <page-id> \
  --file ./diagram.png --type inline_image --json \
  | jq -r '.markdownSnippet')
# SNIPPET = "![diagram.png](/wikis/<wikiId>/files/<attachFileId>)"

# 2. 기존 본문 조회
CURRENT_BODY=$(dooray wiki page get <project> <page-id> --json | jq -r '.body.content')

# 3. snippet 을 본문 끝에 추가해 업데이트
NEW_BODY="${CURRENT_BODY}

${SNIPPET}"
dooray wiki page edit <project> <page-id> --body "$NEW_BODY"
```

**참고**: `general` 타입은 `markdownSnippet` 없음. `--quiet` 은 id 만 출력 (snippet 미포함).


### 위키 페이지 댓글 — 회의록 결정사항 자동 누적

**회의록 결정사항 자동 누적**: 회의록 위키 페이지에 자동화 봇이 `wiki page comment add` 로 결정사항을 댓글로 누적, `wiki page comment list --latest 20` 으로 최근 토론 흐름 추적.

```bash
# 결정사항 댓글 추가
dooray wiki page comment add <project> <page-id> --body "결정: 배포일 2026-06-01 확정"

# 최근 20개 토론 흐름 조회
dooray wiki page comment list <project> <page-id> --latest 20

# 최신 댓글 1건 shortcut
dooray wiki page comment latest <project> <page-id>
```

