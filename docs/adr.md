# ADR — dooray-cli 기술 결정 기록

## ADR-001: TypeScript (Node.js) 선택

**결정**: Kotlin(기존 MCP 서버) 대신 TypeScript로 새로 작성

**이유**:

- 팀의 주력 스택이 TypeScript → 개발 속도 우선
- npm 생태계로 `npx @bifos/dooray-cli` 즉시 배포 가능
- CLI 툴 생태계(Commander, chalk, ora 등)가 Node.js에서 가장 성숙

**트레이드오프**: Kotlin API 클라이언트 재사용 포기 → types.ts로 포팅 필요 (1일 내 완료 가능)

---

## ADR-002: ky (HTTP 클라이언트)

**결정**: axios 대신 ky 사용

**이유**:

- Node 18+ native fetch 기반 → 추가 의존성 없음
- 번들 크기 3KB vs axios 13KB
- TypeScript 타입 기본 제공
- CLI 툴에서 axios의 XMLHttpRequest 레거시 불필요

**제약**: Node 18+ 필수 (`engines: { node: ">=18" }` 명시)

---

## ADR-003: tsup (빌드 툴)

**결정**: tsc 대신 tsup 사용

**이유**:

- esbuild 기반으로 tsc 대비 10배 빠른 빌드
- 단일 번들 파일 출력 → npm 배포 단순화
- tsconfig.json 자동 인식, 설정 최소화

---

## ADR-004: 디스크 캐시 (project·member·workflow)

**결정**: `~/.dooray/cache.json`에 TTL 기반 캐시 저장

**이유**:

- CLI는 매 실행이 새 프로세스 → in-memory 캐시 불가
- project code·member 이름 → ID 변환 시 매번 API 호출 시 지연 발생
- TTL: projects·members 1h / workflows 24h (변경 빈도 기반)

**트레이드오프**: 캐시 stale 가능성 → `dooray cache refresh`로 수동 갱신 제공

---

## ADR-005: postNumber를 Post 식별자로 사용

**결정**: 내부 UUID(postId) 대신 `postNumber`(정수)를 CLI 인터페이스로 노출

**이유**:

- Dooray UI에서 표시되는 번호와 동일 → 사용자가 UI 보고 바로 CLI 사용 가능
- 숫자라 기억·입력 용이 (GitHub Issue number와 동일 패턴)
- API의 `postNumber` 필터 파라미터로 postId 변환 가능

---

## ADR-006: $EDITOR 기반 수정 플로우

**결정**: `dooray post edit` / `wiki page edit` 은 $EDITOR를 통한 수정

**이유**:

- `--body "..."` flag로 긴 마크다운 입력은 현실적으로 불가능
- `--body-file` + 별도 수정은 "기존 내용 조회 → 파일 저장 → 수정 → CLI 재실행" 4단계 필요
- $EDITOR 방식(`kubectl edit`, `git commit` 동일 패턴)은 1커맨드로 완결
- YAML frontmatter로 메타데이터(subject, priority, due_date, to, cc) + 본문 통합 편집

---

## ADR-007: config 파일 전용 (env var 폴백 없음)

**결정**: API key를 환경변수로 받지 않음. `~/.dooray/config.json`만 사용

**이유**:

- API key는 민감 정보 → env var 노출은 보안 위험 (shell history, ps 출력 등)
- 설정 미완료 시 명확한 에러 + 가이드 출력이 더 나은 UX
- CI 환경 지원은 v1 범위 외

---

## ADR-008: 멤버 모호성 — 에러 + 후보 출력

**결정**: 이름 검색 시 복수 매칭이면 인터랙티브 선택 대신 에러 출력

**이유**:

- AI 에이전트가 primary 사용자 → 인터랙티브 프롬프트는 자동화 파이프라인 차단
- 에러 메시지에 후보 목록 포함 → 에이전트가 다음 시도에 정확한 값 사용 가능

---

## ADR-009: WikiResolver는 ProjectCache 활용

**결정**: 별도 wiki API 호출 없이 `project.wiki.id`를 project 캐시에 저장해 사용

**이유**:

- Dooray Project 응답에 `wiki: { id }` 포함 → 추가 API 호출 0회
- project cache fetch 시 자동으로 wikiId도 확보
- Wiki가 없는 프로젝트는 명확한 에러 출력

---

## ADR-010: 캐시 파일 분리 (디렉토리 기반)

**결정**: 단일 `cache.json` 대신 `~/.dooray/cache/` 디렉토리에 타입별·프로젝트별 파일 분리

**이유**:

- 단일 파일 read-modify-write는 동시 CLI 실행 시 race condition 발생 가능
- 파일 분리로 members 쓰기가 projects를 덮어쓰지 않음
- 프로젝트별 멤버/워크플로우를 독립 파일로 관리 → 특정 프로젝트 캐시만 삭제 가능
- 파일별 `updatedAt`으로 TTL 독립 관리

