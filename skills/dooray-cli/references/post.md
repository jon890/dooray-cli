# post

업무(post) 식별 방식, 생성, 수정, 참조자/담당자 변경, 본문 수정 시 attachment 보호, 동명이인 우회, 부모 업무 지정, 태그 자동화를 다룬다.

## 커맨드 상세

### 업무 식별 방식 (post 하위 16개 명령 공통)

아래 16개 명령은 4가지 입력을 모두 받는다:
`post get`/`edit`/`done`/`workflow`, `post comment list`/`add`/`edit`/`delete`, `post file list`/`upload`/`download`/`download-all`/`delete`, `post comment file list`/`upload`/`download`/`delete`.

```bash
# (1) 기존 positional — 가장 익숙한 형태 (<number> 는 업무 번호 #N)
dooray post get <project> 42

# (2) Dooray URL을 첫 인자로 — 사용자 메시지에서 URL을 그대로 복사할 때 최적
#     지원 형식 3종 모두 동일하게 작동
dooray post get https://x.dooray.com/task/to/<postId>
dooray post get https://x.dooray.com/task/<projectId>/<postId>
dooray post get https://x.dooray.com/project/tasks/<postId>

# (3) --id <postId>  — post create 결과의 .id 를 그대로 전달
dooray post get --id <postId>

# (4) --url <url>  — URL 형식 3종 모두 지원
dooray post get --url https://x.dooray.com/task/to/<postId>
```

> ⚠️ **`post create` 결과 `.id` 는 internal postId (19자리 숫자)입니다.**
> 이 숫자를 `<project> <업무번호>` 의 번호 자리에 넣으면 안내 에러가 발생합니다.
> 후속 조회·수정·댓글은 반드시 **`--id <postId>`** 를 사용하세요.
>
> ```bash
> POST_ID=$(dooray post create <project> --title "..." --json | jq -r '.id')
> dooray post get --id "$POST_ID"                          # ✅ --id 사용
> dooray post comment add --id "$POST_ID" --body "댓글"   # ✅ --id 사용
> # dooray post get <project> "$POST_ID"                  # ❌ 안내 에러 발생
> ```

**우선순위 / 충돌 규칙**: `--id`+`--url` 동시 지정 → 에러.
`--id`/`--url`+positional 동시 지정 → 에러.
URL/`--id`/`--url` 모드는 standalone API(`getPost(postId)`)로 resolve 단계를 단축.

**sub-id 옵션화** (URL/`--id`/`--url` 모드에서 필수):
```bash
# comment edit/delete: --comment-id
dooray post comment edit  --url <url> --comment-id <commentId> --body "..."
dooray post comment delete --url <url> --comment-id <commentId>

# file download/delete: --file-id
dooray post file download --url <url> --file-id <fileId> -o ./downloads
dooray post file delete   --url <url> --file-id <fileId>

# file upload: --file (로컬 경로)
dooray post file upload   --url <url> --file ./report.pdf
```

기존 positional 3-arg(`comment edit <project> <number> <comment-id>`, `file upload <project> <number> <path>`)는 그대로 유지.

### 업무 생성 (non-interactive)

```bash
dooray post create <project> \
  --title "제목" \
  --body "본문 마크다운" \
  --to "담당자이름" \           # 여러 명: --to "김철수" --to "이영희"
  --cc "참조자이름" \
  --priority normal \           # highest, high, normal, low, lowest
  --due-date "2026-04-30T18:00:00+09:00" \
  --tag "버그" --tag "긴급" \   # 반복 지정. mandatory 그룹은 클라이언트 사전 검증
  --parent "<project>/337" \       # "code/number" 또는 raw postId 두 형태만 허용
  --workflow "진행 중" \         # 이름 또는 class (registered/working/closed). 부분일치 모호 시 후보 + 에러
  --milestone "Sprint 12"
```

본문이 길면 파일로 (`--body`와 `--body-file`은 함께 사용 불가):
```bash
dooray post create <project> --title "제목" --body-file ./content.md
```

> **`--workflow` 동작 주의**: 워크플로우 설정은 post 생성 *후속* 호출.
> resolve/설정에 실패해도 stderr 경고만 출력되고 **exit code는 0** (post는 이미 생성됨).
> 자동화 스크립트에서 워크플로우 적용 여부를 보장해야 하면 stderr를 별도 점검할 것.

### 업무 수정 (non-interactive)

