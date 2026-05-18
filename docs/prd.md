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

## MVP 범위 (v1)

### 포함

- `dooray setup` — 대화형 초기 설정 마법사 (API endpoint·API key·메일 설정·Claude Code 스킬 설치)
- `dooray config` — API key·base URL·IMAP/SMTP 설정 (개별 수동 관리)
- `dooray doctor` — 설정·연결 검증
- `dooray cache` — 캐시 관리
- `dooray project` — 목록·멤버·워크플로우·템플릿 조회
- `dooray member` — 표시명/이메일 조회 (`get`/`list`, ADR-021)
- `dooray post` — 목록·검색·조회·생성·수정($EDITOR)·완료·상태변경 + `--tag`/`--parent`/`--workflow`/`--milestone` 메타데이터 (ADR-019) + `--mention`/`--mention-group`/`--link-task`/`--dry-run` (post comment 도 동일) + `--cc`/`--cc-group`/`--cc-clear`/`--to`/`--to-group`/`--to-clear` 참조자·담당자 추가/수정 (post edit, post create 는 `--*-group` 만 — ADR-025) + `post edit --parent <ref>` 상위 업무 변경 (dedicated `set-parent-post` endpoint — top-level 해제는 웹 UI) + `post create --template <name|id>` 정형 task (ADR-027, `project templates` 명령으로 목록 조회)
- `dooray post comment` — 목록·추가·수정($EDITOR)·삭제
- `dooray post file` — 목록·다운로드·전체다운로드·업로드·삭제 (v0.3.0)
- `dooray post comment file` — 댓글 첨부 파일 목록·업로드·다운로드·삭제 (post-level files API + 댓글 PUT 합성, ADR-024)
- `dooray wiki` — 목록·페이지 조회·생성·수정($EDITOR)
- `dooray mail` — 목록·조회·검색·발송·답장 (v0.2.0)
- `dooray feedback` — `gh` CLI 위임으로 GitHub 이슈 자동 생성 (`--last` 옵션으로 직전 명령 sanitized argv + 에러 자동 첨부, ADR-022/023)

### 제외 (v1)

- 알림 설정
- 멀티 계정·프로파일

## 성공 지표

- `dooray post list my-project` 3초 이내 응답 (캐시 히트 기준)
- 숫자 ID 없이 주요 CRUD 전부 완료 가능
