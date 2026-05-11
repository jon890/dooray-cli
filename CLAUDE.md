# CLAUDE.md — dooray-cli

## 프로젝트 개요

NHN Dooray REST API CLI 도구. TypeScript + Commander.js 기반.

## API 스펙 확인 절차 (필수 — 신규 endpoint 사용 / 동작 검증 시)

Dooray 공식 API 문서: <https://helpdesk.dooray.com/share/pages/9wWo-xwiR66BO5LGshgVTg/2939987647631384419>

위 URL 은 인증 필요한 share 페이지 — `WebFetch` 로 직접 접근 안 됨. **`cmux-browser` skill** 로 열어서 본문 / endpoint / request·response 스키마 / 동작 특이점 확인 후 코드 작성. 본 repo 는 공식 문서 사본을 두지 않는다 (stale 위험 회피) — 공식이 단일 진실원.

문서에 명시되지 않거나 직관에 반하는 동작은 ADR 로 보존 (예: ADR-015 파일 307, ADR-025 post cc/to full PUT, ADR-026 wiki 함정 묶음). `CLAUDE.md` "상황별 ADR 필수 참조" 표에서 영역별로 빠르게 찾는다.

## 빌드 & 실행

```bash
pnpm install          # 의존성 설치
pnpm run build        # tsup 빌드 (dist/index.js 단일 번들)
pnpm tsc --noEmit     # 타입 체크 전용 (런타임 번들에는 미사용)
node dist/index.js    # 직접 실행
dooray                # 글로벌 링크 시
```

**역할 분리 (`tsconfig.json` `moduleResolution: "Bundler"`)**: `tsup`(esbuild) 이 ESM-only 패키지 (`chalk`/`ora`/`ky`/`@inquirer/prompts`)를 inline transform 으로 처리해 단일 CJS 번들 생성. `tsc` 는 타입 체크 전용이며 런타임 번들에는 관여하지 않음. 새 의존성 추가 시 `package.json` `exports` 맵 진입점이 의도와 맞는지 한 번 확인 (Bundler 모드는 Node16 대비 exports 검증이 완화됨).

## 디렉토리 구조

```
src/
  index.ts              # CLI entrypoint
  api/client.ts         # DoorayApiClient (ky 기반)
  api/imapClient.ts     # IMAP 메일 조회 (imapflow + mailparser)
  api/types.ts          # API 요청/응답 타입
  cache/store.ts        # ~/.dooray/cache/ 디렉토리 기반 캐시 CRUD
  cache/types.ts        # CacheEntry, Cached* 타입
  resolvers/            # me, project, member, workflow, post, wiki resolver
  commands/             # Commander.js 커맨드 (project, post, post/file, wiki, mail, config, cache, doctor)
  editor/index.ts       # $EDITOR 연동 + YAML frontmatter 파싱
  formatters/           # 테이블/JSON/quiet 출력
  utils/                # errors, spinner, exit-codes
```

## 스킬 폴더 구분

- `skills/` — 공개 스킬. 다른 사용자가 dooray-cli 사용법을 참고하기 위한 스킬 파일 (예: `skills/dooray-cli/SKILL.md`)
- `.claude/skills/` — 내부 스킬. Claude Code가 실제로 로드하여 실행하는 개발 워크플로우 스킬 (예: `/release`)

## 코드 컨벤션

- HTTP 클라이언트: `ky` (axios 사용 금지)
- 빌드: `tsup` (CJS 단일 번들, shebang 포함)
- 패키지 매니저: `pnpm`
- 캐시: `~/.dooray/cache/` 디렉토리에 파일별 분리 (me.json, projects.json, members/{id}.json, workflows/{id}.json)
- config: `~/.dooray/config.json` (env var 폴백 없음)
- 에러: `DoorayCliError(message, exitCode)` 로 통일
- 출력: 데이터는 stdout, 스피너/에러는 stderr

## 벤치마크

```bash
bash scripts/benchmark.sh [project] [post-number] [wiki-page-id]
# cold (캐시 없음, 3s) + warm (캐시 있음, 0.2s) 측정
```

## 주의사항