```bash
# 제목만 변경
dooray post edit <project> <number> --title "새 제목"

# 본문만 변경
dooray post edit <project> <number> --body "새 본문"

# 제목 + 본문 동시 변경
dooray post edit <project> <number> --title "새 제목" --body-file ./updated.md
```

### 참조자(cc) / 담당자(to) 변경 — 멤버 · 그룹

```bash
# 기존 참조자 유지 + 그룹 추가 (dedupe: organizationMemberId / projectMemberGroupId)
dooray post edit <project> <number> --cc-group dev-team

# 기존 참조자 전부 비우고 신규 멤버만
dooray post edit <project> <number> --cc-clear --cc 홍길동

# 담당자(to)도 동일 패턴: --to / --to-group / --to-clear
dooray post edit <project> <number> --to 김철수 --to-group qa-team
```

dry-run 으로 변경 결과 미리보기 (API 호출 없음):

```bash
dooray post edit --id "$POST_ID" --cc-group qa-team --dry-run --json \
  | jq '.users.cc'
```

> interactive (`$EDITOR`) 모드에서는 위 옵션이 무시되고 stderr 경고가 출력됩니다.


---

## 본문 수정 (attachment 보호)

`post edit` / `post comment edit` 는 full-replace 방식이다. 자동화에서는 다음 중 하나를 선택:

1. **기존 attachment 보존**:
   - `post edit` 수정 전: `dooray post get <project> <post-number> --json` 으로 `.body.content` 에서 `/files/<id>` 패턴 추출
   - `post comment edit` 수정 전: `dooray post comment list <project> <post-number> --json` 으로 해당 댓글 본문에서 `/files/<id>` 패턴 추출
   추출한 markdown reference 를 새 본문에 그대로 포함하여 전달
2. **명시적 제거**: attachment 가 더 이상 필요 없다고 판단하면 `--no-confirm` 으로 진행. 누락이 의도한 결과임을 명시

---

---

## 동명이인 우회 — 이메일 / memberId 직접

이름이 동일한 멤버가 여러 명이라 `--cc 홍길동` 이 모호로 실패할 때:

```bash
# 1) 이메일로 우회
dooray post edit --id "$POST_ID" --cc user.specific@example.com

# 2) 사전에 member search 로 ID 확보 후 직접
MEMBER_ID=$(dooray member search 홍길동 --json | jq -r '.[] | select(.externalEmailAddress=="user.specific@example.com") | .id')
dooray post edit --id "$POST_ID" --cc "$MEMBER_ID"
```

`--to` / `--mention` 동일 분기 (resolveMember 인프라). 분기 규칙:
- `^\d{15,}$` — memberId 직접 사용
- 이메일 정규형 — searchMembers exact
- 그 외 — 이름 부분일치


---

## 신규 업무 생성 후 그룹 cc 첨부

자동화 패턴:
1. audit 리포트 분석
2. 신규 업무 생성
3. 후속으로 특정 그룹을 참조에 추가

```bash
# 1. 신규 업무 생성 (그룹 cc 포함)
POST_ID=$(dooray post create <project> \
  --title "주간 audit 리포트" \
  --body-file ./report.md \
  --cc-group dev-team \
  --json | jq -r '.id')

# 2. (필요 시) 후속으로 cc 추가
dooray post edit --id "$POST_ID" --cc-group qa-team
```

---

---

## 자식 업무 먼저 → 후속 부모 지정

```bash
# 1. 자식 업무 생성 (parent 모르고)
CHILD_ID=$(dooray post create <project> --title "subtask A" --json | jq -r '.id')

# 2. 부모 결정 후 후속 지정
dooray post edit --id "$CHILD_ID" --title "subtask A" --parent <project>/<parent-number>
```

**한계** (cmux-browser spike 결과): Dooray API 가 `unset-parent-post` 미제공 → CLI 로 parent 해제 불가. 필요 시 웹 UI 에서 처리.

---


---

## 태그 사후 분류 자동화

분류 분석 결과를 받아 태그를 재분류하는 자동화는 단독 호출 패턴이 효율적:

```bash
# 분석 스크립트가 분류한 태그 이름을 cli 로 적용 — body fetch 불요
POST_ID=$(...)
CATEGORY=$(...)
dooray post edit --id "$POST_ID" --tag "분류: $CATEGORY"
```

태그만 변경하는 시나리오에서 `--title` / `--body` 강제 없음.
mandatory 그룹은 친절한 에러 메시지로 안내.

---

