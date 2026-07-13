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
- [ADR-025](#adr-025) — `post edit/create` cc/to 에 member-group 추가 (full payload PUT + `type: "group"`)
- [ADR-026](#adr-026) — Wiki API 호출 패턴 함정 (`parentPageId` 필수 + `subject`/`title` 네이밍 + 페이지 수정 3종 endpoint)
- [ADR-027](#adr-027) — `post create --template` 정책 (interpolation 기본 true + 사용자 옵션 우선 override + `--field` 사용자 변수 제외)
- [ADR-028](#adr-028) — member-group 응답 shape — nested array unwrap + id 직접 입력 fallback (Issue #65, #76)
- [ADR-029](#adr-029) — wiki page file multipart `type` 필드 순서 의존성 (Issue #70)
- [ADR-030](#adr-030) — `resolveProject` numeric 입력 cache 우회 fallback (Issue #78)
- [ADR-031](#adr-031) — file 명령군 `--json` 출력 스키마 통일 (`post file` + `wiki page file`, Issue #73)

---

<a id="adr-001"></a>

## ADR-001: TypeScript (Node.js) 선택

**결정**: Kotlin(기존 MCP 서버) 대신 TypeScript로 새로 작성

**이유**:

- 팀의 주력 스택이 TypeScript → 개발 속도 우선
- npm 생태계로 `npx @bifos/dooray-cli` 즉시 배포 가능
- CLI 툴 생태계(Commander, chalk, ora 등)가 Node.js에서 가장 성숙

**대안 기각**: Kotlin MCP 서버 코드 재사용 포기 → 다른 ADR과 형식 일관성 확보.
types.ts 포팅 비용은 1일 내라 상쇄 가능.

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
- `--body-file` + 별도 수정은 4단계 필요: 기존 내용 조회, 파일 저장, 수정, CLI 재실행
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

**기본값 전략**: imap-host, imap-port, smtp-host, smtp-port는 기본값 제공 (Dooray 사용자 대다수 동일).
사용자는 imap-username, imap-password만 설정하면 됨.

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

- 다운로드: `?media=raw` 쿼리 파라미터로 307 유도 후 Location 헤더 캡처, fetch로 2차 요청
- 업로드: `fetch` 직접 사용 (`ky`는 307 + `redirect: "manual"` 조합에서 정상 동작하지 않음)
- 2차 요청 시 동일한 Authorization 헤더 첨부
- 업로드: FormData + Blob, 다운로드: ArrayBuffer로 수신 후 파일 저장

---

<a id="adr-016"></a>

## ADR-016: `dooray setup` 대화형 초기 설정 마법사

**결정**: `dooray setup` 커맨드로 대화형 초기 설정 마법사 제공.
`postinstall` 훅 대신 명시적 커맨드 방식 채택.

**이유**:

- `postinstall`은 CI/Docker 등 non-TTY 환경에서 실패, npm 정책상 interactive postinstall 비권장
- `dooray setup`은 언제든 재실행 가능, config 미설정 시 안내 메시지로 유도
- 재실행 시 기존 설정값을 기본값으로 표시하여 부분 수정 가능

**플로우**: 세부 단계는 `docs/flow.md` "최초 설정 — `dooray setup`" 섹션 참조.

**라이브러리**: `@inquirer/prompts` — 선택(select), 입력(input), 비밀번호(password), 확인(confirm) 프롬프트 지원. tsup CJS 번들 호환성 확인 필요.

**안전성**: Ctrl+C 시 config 파일 미저장 (부분 저장 방지).
모든 입력을 메모리에 수집한 뒤 마지막에 한 번만 writeFile.

**config 미설정 시 안내**: 기존 에러 메시지를 `dooray setup` 실행 유도로 변경.

---

<a id="adr-017"></a>

## ADR-017: api/types.ts 단일 파일 유지

**결정**: `api/types.ts`를 도메인별로 분리하지 않고 단일 파일로 유지

**이유**:

- 현재 ~440줄으로 분리 임계점(~800줄+)에 미달
- 섹션 주석으로 Common, Project, Post, Comment, Member, Workflow, Wiki, File 구분이 충분
- `DoorayApiHeader`, `DoorayApiResponse<T>` 등 Common 타입을 거의 모든 도메인이 참조 → barrel export 관리 오버헤드 대비 실익 부족
- `client.ts`에서 한 파일로 모든 타입을 import하는 현재 구조가 간결

**재검토 시점**: 800줄 이상이거나 새 도메인(Drive 등)이 2개 이상 추가될 때

---

<a id="adr-018"></a>

## ADR-018: `dooray setup` 에서 Claude Code 스킬 설치

**결정**: setup 마지막 단계에서 스킬 설치 여부를 물어보고 심볼릭 링크로 설치 (`~/.claude/skills/dooray-cli` → 패키지 내부 `skills/dooray-cli/`).
idempotent 재실행 가능.
npx 임시 경로 감지 시 경고 + skip (global install 전용).

**맥락**: 별도 `dooray install skills` 커맨드보다 setup 일원화가 UX 간결.
심볼릭 링크는 `npm update -g` 시 스킬도 자동 최신화 (유지보수 비용 0).
`~/.claude/skills/` 의 다른 스킬 (gstack 등) 도 동일 패턴이라 일관성.
스킬 포맷은 Claude Code SKILL.md frontmatter 규격 — 타 에이전트 지원은 요청 시 확장.

**대안 기각**:
- `postinstall` 훅 — npm 정책상 interactive postinstall 비권장, CI/Docker 비-TTY 실패 (ADR-016 과 동일 사유)
- 파일 복사 — `npm update` 시 자동 최신화 안 됨, 사용자가 재설치 명령 알아야

세부 (origin 경로 / doctor 검증 / package.json `files` 필드) 는 `src/commands/setup.ts` + `src/commands/doctor.ts` 참조.

---

<a id="adr-019"></a>

## ADR-019: `post create` 메타데이터 옵션 (`--tag`/`--parent`/`--workflow`/`--milestone`)

**결정**: 4개 옵션 모두 이름 lookup.
클라이언트가 `tagGroup.mandatory` / `selectOne` 사전 검증.
`--workflow` 만 create 후 `setPostWorkflow` 후속 호출 — 실패 시 `stderr` warn + `exit 0` (post 는 이미 생성됨).

**맥락**: mandatory-tag 정책 프로젝트는 CLI 로 단 한 건도 생성 불가 (Issue #18).
API 의 `USER_INVALID_TAG_MANDATORY_PREFIX` 에러는 어느 그룹이 누락인지 안내 안 함 → 친절한 메시지 직접 생성 필요.
멤버만 부분일치였던 resolver 비대칭도 해소 — 아래 순서로 통일:
- 정확 일치
- 부분 일치
- 모호 + 후보 출력

**대안 기각**:
- `--workflow` 실패 시 exit non-zero — post 가 이미 발급된 상태에서 전체 실패는 사용자가 두 번 만드는 혼란
- ID 직접 입력 허용 — `--workflow xxx-uuid` 같은 폴백은 거의 사용 안 되는 흐름, 복잡도만 ↑
- `--tag` 에 자릿수 휴리스틱 — ID 형식 변경 시 깨짐. `--parent` 만 `code/number` ↔ raw postId 분기

세부 시그니처·동작은 `src/commands/post/create.ts` + `src/resolvers/{tag,milestone,postRef}.ts` 참조.
캐시 디렉터리는 `data-schema.md`.

**확장 (2026-05-18, Issue #66)**: `post edit` 도 동일 정책 적용 — `--tag` / `--tag-clear` / `--tag-remove` 옵션 + mandatory 검증 동일 호출.
`--title`/`--body` 없이 단독 호출 허용 (body 자동 재전송).
머지 로직은 `src/resolvers/post-tags.ts` 의 `mergeTagIds` pure helper — `post-users.ts` 동일 패턴 적용.

---

<a id="adr-020"></a>

## ADR-020: post 명령 input 통합 (`--id`/URL/positional) + 첫 테스트 인프라 (vitest)

**결정**: post 하위 명령에 3 가지 입력 모드 (기존 `<project> <post-number>` + `--id <postId>` + `--url <url>` + 첫 positional 이 Dooray URL 이면 자동) 도입.
sub-id (`<comment-id>`, `<file-id>`) 는 옵션화 (positional 호환).
분기는 `resolvePostInput` 단일 헬퍼.
동시 사용은 명시적 에러.
첫 테스트 인프라로 vitest 도입.

**맥락**: Dooray URL 은 postId 만 포함 (`/task/to/{postId}`) — 동료가 URL 만 공유하면 project 코드 모르는 사용자가 CLI 사용 불가 (Issue #16).
AI 에이전트도 사용자 메시지에서 URL 을 그대로 첫 인자로 전달하면 라우팅 부담 0.
standalone API `GET /project/v1/posts/{postId}` 응답에 `project.{id,code}` 포함 → 한 lookup 으로 기존 코드 경로 재사용.
분기 규칙이 7 가지라 단위 테스트로 회귀 방지 필수.

**대안 기각**:
- positional 단일 `<ref>` 통합 (`<project>/337` | postId | URL) — 기존 두 인자 breaking, 영향 범위 ↑
- positional 1개 numeric → postId 자동 인식 — 19자리 임계는 임의값, ID 길이 변경 시 깨짐
- sub-id 를 인자 개수로 분기 — `comment edit <project> cmt-abc` 같은 사용자 실수에 모호한 에러
- `node:test` 빌트인 — mocking·watch·확장성에서 vitest 우위

분기 규칙·URL 정규식·테스트 케이스는 `src/resolvers/post-input.ts` + `src/utils/dooray-url.ts` 참조.
후속 (wiki input 통합, CI 통합) 은 별도 task.

**보강 (Issue #82/#83, 2026-06)**: 입력 처리를 '만능 추론' 에서 '명시적 타입 분류' 로 강화한다.
`classifyPostInputToken` 이 토큰을 postId / postNumber / url / project 로 분류한다.
진입점 (`--id` / `--url` / positional) 이 기대 타입과 불일치하면 타입별 안내 에러를 던진다.

- positional 2번째가 postId (15+자리 numeric) 면 "`--id` 를 쓰세요" 안내 (#82).
- URL 형식에 `/project/tasks/{postId}` 추가 (#83 — `/task/{pid}/{id}` 는 기존 처리).

길이 임계 (15+자리) 는 **안내 트리거로만** 쓰고 조회 분기로는 쓰지 않는다.
따라서 본 ADR 의 'positional numeric → postId 자동 인식 기각' 은 유지된다.
긴 numeric 을 postId 로 조용히 조회하지 않고 `--id` 명시 경로로 유도한다.
ID 체계가 바뀌어 분류가 틀려도 `--id` 경로는 영향받지 않는다.

---

<a id="adr-021"></a>

## ADR-021: `member` 명령 + comment list Creator 이름 자동 채우기

**결정**: `dooray member get/list` 서브커맨드 신설.
`post comment list` 의 table 출력만 Creator 컬럼을 project 멤버 캐시로 enrich — `--json` 은 raw 유지.
기존 project 단위 캐시 (`members/{projectId}.json`) 만 사용 — organization-wide reverse lookup 미도입.

**맥락**: 댓글 응답에 `organizationMemberId` 만 있고 표시명 없어 자동화 흐름이 끊김 (Issue #17).
`--json` 을 raw 로 유지한 이유는 외부 도구 호환성 — 스키마 변경은 breaking change.
project 단위 캐시 유지는 enrich 사용 시점에 항상 projectId 가 동반됨.

**대안 기각**:
- organization 단위 캐시 — 사용 패턴 (comment list enrich + member get 단건) 에서 이득 부족 + invalidation 부담
- `--json` 도 enrich — 응답 스키마 변경 = breaking, 외부 자동화 깨짐
- `member search` 같은 task 포함 — `GET /common/v1/members?name=` 동작이 공식 doc 모순, 실호출 검증 필요로 별도 task

---

<a id="adr-022"></a>

## ADR-022: `dooray feedback` 명령 — GitHub 호출은 `gh` CLI 에 위임

**결정**: GitHub issue 생성은 `gh` CLI 위임 (`execFile('gh', ['issue', 'create', ...])`).
본문 자동 메타는 환경 정보만 (`process.version`, `platform`, `arch`, `package.json` 버전) — config 객체에 접근 안 함.
`apiKey`, IMAP 비밀번호, `baseUrl` 모두 노출 0.
대상 repo 하드코딩 (`jon890/dooray-cli`).

**맥락**: 피드백 루프 마찰 제거 (Issue #19) — "에러 만남 → 한 줄로 issue 등록 → 작업 복귀".
gh CLI 위임은 토큰 관리·OAuth 앱 등록 부담을 0 으로.
dooray-cli 의 보안 표면도 늘지 않음.
baseUrl 노출 시 사내 endpoint 사용자가 OSS public repo 로 보낼 때 회사 정보 누출 위험.

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

`feedback` 자체는 기록 안 함 (재귀 방지).
단일 파일 덮어쓰기 — use case 는 직전 1건만.

**맥락**: 모든 명령 종료 시점 디스크 I/O 는 전역 부수 효과 — dooray-cli 는 자동화 스크립트에서 자주 호출되어 의도 없는 매번 파일 쓰기는 부담.
성공 명령 기록은 효용 ↓ 부수효과 ↑.
cwd 가 사내 경로일 가능성 (`/Users/.../<project>/...`) — CLAUDE.md 개인 식별 정보 점검과 일관.
사용자가 `--header "Authorization: ..."` 추가 가능성으로 마스킹은 안전망.

**대안 기각**:
- 기본 on + opt-out — 부수 효과가 사용자 인지 없이 작동 (privacy 우려)
- 모든 명령 hook (commander preAction/postAction) — src/index.ts 구조 변경 ↑, 성공 명령 가치 낮음
- 풀세트 (cwd/env 포함) — 개인 식별 정보 사전 점검 모순
- argv 전체 제외 (명령 이름만) — 재현 명령을 손으로 적어야, `--last` 가치 ↓

저장 위치 / sanitization 룰 / 시작 패턴은 `src/cache/last-run.ts` 참조. cache 외부 (`cache clear` 영향 없음).

---

<a id="adr-024"></a>

## ADR-024: `dooray post comment file *` — post-level files API + 댓글 PUT 합성

**결정**: `comment file {list,upload,download,delete}` 4 명령을 post-level files API (`/posts/{postId}/files`) + 댓글 본문 PUT (`/logs/{logId}`) 합성으로 구현.
사용자 멘탈 모델은 "댓글 첨부"이지만 실제 데이터 모델은 post-level files + 댓글 본문 markdown reference (`![filename](/files/<fileId>)`) 구조다.
`delete` 는 항상 markdown 제거 + 파일 삭제 단일 동작 (옵션 분기 없음).

**맥락**: Dooray 공식 API + 실 호출 검증 결과 댓글 전용 attachment endpoint **부재** (Issue #34) — 댓글 단건 GET 응답에 `files: PostFileDetail[]` embedded 만 존재.
인라인 이미지 자동화가 빈번해 댓글 전용 UX 가 필요 — 스킬이 댓글에 이미지를 삽입하는 패턴이 대표적.

**트레이드오프 (수용)**:
- **Atomic 부재**: 2-step (`upload`, `delete`) 중 1 step 만 성공 가능 — 부분 성공 시 stderr 안내 + non-zero exit
- **fileId namespace 가 post-level**: 같은 fileId 가 여러 댓글에서 참조 가능 → `delete` 가 다른 참조를 broken link 화 가능. 의도 명확화 위해 단일 동작
- **orphan file 노출**: `list` 가 `.files` 그대로 반환 (단일 소스 원칙), 본문 markdown 미참조 파일도 노출

**대안 기각**:
- 댓글 전용 endpoint — 부재. 비공개 endpoint 역공학 리스크 + 유지보수 부담
- markdown reference 제거 없이 파일만 삭제 — 본문 broken link 잔존 → UX 회귀
- 기존 `post file *` 안내 — 사용자가 댓글 ↔ post 본문 first attachment 구분 못함

각 명령 합성 동작은 `src/commands/post/comment/file/*.ts` 참조. 향후 Dooray 가 댓글 endpoint 도입하면 client API 만 교체 (CLI 시그니처 보존).

---

<a id="adr-025"></a>

## ADR-025: `post edit/create` cc/to 에 member-group 추가 (full payload PUT + `type: "group"`)

**결정**: `post edit` 에 `--cc <name>`, `--cc-group <code>`, `--cc-clear`, `--to <name>`, `--to-group <code>`, `--to-clear` 6 옵션 추가.
`post create` 에 `--cc-group`, `--to-group` 2 옵션 추가.
모두 기존 `updatePost` / `createPost` 의 **full payload PUT** 흐름 (`users: { to, cc }`) 으로 처리.
그룹은 `{ type: "group", group: { projectMemberGroupId } }` 객체로 전송.

**맥락**: Issue #54 — 자동화 스크립트의 워크플로우:
- audit 리포트 생성
- 신규 업무 생성
- 그룹 cc 첨부
Dooray API 는 cc-only patch 단독 엔드포인트 미제공.
PUT post 의 full payload 만 cc/to 갱신 가능.
PostUser type 의 그룹 분기는 `type: "memberGroup"` 이 아니라 `type: "group"` + `Group.projectMemberGroupId` — 이슈 본문 시도가 실패한 원인.

**대안 기각**:
- cc-only patch endpoint 역공학 — 부재 확인 (`POST .../set-cc`, `.../cc`, `.../to-and-cc` 모두 null 응답)
- `{ "type": "memberGroup", "memberGroup": { "memberGroupId": "..." } }` 형식 (이슈 본문 시도) — `Failed to read HTTP message`.
  실제 API contract 는 `type: "group"` + `Group.projectMemberGroupId` (api/types.ts:122-125)
- subcommand 분리 (`post participants {add,set,remove}`) — `post edit` 의 다른 옵션 (title/body/mention/link-task) 과 조합 불가, 한 번 PUT 으로 끝낼 수 없어 race 위험
- replace 기본 정책 — 사용자가 매번 전체 멤버/그룹 알아야 함, 자동화 친화성 떨어짐. append + `--cc-clear` / `--to-clear` 채택

**적용 범위**: `post edit` + `post create`. interactive ($EDITOR) 모드는 frontmatter 와 충돌 → 옵션 사용 시 stderr 경고 후 무시 (mention/link-task 동일 패턴 적용).

---

<a id="adr-026"></a>

## ADR-026: Wiki API 호출 패턴 함정 (parentPageId 필수 + subject/title 네이밍 + 페이지 수정 3종 endpoint)

**결정**: Wiki API 호출 시 다음 3개 함정을 클라이언트 레이어에서 흡수:
- `parentPageId` 자동 폴백 (`resolveWikiHomePageId`)
- `--title` → `subject` 매핑
- 수정 동작별 endpoint 분기 (`/pages/{id}`, `/title`, `/content`)

**맥락**: Dooray Wiki API 의 다음 동작은 공식 문서에 없거나 직관에 반함:

- **`parentPageId` 사실상 필수** — `POST /wiki/v1/wikis/{wikiId}/pages` 의 `parentPageId` 가 공식적으로는 optional 처럼 보이나 미지정/빈 문자열 시 400.
  사용자 UX 보존 위해 CLI 가 `home.pageId` 로 자동 폴백 (Issue #5)
- **`subject` vs `title` 네이밍 불일치** — API body 필드는 `subject` (업무·위키 공통). 사용자 친화 위해 CLI 는 `--title` 플래그로 노출 + 매핑
- **페이지 수정 endpoint 3종 분리** — Dooray 가 제목+본문 동시, 제목만, 본문만을 별도 endpoint 로 제공.
  CLI `wiki page edit` 가 플래그 조합으로 라우팅 분기 (Issue #4)

**대안 기각**:
- `parentPageId` 미지정 허용 (서버 에러 그대로 노출) — UX 회귀, 사용자가 wiki home 개념 몰라도 동작해야 함
- API 필드명 그대로 `--subject` 노출 — post 명령군이 `--title` 로 통일됐는데 wiki 만 다른 이름이면 일관성 깨짐 (Issue #8 의 통합 결정과 모순)
- 단일 PUT 으로 partial body 시도 — 서버의 partial 수용 여부 불확실. dedicated endpoint 사용이 공식 의도와 일치

**페이지 수정 endpoint 분기 규칙**:

| Endpoint | 용도 | CLI 트리거 |
|---|---|---|
| `PUT .../pages/{pageId}` | 제목+본문 동시 | 플래그 없음 (`$EDITOR`) 또는 `--title` + body 둘 다 |
| `PUT .../pages/{pageId}/title` | 제목만 | `--title X` 단독 |
| `PUT .../pages/{pageId}/content` | 본문만 | `--body` 또는 `--body-file` 단독 |

> member-group `code` 누락은 ADR-028 로 분리 (wiki 도메인과 무관한 별 함정).

---

<a id="adr-027"></a>

## ADR-027: `post create --template` 정책 — interpolation 기본 true + 사용자 옵션 우선 + `--field` 제외

**결정**: `dooray post create --template <name|id>` 사용 정책:
- `GET .../templates/{id}?interpolation=true` 로 시스템 매크로 (`${year}` 등) 치환된 본문/users/tags 를 받음
- 사용자가 `--title`/`--body`/`--tag`/`--to`/`--cc` 명시 입력하면 그 값이 템플릿 값을 override
- 사용자 정의 변수 (`--field key=value`) 는 본 task scope 제외 (별도 후속)

**맥락**: Issue #59 — 자동화 스크립트가 정형 task (릴리스 플랜, 요청서 등) 를 매번 기존 본문 fetch + 변수 치환 수동 우회.
Dooray API 가 `GET /templates` 와 `interpolation` 파라미터를 노출 (cmux-browser 사전 조사 2026-05-11 확인).

**대안 기각**:
- `interpolation=false` 기본 — 자동화 파이프라인이 `${year}` 같은 매크로를 매번 수동 치환해야 해서 가치 반감. UX 우선
- 템플릿 우선 (override 불가) — 사용자가 `--title` 까지 강제 변경 못 하면 "대부분 템플릿, 일부만 다르게" 자동화 패턴 불가
- 필드별 union (tags/users append, title/body override) — 정책 복잡. MVP 단순화 — 일관되게 사용자 옵션 우선
- `--field key=value` client-side string replace 포함 — 미정의 변수 / escape / type 처리 복잡.
  본 task 는 API 가 직접 제공하는 시스템 매크로만 사용, 사용자 정의 변수는 별도 task 로 분리

**적용 범위**: `post create --template` 만.
`post edit --template` 은 별도 — 기존 본문 덮어쓰기인지 merge 인지 의도 불명확.
templates 캐시는 ADR-004/010 동일 패턴 적용 (TTL 24h, `~/.dooray/cache/templates/{projectId}.json`).

---

<a id="adr-028"></a>

## ADR-028: member-group 응답 shape — nested array unwrap + id 직접 입력 fallback

**결정**: `fetchAllMemberGroups` 가 응답 `result` 가 **중첩 배열** (`[[group1, group2]]`) 인 경우를 정규화 (flatten) 한다.
정규화 후에도 `code` 누락 그룹 대응을 위해 `code` 타입 optional 유지 + `match.ts` 가드 유지.
사용자가 그룹 code 를 모르는 경우 회피책으로 `resolveMemberGroup` 에 numeric 15+자리 입력 시 id 직접 매칭 fallback 도 제공.

**맥락**: Dooray API `GET /project/v1/projects/{projectId}/member-groups` 응답 구조 — 공식 spec 은 평면 배열 (`result: [g1, g2, ...]`) 이지만 실제 응답이 **중첩 배열** (`result: [[g1, g2]]`) 로 반환됨 (2026-05-22 실측, 모든 프로젝트 동일).
원래 `for (const g of res.result)` 흐름이 외부 배열을 평면으로 가정해 `g` 가 배열이 되어 `g.id` / `g.code` 모두 undefined → cache 에 빈 객체로 저장 → `dooray project groups` 표가 모든 컬럼 빈값, 모든 그룹 매칭 실패.

이슈 #76 사용자 보고 ("프로젝트 전체 그룹이 code 누락 — `[{}, {}]` 응답") 의 root cause = 부분적 code 누락이 아니라 response shape mismatch.

**구 ADR-028 가정 무효화**: 본 ADR 초기 결정 (2026-05-18, Issue #65) 의 "code 누락 그룹 일부 케이스" 진단은 root cause 가 아닌 증상만 본 것.
"사전 필터링 + silent skip" 정책은 실제로는 **모든 그룹을 필터** 하는 방향으로 동작하고 있었음.

**대안 기각**:
- 기존 사전 필터 정책 유지 — root cause 미해결. response shape 가 평면으로 되돌아오지 않는 한 모든 그룹 영영 매칭 실패
- API client 단에서 response 정규화 — `client.ts` 가 raw HTTP 래퍼 (비즈니스 로직 없음) 원칙에 위배. resolver 단에서 처리
- name fallback — 공식 spec / 실제 응답 둘 다 MemberGroup 에 `name` 필드 부재. fallback 키 없음
- cache 스키마 확장 (name 필드 추가) — 위 사유로 무의미
- detail API `/member-groups/{id}` 의 `members[].name` 활용 — 그룹 자체 이름이 아니라 그룹 멤버 이름. 의미 충돌

**적용 범위**:
- `src/resolvers/member-group.ts` `fetchAllMemberGroups` — `res.result.flat()` 로 nested array 정규화
- `src/resolvers/member-group.ts` `resolveMemberGroup` — numeric 15+자리 입력 시 id 직접 매칭 fallback (response shape 가 다시 변할 robustness)
- `src/api/types.ts` `MemberGroup.code?: string` + `src/cache/types.ts` `CachedMemberGroup.code?: string` 유지 (개별 code 누락 가능성은 여전히 존재)
- `src/resolvers/match.ts` undefined / 빈 문자열 가드 유지
- stderr 메시지의 ADR 번호 오기 (`ADR-026` → `ADR-028`) 정정
- helpHint AI 친화: 후보 탐색 명령 + id 직접 입력 형식 둘 다 명시

## ADR-029: wiki page file multipart `type` 필드 순서 의존성

**결정**: `POST /wiki/v1/wikis/{wikiId}/pages/{pageId}/files` 호출 시 multipart form-data 의 `type` 필드를 **`file` 필드보다 먼저** append 한다.
클라이언트 (`uploadWikiPageFile`) 가 순서를 강제, 호출자가 신경 쓰지 않도록 캡슐화.

**맥락**: Dooray 공식 문서 ([share 페이지](https://helpdesk.dooray.com/share/pages/9wWo-xwiR66BO5LGshgVTg/2939987647631384419)) 명시:

> form-data 필드 순서가 중요합니다. 반드시 type 필드를 먼저 보내고, 그 다음에 file 필드를 보내야 정상 동작합니다.

RFC 7578 (multipart/form-data) 는 필드 순서 무관을 기본으로 하지만, Dooray 서버는 `type` 을 먼저 파싱해 분기하는 듯 (silent fail or 400 가능).
`post file upload` (ADR-015) 는 `file` 만 보내 이슈가 없었으나 wiki 는 `type=general|inline_image` 분기가 필수.

**대안 기각**:
- 호출자가 직접 순서 책임 — 4 개 명령 (upload + 향후 inline 자동삽입 등) 에서 같은 함정 반복 위험. 클라이언트 캡슐화가 단일 소스
- `type` 필드 생략 + Dooray 의 default 동작 기대 — 문서가 required 명시. silent fail 시 디버깅 비용 ↑
- 307 redirect 후 본 요청에서만 순서 보장 — 307 의 location 도 동일 endpoint, 그러나 fetch 의 재시도 시 FormData 순서가 보장되는지 환경 의존. 307 + 본 요청 모두에서 명시적으로 append 순서를 보장

**적용 범위**:
- `src/api/client.ts` `uploadWikiPageFile(wikiId, pageId, filePath, type)` — `formData.append("type", type)` 를 `formData.append("file", ...)` 보다 **반드시 먼저** 호출
- 307 redirect 처리 (ADR-015 패턴 재사용) 시 동일한 FormData 객체 재사용으로 순서 보존
- `type` 값은 `"general" | "inline_image"` 만 허용 (TypeScript literal type)

**적용 외**:
- `wiki page file download` / `delete` 는 multipart 무관
- 본문 markdown 자동 삽입 (`updateWikiPageContent` 호출) 은 본 task scope 제외 (사용자 결정 — upload 출력에 `attachFileId` + snippet 만 제공, 사용자가 직접 본문에 박음)

---

<a id="adr-030"></a>

## ADR-030: `resolveProject` numeric 입력 cache 우회 fallback

**결정**: `resolveProject` 입력이 numeric 15+자리이면 cache 우회 + 입력값을 그대로 projectId 로 반환.
권한 검증은 후속 API 호출 (getPosts / getProjectMembers 등) 의 4xx 응답에 위임.
13 호출자 (post create/list/search, member/list, project/* 5종, post-input, postRef, wiki) 자동 혜택.

**맥락**: `ensureProjects` 가 `GET /project/v1/projects?member=me` 응답으로 cache 채움.
member 가 아닌 프로젝트 (예: 다른 팀 프로젝트 — 권한은 있지만 멤버 아님) 는 cache 에 없음.
사용자가 projectId 를 알고 있어도 `resolveProject` 가 "프로젝트를 찾을 수 없습니다" 로 차단.
자동화 스크립트가 멤버 아닌 프로젝트의 업무 검색 불가 (Issue #78).

**대안 기각**:
- `getProject(projectId)` 호출로 존재 검증 후 반환 — 매 호출 API +1. `resolveMember` 가 이 패턴이지만 project 는 호출자 13개라 누적 비용 큼. 검증 가치 < 단순성
- `lazy + 4xx 메시지 변환` (client 단 catch) — 변환 위치가 분산되어 일관성 ↓. resolver 단순성 우선
- private cache 강제 refresh (`ensurePrivateProjects` 자동 호출) — member 가 아닌 프로젝트는 private 도 아닐 수 있음. 근본 해결 아님
- 명령별 (post search 만) 적용 — `resolveProject` 단일 진입점인데 명령마다 분기 패턴 복붙하면 일관성 깨짐. resolver 단 수정이 자연

**적용 범위**:
- `src/resolvers/project.ts` `resolveProject` — `PROJECT_ID_RE = /^\d{15,}$/` 분기 추가 (`resolveMember` 의 `MEMBER_ID_RE`, `resolveMemberGroup` 의 `GROUP_ID_RE` 와 동일 패턴 mirror)
- cache 자체는 그대로 — cache 에 있는 projectId 매칭도 기존 흐름 유지 (numeric 분기가 먼저 잡힐 뿐)
- 단위 테스트: numeric 우회 / code 매칭 / private cache 매칭 / 모두 실패 시 에러
- wiki resolver (`src/resolvers/wiki.ts:13`) — `resolveProject` 의 cache freshness 보장 의도가 numeric 분기 시 깨짐.
  wiki 도 numeric projectId 허용으로 가되, freshness 는 별도 명령 (`dooray cache refresh`) 으로 안내

**트레이드오프**:
- 사용자가 잘못된 projectId 줘도 resolver 통과 → 후속 API 4xx 발생.
  에러 메시지가 resolver 단보다 한 단계 지연되지만 자동화 친화 (resolveMember/resolveMemberGroup 의 cache 외 입력 처리와 일관)
- `resolveProject` 단일 진입점 수정으로 13 호출자 자동 혜택 — 코드 표면 최소, 회귀 위험 낮음

---

<a id="adr-031"></a>

## ADR-031: file 명령군 `--json` 출력 스키마 통일

**결정**: `post file` (`upload` / `download` / `download-all` / `delete`) + `wiki page file` 동의 4 명령 = **8 명령** 의 `--json` 출력 스키마 통일.
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
- 부분 실패에 별도 exit code (예: 2) — 기존 정책 (1 = API 오류) 과 분리 의도 약함. failed 배열 + exit 1 로 충분
- `--json` 시 quiet 무시 — quiet 가 `--json` 의 sub-mode 가 아니라 독립 출력 정책. 두 옵션 모두 지원 (quiet 우선)

**적용 범위**:
- 8 명령 파일 (`src/commands/{post,wiki}/{file,page-file}/{upload,download,download-all,delete}.ts`)
- `--json` 분기: `if (globalOpts.json) printJson(scheme)` — 기존 `formatters/table.ts` 의 `printJson` 헬퍼 재사용
- `--quiet` 분기: `else if (globalOpts.quiet) process.stdout.write(<id|path>)`
- 표준 출력: `else { ... 기존 plain text }`
- 부분 실패 (`download-all`): `failed.length > 0 → process.exitCode = 1`
- 단위 테스트: 각 명령별 `--json` / `--quiet` / plain 3 모드 + `download-all` 의 부분 실패 케이스

**트레이드오프**:
- 8 파일 일괄 수정 — scope 크지만 동일 패턴 복제라 회귀 위험 낮음
- `download-all` 의 failed 배열 표현이 sequential 호출 (ADR-024 patterns) 의 partial-failure 정책 (`docs/pitfalls/code-review/sequential-endpoint-partial-failure-missing.md`) 과 일관

**보강 (Issue #81, 2026-06)**: `wiki page file upload` 의 `--json` 출력에 inline_image 시 `markdownSnippet` 필드 추가.
`--quiet` 은 "id 만" 원칙 유지 (snippet 미포함).
plain 모드 snippet 과 동일 문자열을 `wikiInlineImageSnippet` 헬퍼로 단일화한다.
general 타입은 변경 없음.
