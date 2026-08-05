# workflow

## 모르는 값을 먼저 찾는 순서

| 모르는 것 | 먼저 실행 |
| --- | --- |
| 개인 프로젝트 ("내 프로젝트" 언급) | `dooray project list --type private --json` |
| 프로젝트 코드 | `dooray project list --search <keyword>` |
| 업무 번호 | `dooray post search <project> "<keyword>"` |
| 워크플로우 이름 | `dooray project workflows <project>` |
| 프로젝트 안의 멤버 이름 | `dooray member list <project>` 또는 `dooray project members <project>` |
| organization 전체 멤버 | `dooray member search <keyword>` — 옵션은 [common.md](common.md) |

## 체이닝

### 업무를 찾아 완료 처리

```bash
dooray post search <project> "graceful shutdown" --json
# → [{ "number": 42, "subject": "graceful shutdown 구현", ... }]
dooray post done <project> 42
```

### 프로젝트를 찾아 업무 생성

```bash
dooray project list --search "AI서비스" --json
# → [{ "code": "<project>", ... }]

dooray post create <project> \
  --title "주간보고 2026-W14" \
  --body "## 이번 주 성과\n- 항목1\n- 항목2" \
  --to "김철수"
```

### 업무 조회 후 댓글 추가

```bash
dooray post get <project> 42 --json
dooray post comment add <project> 42 --body "진행 상황 업데이트: 80% 완료"
```

### 댓글에 스크린샷 첨부

댓글 첨부는 두 단계로 나뉜다 — 댓글을 먼저 만들고 그 ID 로 파일을 올린다.

```bash
COMMENT_ID=$(dooray post comment add <project> <post-num> --body "스크린샷 보고:" --json | jq -r '.id')
dooray post comment file upload <project> <post-num> "$COMMENT_ID" ./screenshot.png
```

업로드하면 댓글 본문에 markdown reference 가 자동으로 붙는다.

### 배포 알림 메신저 전송

전송은 API 토큰 소유자 명의로 나가고 본문은 plain text 만 된다.

```bash
# DM — --to 는 ID 나 이메일만 받는다 (이름 불가)
dooray messenger send --to "user@example.com" --body "배포가 완료되었습니다 (v1.2.3)."

# 대화방 — channelId 또는 자신이 속한 방 이름
dooray messenger channel-send --channel "배포 알림방" --body-file ./release-note.md

# 후속 처리에 쓸 log id 가 필요하면
dooray messenger send --to <memberId> --body "..." --json
```

## 정형 task 자동화

매주 같은 형식의 업무를 만들 때는 템플릿에 제목만 덮어쓴다.

```bash
TODAY=$(date +%Y-%m-%d)
POST_ID=$(dooray post create <project> \
  --template "주간 릴리스 체크" \
  --title "주간 릴리스 체크 — $TODAY" \
  --json | jq -r '.id')
```

템플릿 본문의 `${year}`, `${month}` 같은 매크로는 Dooray 가 치환한다.
사용자 정의 변수는 지원하지 않으므로 필요하면 받은 본문을 직접 치환한다.
