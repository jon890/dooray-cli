---
name: dooray-cli
description: Dooray 업무 관리 CLI. 프로젝트/업무/댓글/위키 조회·생성·수정. AI 에이전트가 두레이 업무를 자동화할 때 사용.
---

# dooray-cli

NHN Dooray REST API를 래핑한 CLI 도구. 업무 조회, 생성, 수정, 댓글, 위키 등을 터미널에서 수행한다.

## 설치

```bash
npm install -g @bifos/dooray-cli
```

## 초기 설정

대화형 마법사로 한 번에 설정:

```bash
dooray setup   # API endpoint 선택, API key 입력, 메일 설정까지 대화형으로 진행
```

또는 개별 수동 설정:

```bash
dooray config set base-url https://api.dooray.com
dooray config set api-key <YOUR_API_TOKEN>   # https://{org}.dooray.com/setting/api/token
dooray doctor                                 # 설정 검증
```

## 출력 모드

| 플래그 | 설명 | 용도 |
|--------|------|------|
| (없음) | 사람이 읽기 좋은 테이블 | 기본 |
| `--json` | JSON 출력 (stdout) | 파싱, 체이닝 |
| `--quiet` | ID만 출력 | 스크립팅 |

**AI 에이전트는 `--json`을 사용하여 구조화된 데이터를 파싱하라.**

---

## 의도 → 커맨드 매핑

자연어 요청을 커맨드로 변환할 때 아래 표를 참고한다.

| 의도 | 커맨드 |
|------|--------|
| 초기 설정 (대화형) | `dooray setup` |
| 프로젝트 찾기 | `dooray project list --search <keyword>` |
| 개인 프로젝트 목록 | `dooray project list --type private` |
| 프로젝트 멤버 보기 | `dooray project members <project>` |
| 업무 목록 조회 | `dooray post list <project>` |
| 업무 검색 | `dooray post search <project> "<keyword>"` |
| 업무 상세 보기 | `dooray post get <project> <number>` |
| 업무 생성 | `dooray post create <project> --title "..." --body "..."` 또는 `--body-file <path>` (`--body`와 `--body-file`은 동시 사용 불가, `--tag`/`--parent`/`--workflow`/`--milestone` 지원) |
| 업무 제목/본문 수정 | `dooray post edit <project> <number> --title "..." --body "..."` 또는 `--body-file <path>` |
| 업무 완료 처리 | `dooray post done <project> <number>` |
| 업무 워크플로우 변경 | `dooray post workflow <project> <number> <workflow>` |
| 댓글 조회 | `dooray post comment list <project> <number>` |
| 댓글 추가 | `dooray post comment add <project> <number> --body "..."` 또는 `--body-file <path>` |
| 댓글 수정 | `dooray post comment edit <project> <number> <comment-id> --body "..."` 또는 `--body-file <path>` |
| 댓글 삭제 | `dooray post comment delete <project> <number> <comment-id>` |
| 위키 목록 | `dooray wiki list` |
| 위키 페이지 목록 | `dooray wiki pages <project>` |
| 위키 페이지 상세 | `dooray wiki page get <project> <page-id>` |
| 위키 페이지 생성 | `dooray wiki page create <project> --title "..." [--parent <page-id>] [--body "..."]` (--parent 생략 시 위키 home 페이지 아래 생성) |
| 위키 페이지 수정 (제목) | `dooray wiki page edit <project> <page-id> --title "..."` |
| 위키 페이지 수정 (본문) | `dooray wiki page edit <project> <page-id> --body "..."` 또는 `--body-file ./new.md` |
| 위키 페이지 수정 (에디터) | `dooray wiki page edit <project> <page-id>` (플래그 없으면 $EDITOR 열림) |
| 메일 목록 조회 | `dooray mail list` |
| 안읽은 메일 | `dooray mail list --unread` |
| 메일 제목 검색 | `dooray mail list --search "<keyword>"` |
| 메일 상세 | `dooray mail get <uid>` |
| 메일 발송 | `dooray mail send --to "..." --subject "..." --body "..."` |
| 메일 답장 | `dooray mail reply <uid> --body "..."` |
| 첨부파일 목록 | `dooray post file list <project> <number>` |
| 첨부파일 다운로드 | `dooray post file download <project> <number> <file-id>` |
| 전체 첨부파일 다운로드 | `dooray post file download-all <project> <number>` |
| 첨부파일 업로드 | `dooray post file upload <project> <number> <file-path>` |
| 첨부파일 삭제 | `dooray post file delete <project> <number> <file-id>` |

> **제목 옵션 네이밍**: `post` 와 `wiki page` 모두 `--title` 표준. `post`의 `--subject`는 deprecated alias로 당분간 동작하되, 새 코드에서는 `--title` 사용을 권장.

---

## 제약사항 (Dooray API 한계)

