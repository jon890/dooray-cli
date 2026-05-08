# ADR — dooray-cli 기술 결정 기록

## ADR Index

각 ADR 한 줄 요약. 상황별 코드 작업 시 참조 ADR 은 [`CLAUDE.md` "상황별 ADR 필수 참조" 표](../CLAUDE.md) 에서 빠르게 찾는다.

- [ADR-001](#adr-001) — TypeScript (Node.js) 선택
- [ADR-002](#adr-002) — ky (HTTP 클라이언트)
- [ADR-004](#adr-004) — 디스크 캐시 (project·member·workflow)
- [ADR-005](#adr-005) — postNumber 를 Post 식별자로 사용
- [ADR-006](#adr-006) — $EDITOR 기반 수정 플로우
- [ADR-007](#adr-007) — config 파일 전용 (env var 폴백 없음)
- [ADR-008](#adr-008) — 멤버 모호성: 에러 + 후보 출력
- [ADR-010](#adr-010) — 캐시 파일 분리 (디렉토리 기반)
- [ADR-012](#adr-012) — IMAP 메일 연동
- [ADR-013](#adr-013) — SMTP 메일 발송
- [ADR-014](#adr-014) — TypeScript Path Alias 보류
- [ADR-015](#adr-015) — 파일 첨부 API 307 리다이렉트 수동 처리
- [ADR-016](#adr-016) — `dooray setup` 대화형 초기 설정 마법사
- [ADR-017](#adr-017) — `api/types.ts` 단일 파일 유지
- [ADR-018](#adr-018) — `dooray setup` 에서 Claude Code 스킬 설치
- [ADR-019](#adr-019) — `post create` 메타데이터 옵션 (`--tag`/`--parent`/`--workflow`/`--milestone`)
- [ADR-020](#adr-020) — post 명령 input 통합 (`--id`/URL/positional) + 첫 테스트 인프라 (vitest)
- [ADR-021](#adr-021) — `member` 명령 + `comment list` Creator 이름 자동 채우기
- [ADR-022](#adr-022) — `dooray feedback` 명령 + GitHub 호출은 `gh` CLI 위임
- [ADR-023](#adr-023) — `dooray feedback --last` last-run 추적 (opt-in + 에러시만 + 최소 세트 + argv 패턴 마스킹)
- [ADR-024](#adr-024) — `dooray post comment file *` (post-level files API + 댓글 PUT 합성)

---

<a id="adr-001"></a>

## ADR-001: TypeScript (Node.js) 선택

**결정**: Kotlin(기존 MCP 서버) 대신 TypeScript로 새로 작성

**이유**:

- 팀의 주력 스택이 TypeScript → 개발 속도 우선
- npm 생태계로 `npx @bifos/dooray-cli` 즉시 배포 가능
- CLI 툴 생태계(Commander, chalk, ora 등)가 Node.js에서 가장 성숙

**대안 기각**: Kotlin MCP 서버 코드 재사용 포기 → 다른 ADR과 형식 일관성 확보. types.ts 포팅 비용은 1일 내라 상쇄 가능.

---

<a id="adr-002"></a>

## ADR-002: ky (HTTP 클라이언트)

**결정**: axios 대신 ky 사용

**이유**:

- Node 18+ native fetch 기반 → 추가 의존성 없음
- 번들 크기 3KB vs axios 13KB
- TypeScript 타입 기본 제공
- CLI 툴에서 axios의 XMLHttpRequest 레거시 불필요

**제약**: Node 18+ 필수 (`engines: { node: ">=18" }` 명시)

---

<a id="adr-004"></a>

## ADR-004: 디스크 캐시 (project·member·workflow)

**결정**: `~/.dooray/cache.json`에 TTL 기반 캐시 저장

**이유**:

- CLI는 매 실행이 새 프로세스 → in-memory 캐시 불가
- project code·member 이름 → ID 변환 시 매번 API 호출 시 지연 발생
- TTL: projects·members 1h / workflows 24h (변경 빈도 기반)

**트레이드오프**: 캐시 stale 가능성 → `dooray cache refresh`로 수동 갱신 제공

---

<a id="adr-005"></a>

## ADR-005: postNumber를 Post 식별자로 사용

**결정**: 내부 UUID(postId) 대신 `postNumber`(정수)를 CLI 인터페이스로 노출

**이유**:

- Dooray UI에서 표시되는 번호와 동일 → 사용자가 UI 보고 바로 CLI 사용 가능
- 숫자라 기억·입력 용이 (GitHub Issue number와 동일 패턴)
- API의 `postNumber` 필터 파라미터로 postId 변환 가능

---

<a id="adr-006"></a>

## ADR-006: $EDITOR 기반 수정 플로우

**결정**: `dooray post edit` / `wiki page edit` 은 $EDITOR를 통한 수정

**이유**:

- `--body "..."` flag로 긴 마크다운 입력은 현실적으로 불가능
- `--body-file` + 별도 수정은 "기존 내용 조회 → 파일 저장 → 수정 → CLI 재실행" 4단계 필요
- $EDITOR 방식(`kubectl edit`, `git commit` 동일 패턴)은 1커맨드로 완결
- YAML frontmatter로 메타데이터(subject, priority, due_date, to, cc) + 본문 통합 편집

---

<a id="adr-007"></a>

## ADR-007: config 파일 전용 (env var 폴백 없음)

**결정**: API key를 환경변수로 받지 않음. `~/.dooray/config.json`만 사용

**이유**:

- API key는 민감 정보 → env var 노출은 보안 위험 (shell history, ps 출력 등)
- 설정 미완료 시 명확한 에러 + 가이드 출력이 더 나은 UX
- CI 환경 지원은 v1 범위 외

---

<a id="adr-008"></a>

## ADR-008: 멤버 모호성 — 에러 + 후보 출력

**결정**: 이름 검색 시 복수 매칭이면 인터랙티브 선택 대신 에러 출력

**이유**:

- AI 에이전트가 primary 사용자 → 인터랙티브 프롬프트는 자동화 파이프라인 차단
- 에러 메시지에 후보 목록 포함 → 에이전트가 다음 시도에 정확한 값 사용 가능

---

<a id="adr-010"></a>

## ADR-010: 캐시 파일 분리 (디렉토리 기반)

**결정**: 단일 `cache.json` 대신 `~/.dooray/cache/` 디렉토리에 타입별·프로젝트별 파일 분리

**이유**:

- 단일 파일 read-modify-write는 동시 CLI 실행 시 race condition 발생 가능
- 파일 분리로 members 쓰기가 projects를 덮어쓰지 않음
- 프로젝트별 멤버/워크플로우를 독립 파일로 관리 → 특정 프로젝트 캐시만 삭제 가능
- 파일별 `updatedAt`으로 TTL 독립 관리

**구조**: 자세한 파일 트리·스키마는 `docs/data-schema.md` 참조

---

<a id="adr-012"></a>

## ADR-012: IMAP 메일 연동

**결정**: Dooray IMAP 서버(imap.dooray.com)를 통해 메일 조회 기능 추가

**이유**:

- Dooray는 공식 메일 API를 제공하지 않으나 IMAP/SMTP를 지원
- 주간 업무 알림, 일정 알림 등 메일을 CLI에서 확인하여 생산성 향상
- `imapflow` (IMAP) + `mailparser` (파싱) 조합으로 구현

**서버 특성**:

- `SINCE` 날짜 검색 미지원 (서버 파서 버그)
- `SORT` 미지원 → UID 역순(최신순)으로 대체
- `SUBJECT`, `FROM`, `TO`, `UNSEEN`, `SEEN` 검색은 지원

**기본값 전략**: imap-host, imap-port, smtp-host, smtp-port는 기본값 제공 (Dooray 사용자 대다수 동일). 사용자는 imap-username, imap-password만 설정하면 됨.

**트레이드오프**: imapflow + mailparser 의존성 추가 → tsup에서 external 처리 필요 (번들 미포함, node_modules에서 로드)

---

<a id="adr-013"></a>

## ADR-013: SMTP 메일 발송

**결정**: nodemailer를 사용하여 Dooray SMTP(smtp.dooray.com:465)로 메일 발송

**이유**:

- 메일 조회(IMAP)만으로는 반쪽짜리 기능 → 발송까지 지원해야 CLI에서 메일 워크플로우 완결
- nodemailer는 Node.js 메일 발송 de facto 표준 (성숙, 안정)
- SMTP 인증은 IMAP과 동일한 자격증명 사용 → 추가 설정 불필요

**지원 기능**: send (to/cc/bcc/subject/body/html), reply (In-Reply-To로 스레드 유지)

**추후 고민**: 첨부파일(`--attach`) 지원

---

<a id="adr-014"></a>

## ADR-014: TypeScript Path Alias 보류

**결정**: `@/` 등 path alias 도입 보류

**이유**:

- 현재 `src/` 최대 깊이 3단계 (`commands/post/comment/`) → `../../`까지가 최대로 관리 가능한 수준
- tsup(esbuild)이 `tsconfig.json` paths를 자동 resolve하지 않아 별도 플러그인 필요 → 빌드 파이프라인 복잡도 증가
- 프로젝트 규모 대비 실익이 크지 않음

**재검토 시점**: 디렉토리 깊이가 4단계 이상으로 증가하거나 대규모 리팩토링 시

---

<a id="adr-015"></a>

## ADR-015: 파일 첨부 API 307 리다이렉트 수동 처리

**결정**: Dooray 파일 업로드/다운로드 시 307 리다이렉트를 수동 처리

**이유**:

- Dooray 파일 API는 307 Temporary Redirect로 실제 파일 서버 URL을 반환
- 브라우저/HTTP 클라이언트의 자동 리다이렉트는 Authorization 헤더와 요청 body를 strip → 인증 실패
- `redirect: "manual"`로 첫 응답의 Location 헤더를 캡처한 후, 해당 URL로 Auth 헤더를 포함한 2차 요청 필요

**구현**:

- 다운로드: `?media=raw` 쿼리 파라미터로 307 유도 → Location 헤더 캡처 → fetch로 2차 요청
- 업로드: `fetch` 직접 사용 (`ky`는 307 + `redirect: "manual"` 조합에서 정상 동작하지 않음)
- 2차 요청 시 동일한 Authorization 헤더 첨부
- 업로드: FormData + Blob, 다운로드: ArrayBuffer로 수신 후 파일 저장

---

<a id="adr-016"></a>

## ADR-016: `dooray setup` 대화형 초기 설정 마법사

**결정**: `dooray setup` 커맨드로 대화형 초기 설정 마법사 제공. `postinstall` 훅 대신 명시적 커맨드 방식 채택.

**이유**:

- `postinstall`은 CI/Docker 등 non-TTY 환경에서 실패, npm 정책상 interactive postinstall 비권장
- `dooray setup`은 언제든 재실행 가능, config 미설정 시 안내 메시지로 유도
- 재실행 시 기존 설정값을 기본값으로 표시하여 부분 수정 가능

**플로우**: 세부 단계는 `docs/flow.md` "최초 설정 — `dooray setup`" 섹션 참조.

**라이브러리**: `@inquirer/prompts` — 선택(select), 입력(input), 비밀번호(password), 확인(confirm) 프롬프트 지원. tsup CJS 번들 호환성 확인 필요.

**안전성**: Ctrl+C 시 config 파일 미저장 (부분 저장 방지). 모든 입력을 메모리에 수집한 뒤 마지막에 한 번만 writeFile.

**config 미설정 시 안내**: 기존 에러 메시지를 `dooray setup` 실행 유도로 변경.

---

<a id="adr-017"></a>

## ADR-017: api/types.ts 단일 파일 유지

**결정**: `api/types.ts`를 도메인별로 분리하지 않고 단일 파일로 유지

**이유**:

- 현재 ~440줄으로 분리 임계점(~800줄+)에 미달
- 섹션 주석으로 Common / Project / Post / Comment / Member / Workflow / Wiki / File 구분이 충분
- `DoorayApiHeader`, `DoorayApiResponse<T>` 등 Common 타입을 거의 모든 도메인이 참조 → barrel export 관리 오버헤드 대비 실익 부족
- `client.ts`에서 한 파일로 모든 타입을 import하는 현재 구조가 간결

**재검토 시점**: 800줄 이상이거나 새 도메인(Drive 등)이 2개 이상 추가될 때

---

<a id="adr-018"></a>

## ADR-018: `dooray setup` 에서 Claude Code 스킬 설치

**결정**: setup 마지막 단계에서 스킬 설치 여부를 물어보고 심볼릭 링크로 설치 (`~/.claude/skills/dooray-cli` → 패키지 내부 `skills/dooray-cli/`). idempotent 재실행 가능. npx 임시 경로 감지 시 경고 + skip (global install 전용).

**맥락**: 별도 `dooray install skills` 커맨드보다 setup 일원화가 UX 간결. 심볼릭 링크는 `npm update -g` 시 스킬도 자동 최신화 (유지보수 비용 0). `~/.claude/skills/` 의 다른 스킬 (gstack 등) 도 동일 패턴이라 일관성. 스킬 포맷은 Claude Code SKILL.md frontmatter 규격 — 타 에이전트 지원은 요청 시 확장.

**대안 기각**:
- `postinstall` 훅 — npm 정책상 interactive postinstall 비권장, CI/Docker 비-TTY 실패 (ADR-016 과 동일 사유)
- 파일 복사 — `npm update` 시 자동 최신화 안 됨, 사용자가 재설치 명령 알아야

세부 (origin 경로 / doctor 검증 / package.json `files` 필드) 는 `src/commands/setup.ts` + `src/commands/doctor.ts` 참조.

---

<a id="adr-019"></a>

## ADR-019: `post create` 메타데이터 옵션 (`--tag`/`--parent`/`--workflow`/`--milestone`)

**결정**: 4개 옵션 모두 이름 lookup. 클라이언트가 `tagGroup.mandatory` / `selectOne` 사전 검증. `--workflow` 만 create 후 `setPostWorkflow` 후속 호출 — 실패 시 `stderr` warn + `exit 0` (post 는 이미 생성됨).

**맥락**: mandatory-tag 정책 프로젝트는 CLI 로 단 한 건도 생성 불가 (Issue #18). API 의 `USER_INVALID_TAG_MANDATORY_PREFIX` 에러는 어느 그룹이 누락인지 안내 안 함 → 친절한 메시지 직접 생성 필요. 멤버만 부분일치였던 resolver 비대칭도 해소 (전체 정확→부분→모호+후보).

**대안 기각**:
- `--workflow` 실패 시 exit non-zero — post 가 이미 발급된 상태에서 전체 실패는 사용자가 두 번 만드는 혼란
- ID 직접 입력 허용 — `--workflow xxx-uuid` 같은 폴백은 거의 사용 안 되는 흐름, 복잡도만 ↑
- `--tag` 에 자릿수 휴리스틱 — ID 형식 변경 시 깨짐. `--parent` 만 `code/number` ↔ raw postId 분기

세부 시그니처·동작은 `src/commands/post/create.ts` + `src/resolvers/{tag,milestone,postRef}.ts` 참조. 캐시 디렉터리는 `data-schema.md`.

---

<a id="adr-020"></a>

## ADR-020: post 명령 input 통합 (`--id`/URL/positional) + 첫 테스트 인프라 (vitest)

**결정**: post 하위 명령에 3 가지 입력 모드 (기존 `<project> <post-number>` + `--id <postId>` + `--url <url>` + 첫 positional 이 Dooray URL 이면 자동) 도입. sub-id (`<comment-id>`, `<file-id>`) 는 옵션화 (positional 호환). 분기는 `resolvePostInput` 단일 헬퍼. 동시 사용은 명시적 에러. 첫 테스트 인프라로 vitest 도입.

**맥락**: Dooray URL 은 postId 만 포함 (`/task/to/{postId}`) — 동료가 URL 만 공유하면 project 코드 모르는 사용자가 CLI 사용 불가 (Issue #16). AI 에이전트도 사용자 메시지에서 URL 을 그대로 첫 인자로 전달하면 라우팅 부담 0. standalone API `GET /project/v1/posts/{postId}` 응답에 `project.{id,code}` 포함 → 한 lookup 으로 기존 코드 경로 재사용. 분기 규칙이 7 가지라 단위 테스트로 회귀 방지 필수.

**대안 기각**:
- positional 단일 `<ref>` 통합 (`<project>/337` | postId | URL) — 기존 두 인자 breaking, 영향 범위 ↑
- positional 1개 numeric → postId 자동 인식 — 19자리 임계는 임의값, ID 길이 변경 시 깨짐
- sub-id 를 인자 개수로 분기 — `comment edit <project> cmt-abc` 같은 사용자 실수에 모호한 에러
- `node:test` 빌트인 — mocking·watch·확장성에서 vitest 우위

분기 규칙·URL 정규식·테스트 케이스는 `src/resolvers/post-input.ts` + `src/utils/dooray-url.ts` 참조. 후속 (wiki input 통합, CI 통합) 은 별도 task.

---

<a id="adr-021"></a>

## ADR-021: `member` 명령 + comment list Creator 이름 자동 채우기

**결정**: `dooray member get/list` 서브커맨드 신설. `post comment list` 의 table 출력만 Creator 컬럼을 project 멤버 캐시로 enrich, `--json` 은 raw 유지. 기존 project 단위 캐시 (`members/{projectId}.json`) 만 사용 — organization-wide reverse lookup 미도입.

**맥락**: 댓글 응답에 `organizationMemberId` 만 있고 표시명 없어 자동화 흐름이 끊김 (Issue #17). table 만 enrich 한 이유는 `--json` 의 외부 도구 호환성 (스키마 변경 = breaking). project 단위 캐시 유지는 enrich 사용 시점에 항상 projectId 가 동반됨.

**대안 기각**:
- organization 단위 캐시 — 사용 패턴 (comment list enrich + member get 단건) 에서 이득 부족 + invalidation 부담
- `--json` 도 enrich — 응답 스키마 변경 = breaking, 외부 자동화 깨짐
- `member search` 같은 task 포함 — `GET /common/v1/members?name=` 동작이 공식 doc 모순, 실호출 검증 필요로 별도 task

---

<a id="adr-022"></a>

## ADR-022: `dooray feedback` 명령 — GitHub 호출은 `gh` CLI 에 위임

**결정**: GitHub issue 생성은 `gh` CLI 위임 (`execFile('gh', ['issue', 'create', ...])`). 본문 자동 메타는 환경 정보만 (`process.version` / `platform` / `arch` / `package.json` 버전) — config 객체에 접근 자체 안 함 (`apiKey` / IMAP 비밀번호 / `baseUrl` 모두 노출 0). 대상 repo 하드코딩 (`jon890/dooray-cli`).

**맥락**: 피드백 루프 마찰 제거 (Issue #19) — "에러 만남 → 한 줄로 issue 등록 → 작업 복귀". gh CLI 위임은 토큰 관리·OAuth 앱 등록 부담을 0 으로. dooray-cli 의 보안 표면도 늘지 않음. baseUrl 노출 시 사내 endpoint 사용자가 OSS public repo 로 보낼 때 회사 정보 누출 위험.

**대안 기각**:
- PAT 를 config.json 에 저장 — 토큰 만료/회수/스코프 관리 부담, UX 약함
- OAuth Device Flow + 직접 토큰 — 매끄러우나 앱 등록·보관 코드 ↑, 가치 대비 과함
- octokit SDK — 외부 dep 추가, gh 위임이면 0
- baseUrl host 마스킹 — suffix 로 회사 식별 가능, 누출 0 인 "제외" 가 단순·안전

세부 옵션 (`--title` / `--body-file` / `--label` / `--dry-run`) 동작은 `src/commands/feedback.ts` 참조.

---

<a id="adr-023"></a>

## ADR-023: `feedback --last` last-run 추적 — opt-in + 에러시만 + 최소 세트 + argv 마스킹

**결정**: 4 가지 정책 동시 적용.
1. **opt-in**: `config.json` 의 `trackLastRun: true` 일 때만 동작
2. **에러시만**: `src/index.ts` 최상위 `catch` 에서만 `~/.dooray/last-run.json` 작성
3. **최소 세트**: argv (sanitized) + exitCode + errorMessage + timestamp. `cwd`/`env` 제외
4. **argv 패턴 마스킹**: `--api-key=*` / `--token=*` / `--password=*` / `Authorization: Bearer *`

`feedback` 자체는 기록 안 함 (재귀 방지). 단일 파일 덮어쓰기 (use case = 직전 1건).

**맥락**: 모든 명령 종료 시점 디스크 I/O 는 전역 부수 효과 — dooray-cli 는 자동화 스크립트에서 자주 호출되어 의도 없는 매번 파일 쓰기는 부담. 성공 명령 기록은 효용 ↓ 부수효과 ↑. cwd 가 사내 경로일 가능성 (`/Users/.../<project>/...`) — CLAUDE.md PII gate 와 일관. 사용자가 `--header "Authorization: ..."` 추가 가능성으로 마스킹은 안전망.

**대안 기각**:
- 기본 on + opt-out — 부수 효과가 사용자 인지 없이 작동 (privacy 우려)
- 모든 명령 hook (commander preAction/postAction) — src/index.ts 구조 변경 ↑, 성공 명령 가치 낮음
- 풀세트 (cwd/env 포함) — PII gate 모순
- argv 전체 제외 (명령 이름만) — 재현 명령을 손으로 적어야, `--last` 가치 ↓

저장 위치 / sanitization 룰 / 시작 패턴은 `src/cache/last-run.ts` 참조. cache 외부 (`cache clear` 영향 없음).

---

<a id="adr-024"></a>

## ADR-024: `dooray post comment file *` — post-level files API + 댓글 PUT 합성

**결정**: `comment file {list,upload,download,delete}` 4 명령을 post-level files API (`/posts/{postId}/files`) + 댓글 본문 PUT (`/logs/{logId}`) 합성으로 구현. 사용자 멘탈 모델 = "댓글 첨부", 실제 데이터 모델 = post-level files + 댓글 본문 markdown reference (`![filename](/files/<fileId>)`). `delete` 는 항상 markdown 제거 + 파일 삭제 단일 동작 (옵션 분기 없음).

**맥락**: Dooray 공식 API + 실 호출 검증 결과 댓글 전용 attachment endpoint **부재** (Issue #34) — 댓글 단건 GET 응답에 `files: PostFileDetail[]` embedded 만 존재. 인라인 이미지 자동화 (스킬이 댓글에 이미지 삽입) 가 빈번해 댓글 전용 UX 가 필요.

**트레이드오프 (수용)**:
- **Atomic 부재**: 2-step (`upload`, `delete`) 중 1 step 만 성공 가능 — 부분 성공 시 stderr 안내 + non-zero exit
- **fileId namespace 가 post-level**: 같은 fileId 가 여러 댓글에서 참조 가능 → `delete` 가 다른 참조를 broken link 화 가능. 의도 명확화 위해 단일 동작
- **orphan file 노출**: `list` 가 `.files` 그대로 반환 (단일 소스 원칙), 본문 markdown 미참조 파일도 노출

**대안 기각**:
- 댓글 전용 endpoint — 부재. 비공개 endpoint 역공학 리스크 + 유지보수 부담
- markdown reference 제거 없이 파일만 삭제 — 본문 broken link 잔존 → UX 회귀
- 기존 `post file *` 안내 — 사용자가 댓글 ↔ post 본문 first attachment 구분 못함

각 명령 합성 동작은 `src/commands/post/comment/file/*.ts` 참조. 향후 Dooray 가 댓글 endpoint 도입하면 client API 만 교체 (CLI 시그니처 보존).
