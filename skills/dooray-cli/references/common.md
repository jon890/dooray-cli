# common

설치, 초기 설정, 출력 모드, Dooray API 제약사항, 피드백 등록, 에러 핸들링, 캐시, projectId 직접 입력을 다룬다.

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

## Claude Code 스킬 관리

```bash
dooray skill status          # 설치 상태 확인
dooray skill install         # 최초 설치
dooray skill update          # 현재 CLI 버전의 스킬로 갱신
dooray skill status --json   # SkillStatus 객체 출력
dooray skill status --quiet  # 상태 토큰만 출력
```

상태 토큰:

| 상태 | 의미 | 복구 |
|---|---|---|
| `missing` | 설치 경로가 없음 | `dooray skill install` |
| `current` | 현재 CLI 버전의 스킬 링크 | 조치 없음 |
| `outdated` | 다른 버전의 dooray-cli 스킬 링크 | `dooray skill update` |
| `broken` | 링크 대상이 사라짐 | `dooray skill update` |
| `corrupt` | 관리 저장소 manifest가 없거나 형식·경로·해시가 맞지 않음 | 내용 확인 후 `dooray skill update --force` |
| `unmanaged` | 직접 만든 파일·디렉터리 또는 알 수 없는 링크 | 내용 확인 후 `dooray skill update --force` |
| `modified` | 관리형 저장소 전환 뒤 사용자 수정이 감지된 상태 | 내용 확인 후 `dooray skill update --force` |

`install`과 `update`는 같은 안전한 전환 로직을 사용한다.
스킬은 npm 패키지 경로를 직접 가리키지 않고 관리 저장소를 거쳐 연결된다.
절대 경로 `XDG_DATA_HOME`이 있으면 `$XDG_DATA_HOME/dooray-cli/skills/`를 사용하고, 없거나 상대 경로이면 `~/.local/share/dooray-cli/skills/`를 사용한다.
Node 버전 관리자로 전역 npm 설치 경로가 바뀌어도 활성 링크는 관리 저장소를 계속 가리킨다.
관리되지 않는 기존 항목, 수정된 관리 저장소, 손상된 manifest는 기본적으로 덮어쓰지 않는다.
`--force`를 사용하면 기존 활성 항목을 `.backup-<timestamp>` 경로로 옮긴 뒤 현재 CLI 스킬 링크로 교체한다.
같은 관리 저장소 경로가 수정되었거나 손상되었으면 별도 격리 백업을 만든 뒤 새 저장소로 복구한다.

Node 버전 관리자를 사용하면 전역 npm 설치 경로가 Node 버전별로 달라질 수 있다.
CLI를 최신 버전으로 다시 설치한 뒤에는 `dooray skill update`를 명시적으로 실행해 새 스킬 파일을 반영한다.

## 출력 모드

| 플래그 | 설명 | 용도 |
|--------|------|------|
| (없음) | 사람이 읽기 좋은 테이블 | 기본 |
| `--json` | JSON 출력 (stdout) | 파싱, 체이닝 |
| `--quiet` | ID만 출력 | 스크립팅 |

**AI 에이전트는 `--json`을 사용하여 구조화된 데이터를 파싱하라.**

---

## 제약사항 (Dooray API 한계)

CLI로 처리 **불가능한** 작업. 아래 항목을 요청받으면 웹 UI 사용을 안내할 것.

| 작업 | 대체 경로 | 근거 |
|---|---|---|
| 위키 페이지 이동 (상위 페이지 변경) | 웹 UI (`https://{tenant}.dooray.com/wiki/...`) | Dooray REST API 미지원 |
| 프로젝트 삭제 | 웹 UI (admin 페이지) | API 미지원 |

위키 페이지를 잘못 만든 경우(테스트/중복)는 `dooray wiki page delete <project> <page-id>` 로 정리한다.
공식 문서화된 endpoint 가 아니라 서버 정책이 바뀌면 동작이 달라질 수 있음에 유의한다.

---

## 피드백 (GitHub Issue 등록)

`dooray feedback` 명령으로 dooray-cli GitHub issue를 직접 등록한다 (`gh` CLI 위임).

```bash
# 논인터랙티브 (non-interactive — 에이전트 자동화용)
dooray feedback --title "버그 제목" --body "재현 방법" --label "bug"

# --last 모드 (직전 에러 자동 첨부 — track-last-run 활성화 필요)
dooray config set track-last-run true
dooray feedback --last --title "에러 제목" --body "추가 설명" --dry-run  # 미리보기
dooray feedback --last --title "에러 제목" --body "추가 설명"            # 실제 등록
```

> **참고**: `--last` 모드는 `trackLastRun: true` (opt-in)가 설정된 경우에만 직전 실패 명령이 자동 기록됨.
> argv는 시크릿 패턴(`--api-key`/`--token`/`Authorization`) 마스킹 후 저장.


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

## projectId 직접 입력 시나리오

AI agent 가 `member=me` 응답에 없는 프로젝트의 업무를 다뤄야 할 때:

1. **사용자가 projectId (15+자리 numeric) 를 줬으면 그대로 명령에 사용**:
   ```bash
   dooray post search 1234567890123456789 "keyword"
   ```

2. **사용자가 코드만 줬고 cache 매칭 실패 (member 아닌 프로젝트)**:
   - 에러 메시지의 안내 확인
   - 사용자에게 "프로젝트 ID 가 필요합니다 — Dooray UI 의 프로젝트 URL 에서 확인 가능" 요청
   - 또는 `dooray project list --type private` 로 private 캐시 갱신 시도

3. **권한 없는 projectId 입력 시**: resolver 통과 후 후속 API 4xx 발생 — 에러 메시지에서 권한 부재 확인 후 사용자에게 보고

권한 검증이 resolver 단보다 한 단계 지연되는 trade-off — AI 친화적 자동화 우선.


## 캐시

프로젝트, 멤버, 워크플로우, 위키 정보는 `~/.dooray/cache/`에 캐시된다.
캐시가 오래된 것 같으면:

```bash
dooray cache clear   # 전체 캐시 삭제 (다음 실행 시 자동 갱신)
```
