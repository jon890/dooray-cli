# User Flow — dooray-cli

## 최초 설정 — `dooray setup`

대화형 마법사로 필수 설정을 한 번에 완료한다.

```
dooray setup

? 회사 테넌트명을 입력하세요 (Dooray 접속 URL에서 확인: https://{tenant}.dooray.com) (<tenant>)
? API Endpoint를 선택하세요 (화살표로 선택)
❯ 민간 클라우드      https://api.dooray.com
  공공 클라우드      https://api.gov-dooray.com
  공공 업무망 클라우드 https://api.gov-dooray.co.kr
  금융 클라우드      https://api.dooray.co.kr
? API Key를 입력하세요 (발급: https://<tenant>.dooray.com/setting/api/token) ****

✓ API 연결 성공 (홍길동)

? 메일 기능을 사용하시겠습니까? (Y/n) Y
? IMAP 사용자 이메일 (설정 확인: https://<tenant>.dooray.com/setting/mail/general/read) user@example.com
? IMAP 비밀번호 ****

? Claude Code 스킬을 설치하시겠습니까? (Y/n) Y
✓ 스킬 설치 완료: ~/.claude/skills/dooray-cli

✓ 설정 완료. dooray doctor로 상태를 확인할 수 있습니다.
```

플로우:
1. 테넌트명 입력 (기본값: `<tenant>`) → API Key 발급·메일 설정 링크에 자동 반영
2. API Endpoint 선택 (4개 환경 중 택 1, 기본: 민간)
3. API Key 입력 (마스킹, 발급 링크 안내)
4. API 연결 테스트 → 실패 시 재입력 유도
5. 메일 사용 여부 → Y: IMAP 계정·비밀번호 입력 / n: 건너뛰기
6. Claude Code 스킬 설치 여부 → Y: `~/.claude/skills/dooray-cli` 심볼릭 링크 생성 / n: 건너뛰기
7. 모든 입력 완료 후 config.json에 한 번에 저장 (Ctrl+C 시 저장 안 됨)

재실행 시 기존 설정값이 기본값으로 표시된다.

config 미설정 상태에서 다른 커맨드 실행 시:

```
설정이 완료되지 않았습니다. 먼저 초기 설정을 진행하세요:
  dooray setup
```

### 수동 설정 (개별 키)

기존 `dooray config set/get` 커맨드로도 개별 설정이 가능하다.

```
dooray config set api-key <token>
dooray config set base-url https://api.dooray.com
dooray doctor
```

## 일반 조회 흐름

```
dooray project list                         # 1) 프로젝트 목록 (캐시 자동 갱신)
dooray post list my-project                 # 2) 업무 목록 (postNumber 포함)
dooray post get my-project 42              # 3) 업무 상세 (#42번)
dooray post get --id <postId>              # 3-1) internal postId 로 (create 출력값)
dooray post get https://x.dooray.com/task/to/<postId>        # 3-2) URL 직접 입력 (task/to)
dooray post get https://x.dooray.com/project/tasks/<postId>  # 3-3) URL 직접 입력 (project/tasks, #83)
dooray post search my-project "스프린트"   # 4) 제목 검색
```