- `post edit`, `comment edit`은 `--title`/`--body` 옵션으로 non-interactive 사용 가능 (`--subject`는 deprecated alias, stderr 경고 후 동작)
- `post create`는 `--title` 필수 (또는 `--subject` alias)
- `post create`는 `--tag` (반복) / `--parent` (`code/number` 또는 raw postId) / `--workflow` / `--milestone` 지원. mandatory-tag 그룹은 클라이언트가 사전 검증
- post 하위 17개 명령(get/edit/done/workflow + comment 5개 + file 5개 + comment file 4개)은 `<project> <post-number>` 외에도 `--id <postId>` / `--url <url>` / 첫 positional에 Dooray URL 직접 입력 지원. post / comment / file 13개는 `resolvePostInput`, comment file 4개는 `resolveCommentFileInput` (내부에서 `resolvePostInput` 위임 + comment-id·secondary 분기 추가) 헬퍼에서 분기
- `dooray post comment file *` 4 명령(list/upload/download/delete) — 댓글에 첨부된 파일 관리. Dooray 가 댓글 전용 endpoint 미지원이라 내부적으로 post-level files API + 댓글 본문 PUT(`![filename](/files/<id>)` markdown) 합성으로 동작 (ADR-024). `delete` 는 markdown 제거 + 파일 삭제 둘 다 수행 (atomic 보장 없음 — 부분 성공 시 stderr 안내 + non-zero exit)
- `dooray member get/list` 명령으로 표시명 조회. `post comment list` table 출력은 Creator 컬럼을 project 멤버 캐시로 enrich (단 `--json`은 raw 유지)
- `dooray feedback`은 GitHub issue를 `gh` CLI에 위임해서 생성. baseUrl/시크릿은 자동 메타에 미포함. `--last`로 직전 명령의 sanitized argv + 에러를 본문 상단에 자동 첨부 (opt-in: `dooray config set track-last-run true`, ADR-023)
- 제목 옵션 이름은 post·wiki 모두 `--title`로 통일 (Issue #8)
- resolver(멤버·워크플로우·태그·마일스톤)는 정확일치 → 이름 부분일치, 모호하면 에러 + 후보 목록 출력
- 멤버 resolver (`resolveMember`) 는 입력 형식 자동 분기: 19자리 이상 숫자 → `getMemberDetail` 로 organizationMemberId 검증 / 이메일 (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) → `searchMembers({externalEmailAddresses})` exact / 그 외 → matchByName. `--to`/`--cc`/`--mention` 모두 동일
- post 목록은 최신순 정렬 (`-createdAt`)
- `post edit` / `post comment edit` 는 본문 full-replace. 새 본문에 기존 attachment markdown(`![](/files/<id>)`) 누락 시 (y/N) confirm. non-TTY 는 abort, `--no-confirm` 으로 우회.
- `post create` / `post edit` / `post comment add/edit` 4 명령 모두 `--mention` / `--mention-group` / `--link-task` / `--dry-run` 동일 옵션 지원. mention 은 prepend, link-task 는 append, 적용 순서는 mention → link-task. interactive ($EDITOR) 모드의 `post edit` 는 mention/link-task 무시 + 경고
- `post edit` 는 참조자/담당자 변경 옵션 6개 지원: `--cc <name>` / `--cc-group <code>` (반복) + `--cc-clear` + 동일 `--to` 3개. 기본 append (기존 cc/to 유지 + dedupe), `--*-clear` 는 기존 비우고 신규만. `post create` 는 `--cc-group` / `--to-group` 2개 추가. group 은 `type: "group"` + `projectMemberGroupId` 로 전송 (ADR-025). interactive 모드는 이 6+2 옵션 무시 + 경고
- `post edit --parent <ref>` 는 상위 업무 설정/변경 — `client.setPostParent` (별도 `POST .../set-parent-post` endpoint) 호출. `updatePost` 의 full payload 가 아닌 dedicated endpoint 사용 (Dooray API contract). Dooray 가 `unset-parent-post` 미제공 → **parent 해제 (top-level 화) 는 웹 UI 에서 처리**. interactive 모드 무시 + 경고

## 상황별 ADR 필수 참조

아래 작업을 할 때는 해당 ADR을 반드시 먼저 읽는다 — 라이브러리 고유 함정·실험 결과·정책 근거가 담겨 있어 모르고 진행하면 버그 재발 위험.

| 상황 | 필수 확인 ADR |
|---|---|
| 새 HTTP 요청 (retry·timeout·error 분기) | **ADR-002** (ky) |
| `~/.dooray/cache/` 구조 변경 | **ADR-004**, **ADR-010** (TTL + 파일 분리) |
| IMAP 메일 조회 기능 | **ADR-012** (imapflow + 서버 특이점) |
| SMTP 메일 발송 기능 | **ADR-013** (nodemailer) |
| 멤버·프로젝트 이름 부분일치 | **ADR-008** (모호 → 에러 + 후보) |
| post 메타데이터 (태그/부모/워크플로우/마일스톤) 옵션 | **ADR-019** (이름 lookup + mandatory 사전 검증 + workflow 후속 호출 정책) |
| post 명령 input 통합 (`--id`/URL/positional) + 단위 테스트 | **ADR-020** (분기 규칙 + vitest 도입 근거) |
| `member` 명령 + 표시명 enrich | **ADR-021** (캐시 전략 + table-only enrich + list/get 시그니처) |
| `feedback` 명령 (GitHub issue 등록) | **ADR-022** (gh CLI 위임 + sanitization 정책) |
| `feedback --last` (last-run 추적) | **ADR-023** (opt-in + 에러시만 + 최소 세트 + argv 패턴 마스킹) |
| `comment file *` 명령 (list/upload/download/delete) | **ADR-024** (post-level files API + 댓글 PUT 합성 — Dooray 댓글 전용 endpoint 부재) |
| `post edit/create` 의 cc/to 변경 (멤버/그룹) | **ADR-025** (full payload PUT + `type: "group"` + `projectMemberGroupId`) |
| Wiki 명령 (`wiki page create/edit`) 추가/수정 | **ADR-026** (parentPageId 자동 폴백 + `--title`→`subject` 매핑 + 수정 endpoint 3종 분기) |
| 파일 업로드/다운로드 (307 처리) | **ADR-015** (수동 redirect + Auth 헤더 재첨부) |
| `dooray setup` 마법사 변경 | **ADR-016**, **ADR-018** (대화형 + 스킬 설치) |
| 새 Commander.js 서브커맨드 추가 | (ADR 없음 — 기존 `commands/*.ts` 패턴 참조) |
| 새 출력 포맷 (table/json/quiet) | (ADR 없음 — 기존 `formatters/*.ts` 패턴 참조) |
| 에러 처리·exitCode 정책 | (ADR 없음 — `src/utils/errors.ts` + `src/utils/exit-codes.ts` 직접 확인) |

신규 ADR 추가 시 본 표에 행 추가. **"(등록 필요)" 플레이스홀더 사용 금지** — ADR이 정말 없으면 위처럼 "(ADR 없음 — 코드 위치)" 형식으로 직접 가리키거나 표에서 행 자체를 빼는 쪽이 낫다.

## 토큰 효율 (Opus/Sonnet 라우팅)

- **논의·계획·docs 작성**: main 세션 (opus 허용)
- **task phase 실행**: sonnet 기본 — rename, 리팩토링, 다중 파일 수정도 sonnet
- **task phase에서 opus 사용 금지 예외**:
  - 새 아키텍처 설계가 phase 안에 있는 경우
  - 복잡 알고리즘 설계 (도메인 핵심 신규 설계)
- **기계적 작업은 opus 금지** — rename/이동/경로 수정 등은 파일 수가 많아도 sonnet으로 충분
- 빌드 검증·커밋 phase는 haiku

**Why**: Opus는 Sonnet의 약 5배 비싸고 Claude Code Max 5시간 한도를 빠르게 소모.

## 파일 읽기 효율

- **전체 파일 읽기 금지** (200줄 초과 시) — offset+limit로 필요한 섹션만
- **같은 파일 반복 읽기 금지** — 같은 세션 내에서는 기억해서 재사용
- **대형 docs 파일** (`docs/adr.md` 등)은 grep으로 필요 섹션만 찾아 offset 지정

## 조사/탐색 접근 방식

- **직접 질문에는 직접 답변부터** — 사용자가 특정 파일/영역/패턴을 명시했다면 해당 위치부터 확인. 광범위한 codebase 탐색 금지
- **사용자가 조사 경로를 제시했으면 그 경로부터** — 지시받은 영역에서 codebase 전체를 먼저 뒤지지 않는다
- **Explore agent는 최후 수단** — Grep/Glob/Read로 3번 이상 시도한 후에도 못 찾을 때만 사용
- **가정 없이 주장하지 않기** — "dead code", "미사용" 같은 판단은 실제로 참조를 grep한 후에만 제기

## 사용자에게 선택지 제시

- **선택지·옵션·분기 결정을 묻는 모든 자리에 `AskUserQuestion` 도구 사용** (`/planning` 안이든 밖이든 무관). markdown 체크박스 표·번호 리스트로 옵션 나열 금지 — 사용자가 일일이 타이핑해야 함
- 옵션 2~4개, 추천안은 첫 번째 + label 끝에 `(추천)` 표기. 추천 이유는 `description` 한 줄로 설명
- 모호함 해소가 필요한 시점이면 자리 미루지 말고 즉시 묻는다 — 가정으로 진행했다가 수정 요청 받는 비용이 더 큼
- 복잡한 비교가 필요한 질문은 옵션마다 `preview` (ASCII 다이어그램·코드 스니펫)로 시각화하여 답변 부담 최소화
- "당연히 그렇게 가는" 결정(예: 기존 패턴 답습, 변경 없음)은 굳이 묻지 말고 본문에 "권장: 그대로" 한 줄로 처리. 진짜 분기가 있는 사항만 `AskUserQuestion`

## PII / 사내 식별자 노출 금지 (public OSS)

이 repo는 GitHub public이므로 다음 식별자는 **README/skills/docs/CLAUDE.md/이슈 본문 어디에도 노출 금지**. 코드 예시·시나리오·issue body 작성 시 항상 placeholder 사용.

| 노출 금지 | 대체 |
|---|---|
| 사내 Dooray 프로젝트 코드 (예: `tc-ocr`) | `<project>` |
| NHN 도메인 (`nhnent`, `nhn.com`, `nhnent.com`, `nhn-comico` 등) | `<tenant>` / `example.com` |
| 사내 이메일 (`*@nhn*.com`, `*@example.com` 사용 사외) | `user@example.com` |
| 실제 19자리 numeric ID (postId/pageId/memberId/projectId/groupId) | `<postId>` / `<pageId>` / `<memberId>` 등 |
| 실명 (사용자 본인 + 동료 한국어 이름) | `<사용자A>` 또는 가상 이름(`홍길동`/`김철수`) — 가상은 OK |
| Dooray orgId (실제 19자리) | `<orgId>` |

**검증 grep** (commit/이슈 작성/release 전 실행):

```bash
# cwd: <repo root>
grep -rnE "tc-ocr|nhnent|nhn-comico|@(nhn|nhnent)\.com|kim@example\.com" README.md skills/ docs/ CLAUDE.md 2>/dev/null
# 0건이어야 함

# 19자리 numeric (단 doc 예시의 dummy 패턴 1234567890123456789, 9876543210987654321은 OK)
grep -rnE "[0-9]{15,}" README.md skills/ docs/ 2>/dev/null | grep -vE "1234567890123456789|9876543210987654321|<postId>|<pageId>"
# 0건이어야 함 (남으면 실제값 가능성 — 검토 후 placeholder 또는 dummy로 교체)
```

**자동화**: `/release` 스킬 Step 3(문서 동기화)에 PII gate 통합 — release 전 자동 검증.

**예외**: 사용자가 명시적으로 "내부 wiki라 OK" 등 동의한 경우만. 디폴트는 placeholder.

## Task 작업 규칙

- 각 phase는 **원자적 단일 책임** — 다른 관심사면 별도 phase로 분리. **작업 항목 5개 이하** 엄수
- **task 파일 생성 즉시 git commit** — index.json + phase 파일을 실행 전에 커밋
- task 완료 즉시 git commit (index.json 상태 갱신 포함)
- 각 phase 프롬프트는 **자기완결적** (이전 대화 없이 독립 실행 가능)
- **docs 최신화는 task 생성 전 필수** — task phase 내에서 docs 변경 금지

**Why "5개 이하"**: AI 에이전트는 작업 항목이 많으면 뒤쪽을 누락하는 경향 (실증: 11개 항목 중 뒤 3개 누락 사고).

## Git & PR Conventions

PR 제목은 반드시 아래 형식을 따른다:

```
type(scope): description
```

예시:
- `feat(commands): add wiki search subcommand`
- `fix(cache): resolve atomic write race in member store`
- `docs(adr): add ky retry policy ADR`

이 형식에서 절대 벗어나지 않는다.