**구조**: 자세한 파일 트리·스키마는 `docs/data-schema.md` 참조

---

## ADR-011: 내 정보(Me) 캐시

**결정**: `/common/v1/members/me` 응답을 `cache/me.json`에 캐시 (id, name)

**이유**:

- `doctor` 실행 시 자동 캐싱 → 이후 커맨드에서 현재 사용자 정보 즉시 참조 가능
- TTL 24h (사용자 정보는 거의 불변)
- post 생성 시 `from` 자동 설정 등 향후 확장 기반

---

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

## ADR-013: SMTP 메일 발송

**결정**: nodemailer를 사용하여 Dooray SMTP(smtp.dooray.com:465)로 메일 발송

**이유**:

- 메일 조회(IMAP)만으로는 반쪽짜리 기능 → 발송까지 지원해야 CLI에서 메일 워크플로우 완결
- nodemailer는 Node.js 메일 발송 de facto 표준 (성숙, 안정)
- SMTP 인증은 IMAP과 동일한 자격증명 사용 → 추가 설정 불필요

**지원 기능**: send (to/cc/bcc/subject/body/html), reply (In-Reply-To로 스레드 유지)

**추후 고민**: 첨부파일(`--attach`) 지원

---

## ADR-014: TypeScript Path Alias 보류

**결정**: `@/` 등 path alias 도입 보류

**이유**:

- 현재 `src/` 최대 깊이 3단계 (`commands/post/comment/`) → `../../`까지가 최대로 관리 가능한 수준
- tsup(esbuild)이 `tsconfig.json` paths를 자동 resolve하지 않아 별도 플러그인 필요 → 빌드 파이프라인 복잡도 증가
- 프로젝트 규모 대비 실익이 크지 않음

**재검토 시점**: 디렉토리 깊이가 4단계 이상으로 증가하거나 대규모 리팩토링 시

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

## ADR-016: `dooray setup` 대화형 초기 설정 마법사

**결정**: `dooray setup` 커맨드로 대화형 초기 설정 마법사 제공. `postinstall` 훅 대신 명시적 커맨드 방식 채택.

**이유**:

- `postinstall`은 CI/Docker 등 non-TTY 환경에서 실패, npm 정책상 interactive postinstall 비권장
- `dooray setup`은 언제든 재실행 가능, config 미설정 시 안내 메시지로 유도
- 재실행 시 기존 설정값을 기본값으로 표시하여 부분 수정 가능

**플로우**:

1. 테넌트명 입력 (기본값: `nhnent`) — API Key 발급 링크·메일 설정 링크 생성에 사용
2. API Endpoint 선택 (4개 환경: 민간·공공·공공업무망·금융, 기본: 민간)
3. API Key 입력 (마스킹, 발급 링크 안내)
4. API 연결 테스트 → 실패 시 재입력 유도
5. 메일 사용 여부 → Y: IMAP 계정·비밀번호 입력 / n: 건너뛰기
6. 전체 입력 완료 후 config.json에 한 번에 저장 (all-or-nothing)

**라이브러리**: `@inquirer/prompts` — 선택(select), 입력(input), 비밀번호(password), 확인(confirm) 프롬프트 지원. tsup CJS 번들 호환성 확인 필요.

**안전성**: Ctrl+C 시 config 파일 미저장 (부분 저장 방지). 모든 입력을 메모리에 수집한 뒤 마지막에 한 번만 writeFile.

**config 미설정 시 안내**: 기존 에러 메시지를 `dooray setup` 실행 유도로 변경.

---

## ADR-017: api/types.ts 단일 파일 유지

**결정**: `api/types.ts`를 도메인별로 분리하지 않고 단일 파일로 유지

**이유**:

- 현재 ~440줄으로 분리 임계점(~800줄+)에 미달
- 섹션 주석으로 Common / Project / Post / Comment / Member / Workflow / Wiki / File 구분이 충분
- `DoorayApiHeader`, `DoorayApiResponse<T>` 등 Common 타입을 거의 모든 도메인이 참조 → barrel export 관리 오버헤드 대비 실익 부족
- `client.ts`에서 한 파일로 모든 타입을 import하는 현재 구조가 간결

**재검토 시점**: 800줄 이상이거나 새 도메인(Drive 등)이 2개 이상 추가될 때

---

## ADR-018: `dooray setup`에서 Claude Code 스킬 설치

**결정**: `dooray setup` 마지막 단계에서 Claude Code 스킬 설치 여부를 물어보고, 심볼릭 링크로 설치

**이유**:

