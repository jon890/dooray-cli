# workflow

워크플로우 판단 기준, 정형 task 자동화, 위키 이외 체이닝 시나리오(업무 완료 처리 / 업무 생성 / 댓글 추가 / 스크린샷 첨부 / 메신저 알림)를 다룬다.

## 워크플로우 판단 기준

1. **"내 프로젝트", "개인 프로젝트" 언급 시** → `dooray project list --type private --json` 으로 개인 프로젝트 먼저 조회
2. **프로젝트 코드를 모르면** → `dooray project list --search <keyword>` 로 먼저 찾기
3. **업무 번호를 모르면** → `dooray post search <project> "<keyword>"` 로 검색
4. **워크플로우 이름을 모르면** → `dooray project workflows <project>` 로 확인
5. **멤버 이름을 모르면** → `dooray member list <project>` (또는 `dooray project members <project>`) 로 확인
6. **org 전체 멤버를 찾으려면** → `dooray member search <keyword>` (이름), `--email <addr>`, `--user-code <code>` 중 하나 사용
7. **결과를 다음 액션에 사용하려면** → `--json` 플래그로 구조화된 데이터 획득

---


## 체이닝 예시

### 업무 찾아서 완료 처리

```bash
# 1. 업무 검색으로 번호 확인
dooray post search <project> "graceful shutdown" --json
# → [{ "number": 42, "subject": "graceful shutdown 구현", ... }]

# 2. 완료 처리
dooray post done <project> 42
```


### 프로젝트 찾아서 업무 생성

```bash
# 1. 프로젝트 코드 확인
dooray project list --search "AI서비스" --json
# → [{ "code": "ai-service-dev", ... }]

# 2. 업무 생성
dooray post create ai-service-dev \
  --title "주간보고 2026-W14" \
  --body "## 이번 주 성과\n- 항목1\n- 항목2" \
  --to "김철수"
```


### 업무 상세 조회 후 댓글 추가

```bash
# 1. 업무 조회
dooray post get <project> 42 --json

# 2. 댓글 추가
dooray post comment add <project> 42 --body "진행 상황 업데이트: 80% 완료"
```


### 시나리오 — 댓글에 스크린샷 자동 첨부

스크립트가 스크린샷을 댓글에 삽입하거나, 에이전트가 결과 파일을 첨부 댓글로 보고할 때 사용.
Dooray REST API 가 댓글 전용 attachment endpoint 를 미지원하므로 내부적으로 post-level files API + 댓글 본문 PUT 합성으로 동작한다.

```bash
# 1. 댓글을 먼저 만든다 (텍스트만, --json 으로 commentId 획득)
COMMENT_ID=$(dooray post comment add <project> <post-num> --body "스크린샷 보고:" --json | jq -r '.id')

# 2. 그 댓글에 파일을 첨부 (post-level 업로드 + 댓글 본문 markdown 자동 추가)
dooray post comment file upload <project> <post-num> "$COMMENT_ID" ./screenshot.png
```


### 시나리오 — 배포 알림 메신저 자동 전송

CI/배포 스크립트가 완료 알림을 담당자 DM 또는 팀 대화방에 자동으로 보낼 때 사용.
전송은 API 토큰 소유자 명의로 나가며, 본문은 plain text 만 지원한다.

```bash
# 담당자 DM (id 또는 이메일만 가능 — 이름 검색 미지원)
dooray messenger send --to "user@example.com" --body "배포가 완료되었습니다 (v1.2.3)."

# 팀 대화방 (channelId 또는 자신이 속한 대화방 이름)
dooray messenger channel-send --channel "배포 알림방" --body-file ./release-note.md

# --json 으로 log-id 확인 (자동화 파이프라인에서 후속 처리 시)
dooray messenger send --to <memberId> --body "..." --json
```


---

## 정형 task 자동화

매주 같은 형식의 task 를 만드는 자동화는 템플릿 + override 패턴이 효율적:

```bash
# 매주 월요일 실행되는 cron — "주간 릴리스 체크" 템플릿으로 자동 생성
TODAY=$(date +%Y-%m-%d)
POST_ID=$(dooray post create <project> \
  --template "주간 릴리스 체크" \
  --title "주간 릴리스 체크 — $TODAY" \
  --json | jq -r '.id')
```

템플릿 본문의 `${year}` / `${month}` 등 매크로는 Dooray 가 자동 치환 (`interpolation=true` 기본).
사용자 정의 변수는 미지원 — 필요 시 client 측 string replace 로 처리.