CLI로 처리 **불가능한** 작업. 아래 항목을 요청받으면 웹 UI 사용을 안내할 것.

| 작업 | 대체 경로 | 근거 |
|---|---|---|
| 위키 페이지 **삭제** | 웹 UI (`https://{tenant}.dooray.com/wiki/...`) | Dooray REST API에 해당 엔드포인트 없음 (위키 댓글·첨부파일 삭제는 있지만 페이지 자체는 없음, `docs/dooray-api-reference.md` §7 참조) |
| 프로젝트 삭제 | 웹 UI (admin 페이지) | API 미지원 |

위키 페이지를 잘못 만든 경우(테스트/중복) **soft delete(빈 제목·본문) 우회 금지** — 페이지가 트리에 남아 사용자 혼란 유발.

---

## 워크플로우 판단 기준

1. **"내 프로젝트", "개인 프로젝트" 언급 시** → `dooray project list --type private --json` 으로 개인 프로젝트 먼저 조회
2. **프로젝트 코드를 모르면** → `dooray project list --search <keyword>` 로 먼저 찾기
3. **업무 번호를 모르면** → `dooray post search <project> "<keyword>"` 로 검색
4. **워크플로우 이름을 모르면** → `dooray project workflows <project>` 로 확인
5. **멤버 이름을 모르면** → `dooray project members <project>` 로 확인
6. **결과를 다음 액션에 사용하려면** → `--json` 플래그로 구조화된 데이터 획득

---

## 체이닝 예시

### 업무 찾아서 완료 처리

```bash
# 1. 업무 검색으로 번호 확인
dooray post search tc-ocr "graceful shutdown" --json
# → [{ "number": 42, "subject": "graceful shutdown 구현", ... }]

# 2. 완료 처리
dooray post done tc-ocr 42
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
dooray post get tc-ocr 42 --json

# 2. 댓글 추가
dooray post comment add tc-ocr 42 --body "진행 상황 업데이트: 80% 완료"
```

### 위키 페이지 조회

```bash
# 1. 위키 페이지 목록
dooray wiki pages tc-ocr --json
# → [{ "id": "3052841366755571094", "subject": "설계 문서", ... }]

# 2. 페이지 내용 조회
dooray wiki page get tc-ocr 3052841366755571094 --json
```

---

## 커맨드 상세

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
  --parent "tc-ocr/337" \       # "code/number" 또는 raw postId 두 형태만 허용
  --workflow "진행 중" \         # 이름 또는 class (registered/working/closed). 부분일치 모호 시 후보 + 에러
  --milestone "Sprint 12"
```

본문이 길면 파일로 (`--body`와 `--body-file`은 함께 사용 불가):
```bash
dooray post create <project> --title "제목" --body-file ./content.md
```

> **`--workflow` 동작 주의**: 워크플로우 설정은 post 생성 *후속* 호출이므로, 워크플로우 resolve/설정에 실패해도 stderr 경고만 출력되고 **exit code는 0** (post는 이미 생성됨). 자동화 스크립트에서 워크플로우 적용 여부를 보장해야 하면 stderr를 별도 점검할 것.

### 업무 수정 (non-interactive)

```bash
# 제목만 변경
dooray post edit <project> <number> --title "새 제목"

# 본문만 변경
dooray post edit <project> <number> --body "새 본문"

# 제목 + 본문 동시 변경
dooray post edit <project> <number> --title "새 제목" --body-file ./updated.md
```

### 댓글 추가 (non-interactive)

```bash
dooray post comment add <project> <number> --body "댓글 내용"
dooray post comment add <project> <number> --body-file ./comment.md
```

---

## 에러 핸들링

CLI 에러 발생 시 복구 방법:

| 에러 메시지 | 원인 | 복구 방법 |
|------------|------|-----------|
| `프로젝트를 찾을 수 없습니다: xxx` | 프로젝트 코드/ID 오류 | `dooray project list --search "xxx"` 로 정확한 코드 확인 |
| `복수의 멤버가 매칭됩니다: "김"` | 이름이 모호함 | 에러 메시지의 후보 목록에서 정확한 이름으로 재시도 |
| `멤버를 찾을 수 없습니다: xxx` | 해당 프로젝트에 멤버 없음 | `dooray project members <project>` 로 멤버 목록 확인 |
| `워크플로우를 찾을 수 없습니다: xxx` | 워크플로우 이름 오류 | `dooray project workflows <project>` 로 확인 |
| `API 호출 실패 (401)` | API 키 만료/오류 | `dooray doctor` 로 설정 검증 |

---

## 캐시

프로젝트, 멤버, 워크플로우, 위키 정보는 `~/.dooray/cache/`에 캐시된다.
캐시가 오래된 것 같으면:

```bash
dooray cache clear   # 전체 캐시 삭제 (다음 실행 시 자동 갱신)
```