- 별도 `dooray install skills` 커맨드 대신 setup 한 곳에서 완결하는 게 UX가 간결
- 심볼릭 링크 방식으로 `npm update -g` 시 스킬도 자동 최신화 (유지보수 비용 0)
- 기존 `~/.claude/skills/` 폴더의 다른 스킬들(gstack 등)도 전부 심볼릭 링크 패턴 → 일관성

**설치 메커니즘**:

- 원본 경로: `__dirname` 기반으로 `../skills/dooray-cli/` 참조 (tsup 번들이 `dist/`에 위치)
- 설치 경로: `~/.claude/skills/dooray-cli` → 원본 경로로 심볼릭 링크
- 재실행 시: 기존 링크 삭제 후 재생성 (idempotent)
- npx 환경: 임시 경로 감지 시 경고 + 건너뛰기 (global install 전용)

**doctor 검증**:

- 심볼릭 링크 → 유효성 체크 (링크 대상 존재 여부)
- 일반 파일 → 패키지 원본과 해시 비교로 최신 여부 판단
- 미설치 → `dooray setup` 안내

**package.json**: `files` 필드에 `skills/` 추가 필수 (npm publish 시 포함)

**스킬 포맷**: Claude Code 전용 (SKILL.md frontmatter 규격). 타 에이전트(Cursor, Windsurf 등) 지원은 요청 시 확장

---

## ADR-019: `post create` 메타데이터 옵션 (`--tag`/`--parent`/`--workflow`/`--milestone`)

**결정**:

- `post create`에 4개 옵션 추가. `--tag`는 반복 가능(variadic), 모두 이름 기반 lookup
- 매칭 정책: **정확일치 → 부분일치 → 모호시 후보 + 에러** (`resolveMember`/`resolveWorkflow` 등 전체 resolver에 동일 적용)
- `--parent`: `code/number` (슬래시 포함) 또는 raw `postId` (슬래시 없음). 두 형태만 허용, 자릿수 휴리스틱 없음
- `--workflow`: create API에 필드 없음 → create 후 `setPostWorkflow` 후속 호출. 실패 시 `stderr` warn + `exit 0` (post 자체는 생성 성공)
- 클라이언트 사전 검증: `tagGroup.mandatory === true` 그룹은 1개 이상 선택 강제, `selectOne === true` 그룹은 다중 선택 시 에러

**이유**:

- mandatory-tag 정책 프로젝트(예: `tc-ocr`)에서 CLI로 단 한 건의 업무도 생성 불가 → 차단 이슈 (Issue #18)
- ID 직접 입력 미지원: 사용자가 ID를 손에 들고 있는 흐름은 거의 없음. 이름 lookup만으로 단순화. 단 `--parent`만 raw postId 허용 — 부모 업무가 다른 프로젝트 또는 번호 미상일 수 있어
- `--workflow` 실패시 exit 0: 업무 ID는 이미 발급됨. CI는 `--json`으로 후처리 가능. 전체 실패 처리하면 사용자가 두 번 만들 위험
- 클라이언트 mandatory 검증: 캐시된 `tagGroup` 정보로 무료 제공. API의 `USER_INVALID_TAG_MANDATORY_PREFIX` 에러보다 친절한 메시지 (어느 그룹이 누락인지 명시)
- 전체 resolver 부분일치 통일: 멤버만 부분일치였던 비대칭 해소

**필드명 검증**:

- POST `/project/v1/projects/{projectId}/posts` body: `parentPostId`, `milestoneId`, `tagIds` (Dooray 공식 문서 확인 — 이슈 본문 curl의 `tagIdList`는 사용자 오타)
- 목록 엔드포인트: `GET /project/v1/projects/{id}/tags`, `GET /project/v1/projects/{id}/milestones` (page/size 페이지네이션, max 100)

**캐시**:

- `~/.dooray/cache/tags/{projectId}.json`, `~/.dooray/cache/milestones/{projectId}.json` (멤버·워크플로우 패턴 답습)
- TTL 24h (ADR-010)
- `CachedTag`에 `groupMandatory`, `groupSelectOne` 보존 — mandatory 검증에 필요

**대안 기각**:

- `--tag`에 휴리스틱(짧은 숫자→postNumber) 도입: ID 형식 변경 시 깨짐, A안(`/` 분기)이 단순·명확
- `--workflow` 실패시 exit non-zero: post는 이미 생성된 상태에서 전체 실패 처리는 사용자에게 "다시 만들까" 혼란 유발
- ID 직접 입력 허용: 이름 lookup 실패 시 `--workflow xxx-uuid` 폴백은 거의 사용되지 않을 흐름 — 복잡도만 증가

**후속 작업**: `post edit`에 `--tag`/`--milestone` 동일 옵션 추가 (별도 task `010-2`).
