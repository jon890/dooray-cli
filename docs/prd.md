# PRD — dooray-cli

## 한 줄 정의

Dooray REST API를 CLI로 래핑해 AI 에이전트와 터미널 사용자가 자연어로 Dooray를 조작할 수 있게 한다.

## 문제

MCP 도구는 AI가 API 결과를 수동으로 가공해야 하고, 반복 작업·파이프라인·스크립팅에 부적합하다.
CLI는 터미널이 있는 환경이면 어디서든 동작하고, 자연스러운 반복 작업·파이프라인·자동화가 가능하다.

## 타겟

- AI 에이전트 (Claude Code 등) — Dooray 작업 자동화
- 터미널 사용자 — Dooray UI 없이 빠른 조작
- Dooray를 사용하는 한국 회사 개발자

## 핵심 가치

1. **자연어 식별자** — 숫자 ID 대신 프로젝트 코드·멤버 이름·업무 번호로 조작
2. **단일 바이너리 배포** — `npm i -g @bifos/dooray-cli` 또는 `npx @bifos/dooray-cli`
3. **파이프라인 친화** — `--json` flag로 raw output, `--quiet`로 ID만 출력
4. **안전한 자동화** — 되돌릴 수 없는 삭제는 확인을 기본으로 하고, 비대화형 실행은 명시적 `-y`/`--yes`에서만 허용

## MVP 범위 (v1)

### 포함

- `dooray setup` — 대화형 초기 설정 마법사 (API endpoint·API key·메일 설정·Claude Code 스킬 설치)
- `dooray skill` — Claude Code 스킬 설치 상태 조회·설치·갱신. Node 전역 설치 경로가 바뀌어도 명시적으로 최신 상태 복구
- `dooray config` — API key·base URL·IMAP/SMTP 설정 (개별 수동 관리)
- `dooray doctor` — 설정·연결 검증
- `dooray cache` — 캐시 관리
- `dooray project` — 목록·멤버·워크플로우·템플릿 조회, 태그 조회와 생성
  - 태그: `project tags create` 로 `"그룹:태그"` 생성, `project tags group` 으로 그룹의 필수·단일선택 속성 변경 (ADR-041)
- `dooray member` — 표시명/이메일 조회 (`get`/`list`, ADR-021)
- `dooray post` — 목록·검색·조회·생성·수정($EDITOR)·완료·상태변경
  - 메타데이터: `--tag`, `--parent`, `--workflow`, `--milestone` (ADR-019)
  - 인터랙션: `--mention`, `--mention-group`, `--link-task`, `--dry-run` (post comment 도 동일)
  - 참조자·담당자: `--cc`, `--cc-group`, `--cc-clear`, `--to`, `--to-group`, `--to-clear` (post edit; post create 는 `--*-group` 만 — ADR-025)
  - 상위 업무 변경: `post edit --parent <ref>` (dedicated `set-parent-post` endpoint, top-level 해제는 웹 UI)
  - 정형 task: `post create --template <name|id>` (ADR-027, `project templates` 명령으로 목록 조회)
- `dooray post comment` — 목록·추가·수정($EDITOR)·삭제
- `dooray post file` — 목록·다운로드·전체다운로드·업로드·삭제 (v0.3.0)
- `dooray post comment file` — 댓글 첨부 파일 목록·업로드·다운로드·삭제 (댓글 조회·수정 API와 post-level files API 조합, ADR-024)
  - 업로드는 이미지 파일을 인라인 이미지로, 그 외 파일을 클릭 가능한 링크로 댓글 본문에 추가한다.
  - 웹 UI에서 직접 첨부한 파일은 댓글 조회 API에 연결 정보가 없을 수 있어 댓글 단위 목록에서 제외될 수 있다.
- `dooray wiki` — 목록·페이지 조회·생성·수정($EDITOR)·트리 조회 (`wiki tree` 레벨별 재귀 drill-down, ADR-034, Issue #101)
- `dooray wiki page file` — 페이지 첨부 파일 목록·업로드·다운로드·전체다운로드·삭제 (multipart `type` 순서 의존 ADR-029, Issue #70)
- `dooray wiki page comment` — 페이지 댓글 목록·최신·조회·추가·수정·삭제 (post comment 패턴 mirror, mention/cc/file 부재 — WikiComment 시그니처 차이)
- `dooray mail` — 목록·조회·검색·발송·답장 (v0.2.0)
- `dooray feedback` — `gh` CLI 위임으로 GitHub 이슈 자동 생성 (`--last` 옵션으로 직전 명령 sanitized argv와 에러 자동 첨부, ADR-022/023)
- `dooray messenger` — 1:1 다이렉트 메시지 (`send`) / 대화방 메시지 (`channel-send`) 전송 (`--to` id·email, `--channel` id·이름, ADR-033)
- `skills/dooray-persona` — Dooray 에 쌓인 본인 글을 수집해 업무 글 문체 문서를 만드는 워크플로우 스킬. CLI 명령이 아니라 저장소를 내려받아 쓰는 자산이다 (ADR-038)

### 제외 (v1)

- 알림 설정
- 멀티 계정·프로파일

## 성공 지표

- `dooray post list my-project` 3초 이내 응답 (캐시 히트 기준)
- 숫자 ID 없이 주요 CRUD 전부 완료 가능