`post create` 출력의 긴 숫자는 internal postId 다 (업무 번호 #N 아님).
후속 조회·수정은 `--id <postId>` 로 한다 — positional `<project> <number>` 자리에 넣으면 안내 에러로 거부된다 (#82).

### projectId 직접 입력 (member=me 응답 외 프로젝트, ADR-030, Issue #78)

`member=me` 응답에 없는 프로젝트 (다른 팀 프로젝트 등) 는 코드로 resolve 안 됨.
projectId (15+자리 numeric) 를 직접 입력하면 cache 우회 + 후속 API 호출에 그대로 사용.

```
dooray post search 1234567890123456789 "keyword"
dooray post list 1234567890123456789
dooray member list 1234567890123456789
```

권한 검증은 후속 API 호출 시점 — 권한이 없으면 4xx 발생.

## 업무 생성 흐름

```
dooray post create my-project \
  --title "기능 구현" \
  --to "김철수" \                           # 이름 or 이메일로 멤버 지정
  --body-file task.md                       # 또는 --body - (stdin)
```

`--to` 멤버가 모호할 때:

```
Error: '김' matches multiple members:
  - 김철수 (1234567890123456789)
  - 김영희 (9876543210987654321)
Use full name or ID.
```

## 업무 수정 흐름 ($EDITOR)

```
dooray post edit my-project 42
```

1. API로 현재 업무 조회
2. 임시 파일 생성 (YAML frontmatter + 본문):

```yaml
---
subject: 현재 제목
priority: normal
due_date: 2026-04-30T18:00:00+09:00
to:
  - user@example.com
cc: []
---
본문 마크다운...
```

3. `$EDITOR` 실행 → 저장·종료
4. frontmatter 파싱 후:
   - member resolver 실행
   - API PUT 호출

`$EDITOR` 미설정 시:

```
Error: $EDITOR is not set. Set it with: export EDITOR=vim
```

## 캐시 흐름

- 커맨드 실행 시 캐시 자동 확인 → TTL 만료 시 자동 갱신
- 수동 조작:

```
dooray cache refresh     # 즉시 갱신
dooray cache clear       # 전체 삭제
```

TTL: projects·members·tags·milestones·member-groups 1시간 / workflows·me 24시간

## 멤버 조회 흐름 (ADR-021)

```
dooray member list my-project              # 프로젝트 멤버 (이름·이메일·id)
dooray member get <member-id>              # 단건 조회
```

`post comment list` 의 Creator 컬럼은 자동으로 표시명으로 채워진다 (`--json` 은 raw 유지 — 파이프라인 호환).

## 댓글 흐름

```
dooray post comment list my-project 42         # 댓글 목록
dooray post comment add my-project 42 \         # 댓글 추가
  --body "확인했습니다" \
  --mention "김철수" \                          # @멘션 prepend
  --link-task my-project/41                     # 다른 업무 링크 append
dooray post comment edit my-project 42 \        # 댓글 수정 ($EDITOR)
  --comment-id <comment-id>
dooray post comment delete my-project 42 \      # 댓글 삭제
  --comment-id <comment-id>
```

post `--id`/`--url` 모드도 동일 지원 — `dooray post comment list --id <postId>` 또는 첫 positional 에 Dooray URL 직접.

## 댓글 첨부파일 흐름 (ADR-024)

`post comment file *` 4 명령의 사용자 멘탈 모델은 "댓글 첨부"다.
내부적으론 post-level files API + 댓글 본문 PUT 합성으로 구현 (Dooray 가 댓글 전용 endpoint 미지원).

```
dooray post comment file list my-project 42 <comment-id>            # 댓글 첨부 목록
dooray post comment file upload my-project 42 <comment-id> ./img.png   # 업로드
dooray post comment file download my-project 42 <comment-id> <file-id>  # 다운로드
dooray post comment file delete my-project 42 <comment-id> <file-id>    # 삭제 (markdown + 파일 둘 다)
```

`delete` 는 atomic 보장 없음 — 부분 성공 시 stderr 안내 + non-zero exit.

## 참조자(cc) / 담당자(to) 변경 흐름 (ADR-025)

기존 업무의 참조자·담당자에 멤버 또는 그룹 추가/제거.
자동화 시나리오: 신규 업무 생성 후 후속으로 특정 그룹을 참조에 첨부.

```
# 멤버/그룹 추가 (append + dedupe)
dooray post edit my-project 42 \
  --cc 홍길동 --cc-group dev-team               # 이름·코드 부분일치
  --to 김철수

# 전체 비우고 신규만 (clear + 신규 입력)
dooray post edit my-project 42 \
  --cc-clear --cc 홍길동                         # 기존 cc 전부 제거 + 홍길동만

# 신규 업무 생성 시 그룹 cc 동봉
dooray post create my-project \
  --title "주간 audit 리포트" \
  --cc 홍길동 --cc-group dev-team               # post create 는 clear 없음

# 입력 형식 자동 분기 (Issue #58): 이름 / 이메일 / 15자리 이상 organizationMemberId
dooray post edit my-project 42 \
  --cc user@example.com \                       # 이메일 (동명이인 우회)
  --cc 1234567890123456789                       # organizationMemberId 직접
```

## 템플릿으로 정형 업무 생성 흐름 (ADR-027)

자동화 시나리오: 프로젝트의 정형 task (릴리스 플랜, 요청서, 공지 등) 를 매번 templateName 으로 인스턴스화.

```
# 1. 사용 가능한 템플릿 목록 (이름·ID 확인)
dooray project templates my-project

# 2. 템플릿으로 업무 생성 (body/users/tags 자동 채움 + ${year} 같은 시스템 매크로 치환)
dooray post create my-project --template "릴리스 플랜"

# 3. 사용자 옵션 override — 템플릿 위에 일부 필드만 다르게
dooray post create my-project --template "릴리스 플랜" \
  --title "v0.9 릴리스 계획" \
  --tag "p0"                       # 템플릿 tags 를 덮음
```

`interpolation=true` 가 기본 — Dooray 가 `${year}`, `${month}` 같은 시스템 매크로를 응답에서 자동 치환.
사용자 정의 변수 (`--field key=value`) 는 본 release scope 외 (별도 후속).
사용자 옵션이 명시 입력되면 템플릿 값을 override.

## 상위 업무 변경 흐름 (Issue #60)

자동화 시나리오: 자식 업무를 먼저 만든 뒤 후속으로 부모를 지정하거나, 진행 중 부모-자식 관계 재구성.

```
# 상위 업무 설정/변경
dooray post edit my-project 42 --parent my-project/40    # project/number
dooray post edit --id <postId> --parent <parentPostId>   # 직접 postId
```

내부적으로 `client.updatePost` (subject/body/users) → `client.setPostParent` (별도 `POST .../set-parent-post` endpoint) 순차 호출.
둘 다 무관 endpoint 라 atomic 보장 없음 — partial 실패 시 stderr 안내 + non-zero exit.

**한계**: Dooray API 가 `unset-parent-post` 미제공 → CLI 로 parent 해제 (top-level 화) 불가. 웹 UI 에서 수동 처리.

interactive ($EDITOR) 모드에서는 이 옵션들 무시 + stderr 경고 (mention/link-task 와 동일 패턴).

## 업무 메타데이터 흐름 (ADR-019)

```
dooray post create my-project \
  --title "기능 구현" \
  --tag "frontend" --tag "p0" \                  # 반복 가능, mandatory-tag 그룹은 사전 검증
  --parent my-project/41 \                       # code/number 또는 raw postId
  --workflow "진행 중" \                         # 이름 lookup 후 setPostWorkflow 후속 호출
  --milestone "Sprint 17"                        # 이름 lookup
```

resolver 모호성 (이름 부분일치 복수 매칭) 시 에러 + 후보 목록 출력.

`post edit` 에서 사후 태그 변경 (`--tag`/`--tag-clear`/`--tag-remove`) 도 동일 정책 (Issue #66, ADR-019 확장):

```
# 기존 태그 유지 + 신규 추가 (dedupe)
dooray post edit --id <postId> --tag "분류: <name>"

# 기존 태그 전부 비우고 신규만
dooray post edit --id <postId> --tag-clear --tag "분류: <name>"

# 특정 태그만 제거 (기존 유지)
dooray post edit --id <postId> --tag-remove "분류: <name>"
```

`--title`/`--body` 없이 단독 호출 허용 — 기존 본문 자동 재전송.
mandatory tag 그룹 위반 시 친절한 에러.

## 업무 워크플로우 변경 흐름

```
dooray post done my-project 42                  # 완료 상태로
dooray post workflow my-project 42 "review"     # 임의 상태로 (이름 또는 class)
```

## 위키 흐름

```
dooray wiki list my-project                      # 위키 페이지 목록
dooray wiki tree my-project                      # 페이지 계층 트리 (root 부터 재귀)
dooray wiki tree my-project --depth 2            # 손자까지만
dooray wiki get my-project <page-id>             # 페이지 조회
dooray wiki create my-project --title "설계" --body-file design.md
dooray wiki edit my-project <page-id>            # $EDITOR 수정
dooray wiki page delete my-project <page-id>     # 페이지 삭제 (confirm 기본, --yes 로 생략)
```

## 메신저 흐름 (Issue #88, ADR-033)

빠른 알림·배포 요청을 CLI/에이전트가 메일보다 즉시성 있게 전송.

```
# 1:1 DM — 받는 사람은 organizationMemberId 또는 이메일 (이름 미지원)
dooray messenger send --to user@example.com --body "배포 완료됐습니다"
dooray messenger send --to <memberId> --body-file ./notice.md

# 대화방 — channelId 또는 대화방 이름 (내가 속한 방)
dooray messenger channel-send --channel "배포알림" --body "v1.2.3 배포"
dooray messenger channel-send --channel <channelId> --body-file -   # stdin

# body 미지정 시 $EDITOR 진입 (comment 와 동일)
dooray messenger send --to <memberId>
```

## 위키 페이지 첨부파일 흐름 (Issue #70, ADR-029)

페이지 첨부파일을 CLI 로 관리.
post file 명령군과 mirror — UX 동일 (`<project> <page-id>` + `--id` + `--url` + positional URL 지원).

```
# 목록 (general 첨부 + inline image 둘 다 표시)
dooray wiki page file list my-project <page-id>

# 업로드 (기본 general — 페이지 하단 첨부 영역)
dooray wiki page file upload my-project <page-id> --file ./SKILL.md
# stdout: attachFileId + 본문 삽입용 markdown snippet 안내

# 인라인 이미지 업로드 (본문 markdown 은 사용자가 직접 박음 — 자동 합성 안 함)
dooray wiki page file upload my-project <page-id> --file ./diagram.png --type inline_image

# 다운로드
dooray wiki page file download my-project <page-id> --file-id <id> -o ./

# 페이지 모든 첨부 일괄 다운로드
dooray wiki page file download-all my-project <page-id> -o ./attachments/

# 삭제 (post file delete 와 동일 — confirm 없이 즉시)
dooray wiki page file delete my-project <page-id> --file-id <id>
```

활용 사례 — 팀 위키에 스킬 파일 첨부 → 팀원이 `wiki page file download-all` 로 일괄 받아 `~/.claude/skills/` 에 그대로 설치.

## 위키 페이지 댓글 흐름 (task 036)

post comment 명령군과 동일 UX. 단 wiki comment 는 mention / cc / 첨부 파일 미지원 (Dooray API 부재).

```
# 목록 (최신순)
dooray wiki page comment list <project> <page-id>
dooray wiki page comment list <project> <page-id> --size 50

# 최신 1건 shortcut
dooray wiki page comment latest <project> <page-id>

# 단일 조회
dooray wiki page comment get <project> <page-id> <comment-id>

# 추가 — interactive ($EDITOR) 또는 옵션
dooray wiki page comment add <project> <page-id>                       # $EDITOR
dooray wiki page comment add <project> <page-id> --body "..." 
dooray wiki page comment add <project> <page-id> --body-file ./note.md
echo "댓글 본문" | dooray wiki page comment add <project> <page-id> --body -

# 수정 — interactive ($EDITOR) 또는 옵션
dooray wiki page comment edit <project> <page-id> <comment-id> --body "..."

# 삭제 (confirm 없이 즉시)
dooray wiki page comment delete <project> <page-id> <comment-id>
```

활용 사례 — 회의록 위키 페이지에 자동화 봇이 결정사항 댓글로 누적, 토론 흐름 추적.

## 피드백 흐름 (ADR-022/023)

`dooray feedback` 은 GitHub issue 를 `gh` CLI 위임으로 자동 등록.

```
dooray feedback                                  # 인터랙티브 ($EDITOR)
dooray feedback --title "버그" --body-file bug.md --label bug
dooray feedback --last                           # 직전 명령 sanitized argv + 에러 자동 첨부 (opt-in)
```

`--last` 사전 활성화: `dooray config set track-last-run true`.
시크릿 패턴 (`--api-key=*`, `Authorization: Bearer *` 등) 자동 마스킹.

## 파이프라인 활용

```bash
# JSON 출력 → jq 가공
dooray post list my-project --json | jq '.[] | select(.priority == "high")'

# 조용한 출력 (ID만)
dooray post list my-project --quiet | xargs -I{} dooray post done my-project {}
```

## 첨부파일 흐름

```
dooray post file list my-project 42                    # 첨부파일 목록
dooray post file download my-project 42 <file-id>     # 단일 다운로드
dooray post file download-all my-project 42 -o ./files # 전체 다운로드
dooray post file upload my-project 42 ./report.pdf     # 업로드
dooray post file delete my-project 42 <file-id>        # 삭제
```

업로드·다운로드 시 Dooray API는 307 리다이렉트로 파일 서버 URL을 반환한다.
CLI가 자동 처리하므로 사용자는 신경 쓸 필요 없다.

## 메일 흐름

```
dooray config set imap-username your@email.com         # 최초 1회 설정
dooray config set imap-password <app-password>

dooray mail list                                        # 최근 메일 목록
dooray mail list --unread                               # 안읽은 메일만
dooray mail list --search "키워드"                      # 제목 검색
dooray mail get <uid>                                   # 메일 상세

dooray mail send --to "a@b.com" --subject "제목" --body "본문"
dooray mail reply <uid> --body "답장 내용"              # 스레드 유지
```
