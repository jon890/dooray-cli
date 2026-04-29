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
dooray post search my-project "스프린트"   # 4) 제목 검색
```

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
4. frontmatter 파싱 → member resolver → API PUT 호출

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

TTL: projects·members 1시간 / workflows 24시간

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

업로드·다운로드 시 Dooray API는 307 리다이렉트로 파일 서버 URL을 반환한다. CLI가 자동 처리하므로 사용자는 신경 쓸 필요 없다.

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
