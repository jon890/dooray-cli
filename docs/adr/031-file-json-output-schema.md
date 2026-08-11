## ADR-031: file 명령군 `--json` 출력 스키마 통일

**결정**: `post file` (`upload` / `download` / `download-all` / `delete`), `wiki page file` 동의 4 명령 = **8 명령** 의 `--json` 출력 스키마 통일.
부분 실패 / quiet 모드 / parse 일관성을 두 명령군 mirror.

명령별 스키마:
- `upload`: `printJson(res.result)` — 서버 응답 raw (id / attachFileId / name / mimeType / size / type / createdAt)
- `download`: `{ outputPath, fileName, size }`
- `download-all`: `{ count, succeeded: [{path, fileName}], failed: [{fileId, error}] }` — 부분 실패 명시. failed 가 있으면 exit code non-zero
- `delete`: `{ fileId, status: "deleted" }`

quiet 모드 (`--quiet`):
- `upload` / `delete`: `id` 또는 `fileId` 만
- `download`: `outputPath` 만
- `download-all`: 각 성공 path 한 줄씩

**맥락**: PR #72 review (Issue #73 follow-up) 에서 `wiki page file` 5 명령 중 `list` 만 `--json` 지원하고 나머지는 plain text — parse 일관성 부재.
post file 도 `upload` 만 `--json` 동작 (Issue #73 본문 가정과 달리 4 명령은 plain text).
두 명령군이 mirror 라 한쪽만 강화하면 비대칭. 동시 강화로 자동화 스크립트가 두 명령군을 동일 코드로 parse 가능.

**대안 기각**:
- post file 은 그대로, wiki page file 만 강화 — 비대칭. 동일 패턴인데 다른 출력 형식이라 자동화 비용 ↑
- raw `res.result` 그대로 출력 — download 는 buffer 수신 후 파일 저장이라 server response 의미 약함. download-all 은 다중 파일이라 raw 부적합
- 부분 실패에 별도 exit code (예: 2) — 기존 정책 (1 = API 오류) 과 분리 의도 약함. failed 배열, exit 1 로 충분
- `--json` 시 quiet 무시 — quiet 가 `--json` 의 sub-mode 가 아니라 독립 출력 정책. 두 옵션 모두 지원 (quiet 우선)

**적용 범위**:
- 8 명령 파일 (`src/commands/{post,wiki}/{file,page-file}/{upload,download,download-all,delete}.ts`)
- `--json` 분기: `if (globalOpts.json) printJson(scheme)` — 기존 `formatters/table.ts` 의 `printJson` 헬퍼 재사용
- `--quiet` 분기: `else if (globalOpts.quiet) process.stdout.write(<id|path>)`
- 표준 출력: `else { ... 기존 plain text }`
- 부분 실패 (`download-all`): `failed.length > 0 → process.exitCode = 1`
- 단위 테스트: 각 명령별 `--json` / `--quiet` / plain 3 모드, `download-all` 의 부분 실패 케이스

**트레이드오프**:
- 8 파일 일괄 수정 — scope 크지만 동일 패턴 복제라 회귀 위험 낮음
- `download-all` 의 failed 배열 표현이 sequential 호출 (ADR-024 patterns) 의 partial-failure 정책 (`docs/pitfalls/code-review/sequential-endpoint-partial-failure-missing.md`) 과 일관

**보강 (Issue #81, 2026-06)**: `wiki page file upload` 의 `--json` 출력에 inline_image 시 `markdownSnippet` 필드 추가.
`--quiet` 은 "id 만" 원칙 유지 (snippet 미포함).
plain 모드 snippet 과 동일 문자열을 `wikiInlineImageSnippet` 헬퍼로 단일화한다.
general 타입은 변경 없음.
