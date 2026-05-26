# CLAUDE.md — dooray-cli

## 프로젝트 개요

NHN Dooray REST API CLI 도구. TypeScript + Commander.js 기반.

## API 스펙 확인 절차 (필수 — 신규 endpoint 사용 / 동작 검증 시)

Dooray 공식 API 문서: <https://helpdesk.dooray.com/share/pages/9wWo-xwiR66BO5LGshgVTg/2939987647631384419>

위 URL 은 인증 필요한 share 페이지 — `WebFetch` 로 직접 접근 안 됨. **`cmux-browser` skill** 로 열어서 본문 / endpoint / request·response 스키마 / 동작 특이점 확인 후 코드 작성. 본 repo 는 공식 문서 사본을 두지 않는다 (stale 위험 회피) — 공식이 단일 소스.

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
  commands/             # Commander.js 커맨드 (project, post, post/file, wiki, wiki/page-file, mail, config, cache, doctor)
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
- 캐시: `~/.dooray/cache/` 디렉토리에 파일별 분리 (me.json, projects.json, members/{projectId}.json, workflows/{projectId}.json, tags/{projectId}.json, templates/{projectId}.json)
- config: `~/.dooray/config.json` (env var 폴백 없음)
- 에러: `DoorayCliError(message, exitCode)` 로 통일
- 출력: 데이터는 stdout, 스피너/에러는 stderr

## 벤치마크

```bash
bash scripts/benchmark.sh [project] [post-number] [wiki-page-id]
# cold (캐시 없음, 3s) + warm (캐시 있음, 0.2s) 측정
```

## 주의사항

자기 규약 (CLAUDE.md "docs / ADR 작성 형식" 6가지 패턴) 자체 적용 — 한 bullet 다중 속성 압축 금지, sub-bullet 분리.

### 공통 — 명령 입력 통합

- post 17 명령 input 통합 (ADR-020)
  - 대상: `get` / `edit` / `done` / `workflow` + comment 5 + file 5 + comment file 4
  - 입력 형식: `<project> <post-number>` / `--id <postId>` / `--url <url>` / 첫 positional 에 Dooray URL 직접 입력
  - 분기 헬퍼: post / comment / file 13 = `resolvePostInput` / comment file 4 = `resolveCommentFileInput` (`resolvePostInput` 위임 + comment-id 분기)
- wiki page file 5 + comment 6 명령 input 통합
  - 분기 헬퍼: `resolveWikiPageInput` (`resolveProject` + URL `/wiki/<wikiId>/<pageId>` parser)
  - `--id <pageId>` 모드는 `--project <code>` 동반 필수 (wiki API 가 page-only fetch 미지원)

### 공통 — 옵션 / 출력 표준

- 제목 옵션 이름 통일: post · wiki 모두 `--title` (Issue #8)
- 본문 옵션 통일: `--body` / `--body-file` (`-` = stdin)
- post 목록 정렬: 최신순 (`-createdAt`)
- `--subject` 는 deprecated alias — stderr 경고 후 동작

### post create

- 필수: `--title` (또는 `--subject` alias)
- 메타데이터 옵션 (ADR-019): `--tag` (반복) / `--parent` (`code/number` 또는 raw postId) / `--workflow` / `--milestone`
- mandatory-tag 그룹: 클라이언트가 사전 검증
- 참조자 / 담당자 그룹 (ADR-025): `--cc-group` / `--to-group` (멤버는 본문에서 명시)
- mention / link-task / dry-run: 4 명령 (create + edit + comment add/edit) 공통
- 템플릿 (`--template <name|id>`, ADR-027)
  - lookup: `GET .../templates` (resolver matchByName 부분일치)
  - 본문 채움: `GET .../templates/{id}?interpolation=true` → 시스템 매크로 (`${year}` 등) 치환된 본문/users/tags
  - override: 사용자 옵션 (`--title`/`--body`/`--tag`/`--to`/`--cc`) 명시 입력 시 템플릿 값 덮어씀
  - `--field key=value` 사용자 정의 변수: 본 scope 외 (별도 후속)
  - 목록 조회 명령: `dooray project templates <project>`
  - 캐시 TTL: 24h (tag/workflow 와 동일 패턴)

### post edit

- non-interactive 트리거: `--title` / `--body` / `--body-file` 중 하나라도 있으면 $EDITOR 미진입. tag 옵션도 트리거에 포함 (`--tag` / `--tag-clear` / `--tag-remove`)
- 본문 full-replace 시 attachment 보호
  - 새 본문에 기존 attachment markdown (`![](/files/<id>)`) 누락 시 (y/N) confirm
  - non-TTY: abort. `--no-confirm` 으로 우회
- tag 옵션 (Issue #66, ADR-019 확장)
  - 지원: `--tag` (반복) / `--tag-clear` / `--tag-remove` (반복)
  - mandatory 검증 동일 적용
  - `--title`/`--body` 없이 단독 호출 가능 — 기존 본문은 자동 재전송
  - 머지 로직: `src/resolvers/post-tags.ts` `mergeTagIds` (clear → remove → add → dedupe)
  - interactive 분기 자체 발생 안 함 (cc/parent 와 달리 nonInteractive 조건에 포함)
- 참조자 / 담당자 변경 옵션 6개 (ADR-025)
  - 멤버: `--cc <name>` (반복) + `--cc-clear` / 동일 `--to` 3개
  - 그룹: `--cc-group <code>` (반복) — `type: "group"` + `projectMemberGroupId` 로 전송
  - 기본: append (기존 유지 + dedupe). `--*-clear` 는 기존 비우고 신규만
  - interactive 모드: 6 옵션 무시 + 경고
- `--parent <ref>` 옵션
  - endpoint: `client.setPostParent` (`POST .../set-parent-post` dedicated, `updatePost` full payload 아님)
  - parent 해제 (top-level 화): Dooray 가 `unset-parent-post` 미제공 → **웹 UI 에서 처리**
  - interactive 모드 무시 + 경고
- mention / link-task / dry-run: post create 와 동일 4 명령 공통. interactive 모드는 무시 + 경고

### post comment

- `comment edit` 본문 full-replace + attachment confirm 동작 — `post edit` 와 동일
- `comment add` / `comment edit`: `--title`/`--body` 또는 $EDITOR fallback
- mention / link-task / dry-run: post create/edit 와 동일 4 명령 공통
- `comment list` table 출력 — Creator 컬럼을 project 멤버 캐시로 enrich (`--json` 은 raw 유지)
- `post comment file *` 4 명령 (list/upload/download/delete, ADR-024)
  - Dooray 가 댓글 전용 file endpoint 미지원 → 내부적으로 post-level files API + 댓글 본문 PUT 합성
  - 본문 마크업: `![filename](/files/<id>)` markdown reference
  - `delete`: markdown 제거 + 파일 삭제 둘 다 수행 (atomic 보장 없음)
  - 부분 성공: stderr 안내 + non-zero exit

### wiki page file (Issue #70, ADR-029)

- 5 명령: `list` / `upload` / `download` / `download-all` / `delete`
- post file 명령군 mirror — `<project> <page-id>` + `--id` + `--url` + positional URL
- upload
  - `--type general|inline_image` flag (기본 `general`)
  - **multipart 필드 순서 의존**: `type` 필드를 `file` 보다 먼저 append 해야 정상 동작 (ADR-029, Dooray 서버 검증)
  - inline_image 일 때: 본문 markdown 자동 삽입 안 함 — stdout 에 `attachFileId` + 사용자 직접 박을 snippet 안내
- list: 별도 endpoint 부재 → `getWikiPage` 의 `result.files[]` (general) + `result.images[]` (inline) 합성
- delete: confirm 없이 즉시 (post file delete mirror)

### wiki page comment (task 036)

- 6 명령: `list` / `latest` / `get` / `add` / `edit` / `delete`
- post comment 패턴 mirror — `resolveWikiPageInput` 재사용
- post comment 대비 시그니처 축소 — wiki API 미지원
  - mention / mention-group 없음
  - cc / 받는 사람 없음
  - 첨부 파일 없음 (댓글 전용 endpoint 부재)
- `add` / `edit`: `--body` / `--body-file` 또는 `$EDITOR` fallback
- 타입 / 포맷터
  - `WikiComment` 타입 신설 — `page.id` + `creator.member` 시그니처 (PostComment 와 분리)
  - `formatters/wiki-comment.ts` 전용 포맷
- request body: `{ body: { content } }` 만 (mimeType 미전송 — wiki API 스펙)
- delete: confirm 없이 즉시

### resolver

- 일반 정책: 정확일치 → 이름 부분일치 → 모호 시 에러 + 후보 목록 출력 (멤버 · 워크플로우 · 태그 · 마일스톤 공통)
- project resolver (`resolveProject`) — numeric 입력 cache 우회 fallback (ADR-030, Issue #78)
  - 입력 형식 자동 분기: numeric 15+자리 → 그대로 projectId 반환 (cache 우회) / 그 외 → cache 매칭 (code + id)
  - 권한 검증: 후속 API 호출 (getPosts 등) 의 4xx 에 위임 — `member=me` 응답 외 프로젝트도 자동화 가능
  - 13 호출자 (post create/list/search, member/list, project/templates·tags·groups·members·workflows, post-input, postRef, wiki) 자동 혜택
  - wiki resolver freshness — numeric 우회 시 cache 갱신 누락. 사용자에게 `dooray cache refresh` 안내
- member resolver (`resolveMember`) 입력 형식 자동 분기
  - 15자리 이상 숫자: `getMemberDetail` 로 organizationMemberId 검증
  - 이메일 (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`): `searchMembers({externalEmailAddresses})` exact
  - 그 외: matchByName
  - 적용 옵션: `--to` / `--cc` / `--mention` 모두 동일
- group resolver (`resolveMemberGroup`) — 응답 shape 정규화 + id 직접 입력 fallback (ADR-028, Issue #65, #76)
  - 응답 정규화: `fetchAllMemberGroups` 가 `res.result.flat()` 로 nested array (`[[g1, g2]]`) 평면화 (Dooray API 실측 shape 대응, 2026-05-22)
  - 입력 형식 자동 분기: numeric 15+자리 → id 직접 매칭 (response shape 가 다시 변할 robustness) / 그 외 → code matchByName (부분일치)
  - `code` 누락 그룹 가드 유지: 개별 누락 가능성 대비 — `match.ts` 의 `!!i.name && i.name.includes`
  - not-found 안내: `options.helpHint` 로 "전체 목록은 dooray project groups <project>" + "id 직접 입력 가능 (15+자리 numeric)" AI 친화 출력
  - 적용 옵션: `--cc-group` / `--to-group` / `--mention-group` 모두 동일 (5 호출자 통합)

### member 명령

- `dooray member get/list` 로 표시명 조회
- `post comment list` table 의 Creator 컬럼: project 멤버 캐시로 enrich (ADR-021)
- `--json` 출력: raw 유지 (enrich 미적용)

### feedback (ADR-022/023)

- GitHub issue 생성: `gh` CLI 에 위임. baseUrl / 시크릿은 자동 메타에 미포함
- `--last`: 직전 명령의 sanitized argv + 에러를 본문 상단에 자동 첨부 (opt-in)
- 사전 활성화: `dooray config set track-last-run true`

## 상황별 ADR 필수 참조

아래 작업을 할 때는 해당 ADR을 반드시 먼저 읽는다 — 라이브러리 고유 함정·실험 결과·정책 근거가 담겨 있어 모르고 진행하면 버그 재발 위험.

| 상황                                                       | 필수 확인 ADR                                                                                  |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 새 HTTP 요청 (retry·timeout·error 분기)                    | **ADR-002** (ky)                                                                               |
| `~/.dooray/cache/` 구조 변경                               | **ADR-004**, **ADR-010** (TTL + 파일 분리)                                                     |
| IMAP 메일 조회 기능                                        | **ADR-012** (imapflow + 서버 특이점)                                                           |
| SMTP 메일 발송 기능                                        | **ADR-013** (nodemailer)                                                                       |
| 멤버·프로젝트 이름 부분일치                                | **ADR-008** (모호 → 에러 + 후보)                                                               |
| post 메타데이터 (태그/부모/워크플로우/마일스톤) 옵션       | **ADR-019** (이름 lookup + mandatory 사전 검증 + workflow 후속 호출 정책)                      |
| post 명령 input 통합 (`--id`/URL/positional) + 단위 테스트 | **ADR-020** (분기 규칙 + vitest 도입 근거)                                                     |
| `member` 명령 + 표시명 enrich                              | **ADR-021** (캐시 전략 + table-only enrich + list/get 시그니처)                                |
| `feedback` 명령 (GitHub issue 등록)                        | **ADR-022** (gh CLI 위임 + sanitization 정책)                                                  |
| `feedback --last` (last-run 추적)                          | **ADR-023** (opt-in + 에러시만 + 최소 세트 + argv 패턴 마스킹)                                 |
| `comment file *` 명령 (list/upload/download/delete)        | **ADR-024** (post-level files API + 댓글 PUT 합성 — Dooray 댓글 전용 endpoint 부재)            |
| `post edit/create` 의 cc/to 변경 (멤버/그룹)               | **ADR-025** (full payload PUT + `type: "group"` + `projectMemberGroupId`)                      |
| Wiki 명령 (`wiki page create/edit`) 추가/수정              | **ADR-026** (parentPageId 자동 폴백 + `--title`→`subject` 매핑 + 수정 endpoint 3종 분기)       |
| Wiki page file 명령 (`wiki page file *`) 추가/수정         | **ADR-029** (multipart `type` 필드 순서 의존 + 307 redirect — ADR-015 재사용)                  |
| member-group resolver (응답 shape 정규화 + 가드)           | **ADR-028** (nested array unwrap `flat()` + id 직접 입력 fallback + `match.ts` 가드, Issue #65 #76) |
| project resolver (numeric 입력 fallback)                   | **ADR-030** (`PROJECT_ID_RE` 분기 + cache 우회 + 권한은 후속 API 4xx 위임, Issue #78)         |
| `post create --template` + `project templates` 명령        | **ADR-027** (interpolation 기본 true + 사용자 옵션 우선 override + `--field` 사용자 변수 제외) |
| 파일 업로드/다운로드 (307 처리)                            | **ADR-015** (수동 redirect + Auth 헤더 재첨부)                                                 |
| `dooray setup` 마법사 변경                                 | **ADR-016**, **ADR-018** (대화형 + 스킬 설치)                                                  |
| 새 Commander.js 서브커맨드 추가                            | (ADR 없음 — 기존 `commands/*.ts` 패턴 참조)                                                    |
| 새 출력 포맷 (table/json/quiet)                            | (ADR 없음 — 기존 `formatters/*.ts` 패턴 참조)                                                  |
| 에러 처리·exitCode 정책                                    | (ADR 없음 — `src/utils/errors.ts` + `src/utils/exit-codes.ts` 직접 확인)                       |

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

## 한국어 표현 정책

docs / skill / task 파일을 한국어로 작성할 때 **한국인이 자연스럽게 읽히는 표현을 우선** 한다. 영어 단어를 한자/한글 음차한 표현 (특히 "X 게이트", "X 트리아지", "X 매트릭스" 같은 외래어 합성) 은 사용 금지.

| 금지                  | 권장 대체                                                                     |
| --------------------- | ----------------------------------------------------------------------------- |
| 자명성 게이트         | **ADR 작성 전 점검** (자명성 자체는 한자어 OK — 동사화 "자명한지 확인" 도 OK) |
| 매트릭스 (matrix)     | **표** / **영향 표** / **분류 표** / **변경-docs 매핑 표**                    |
| 트리아지 (triage)     | **분류** / **우선순위 분류**                                                  |
| 베이스라인 (baseline) | **기준선** / **기준값**                                                       |
| 스파이크 (spike)      | **사전 조사** / **API 검증**                                                  |
| 사전 소진             | **사전 해소** ("소진" 은 자원 고갈 비유 — 직관 어려움)                        |
| 단일 진실원           | **단일 소스** ("진실원" 은 truth-source 직역, 한국어 자연어 아님)             |
| 변질 의심             | **변질 우려** ("의심" 보다 "우려" 가 더 자연)                                 |
| 패턴 답습             | **동일 패턴 적용** / **그대로 적용** ("답습" 은 "낡은 것 베끼기" 부정 뉘앙스) |

이 정책은 **새 작성물에 우선 적용**한다. 기존 문서에서 위 표현이 발견되면:

- 현재 편집 중인 파일이면 함께 정리
- 작업 외 파일이면 사용자에게 알려 별도 정리 여부를 물어본다 (일괄 교체 PR 등)

표에 없는 외래어라도 같은 원칙 (한국인 독해 자연스러움) 으로 자체 판단. 단 **기술 용어 그대로 쓰는 게 표준인 경우** (예: `rebase`, `merge`, `commit`, `endpoint`, `payload`) 는 그대로 유지 — 한국어 대체가 오히려 어색.

## docs / ADR 작성 형식 (가독성 + 토큰 효율)

대상: `docs/*.md` / `CLAUDE.md` / `tasks/**/*.md` / `README.md` / `skills/dooray-cli/SKILL.md` / `.claude/skills/**/*.md`.

목표는 두 가지 — 작성자가 읽기 쉬울 것 (가독성), LLM 컨텍스트 비용을 늘리지 않을 것.
두 목표가 충돌할 때는 가독성을 우선한다.

### 1. semantic line break (문장당 1줄)

한 단락 안의 문장은 줄바꿈으로 분리.
markdown 렌더링 결과는 동일하지만 소스 가독성 ↑ + git diff 정밀 + 토큰 동일.

**금지**: 한 단락에 2 문장 이상 같은 줄에 이어쓰기.

```markdown
나쁨: A 채택. B 가 더 빠르지만 C 위험. D 보류.
좋음:
A 채택.
B 가 더 빠르지만 C 위험.
D 보류.
```

### 2. enumerated inline 금지

`① ... ② ... ③ ...` / `1) ... 2) ... 3) ...` / 슬래시 나열 (`A / B / C` 3개 이상) 형식은
markdown bullet list 로 변환한다.

```markdown
나쁨: 정책 ① X 적용, ② Y 검증, ③ Z 제외.
좋음:

- X 적용
- Y 검증
- Z 제외
```

### 3. 괄호 중첩 2겹 이상 금지

`(... (...) ...)` 같은 중첩이 발생하면 단락 분리 또는 bullet 분리로 평탄화한다.

### 4. `=` / `→` 동치·인과 압축은 한 단락 1회만

여러 동치 / 인과 관계를 한 문장에 압축하지 않는다.
각 관계마다 별 문장 + 줄바꿈으로 분리.

### 5. 한 문장이 길면 의미 단위 분할

한 문장이 약 80자 초과 + 백틱 3개 이상 또는 괄호 다수면 의미 단위로 나눈다.
"한국어 문장 + 영어 약어 + 코드 inline" 혼재는 가독성 손실의 주범.

### 6. 한 bullet 에 다중 속성 압축 금지 — sub-bullet 으로 분리

한 bullet 안에 **무엇 / 어떻게 / 예외 / 조건 / 근거** 중 2개 이상의 독립 속성을 다음 연결로
이어 압축하지 않는다.
각 속성은 sub-bullet 으로 분리.

- 마침표 (`. ... .`) — 여러 문장
- 콤마 (`A, B, C`) — 병렬 항목
- 더하기 (`A + B + C`) — 변경 사항·구성 요소 나열
- 슬래시 (`A / B / C` 3개 이상) — 패턴 2 와 중첩

특히 release 노트 / ADR / task 설명에서 "옵션 — 동작 + 정책 + 출처" 같은 다층 정보가
한 줄에 모이기 쉬움.

```markdown
나쁨:
- `--template <name|id>` — 템플릿 기반 task 생성. `interpolation=true` 기본으로 매크로
  치환, 사용자 옵션 명시 시 override (Issue #59, ADR-027)
- fix: `match.ts` undefined 가드 + adapter 사전 필터 + `Type.code` optional 완화

좋음:
- `--template <name|id>` — 템플릿 기반 task 생성 (Issue #59, ADR-027)
  - 기본 동작: `interpolation=true` — 시스템 매크로 (`${year}` 등) 치환
  - override: 사용자 옵션 명시 입력 시 우선
- fix
  - `match.ts` 에 undefined / 빈 문자열 가드
  - adapter 단에서 사전 필터
  - `Type.code` 를 optional 로 완화
```

### 적용 시점

- **신규 작성**: 위 6가지 패턴 자체 점검 후 commit
- **기존 docs**: 편집 중인 파일은 함께 정리. 일괄 정리는 별도 task
- **review**: code-reviewer / critic / docs-verifier 가 6가지 패턴 위반을 지적할 수 있음

## 사용자에게 선택지 제시

- **선택지·옵션·분기 결정을 묻는 모든 자리에 `AskUserQuestion` 도구 사용** (`/planning` 안이든 밖이든 무관). markdown 체크박스 표·번호 리스트로 옵션 나열 금지 — 사용자가 일일이 타이핑해야 함
- 옵션 2~4개, 추천안은 첫 번째 + label 끝에 `(추천)` 표기. 추천 이유는 `description` 한 줄로 설명
- 모호함 해소가 필요한 시점이면 자리 미루지 말고 즉시 묻는다 — 가정으로 진행했다가 수정 요청 받는 비용이 더 큼
- 복잡한 비교가 필요한 질문은 옵션마다 `preview` (ASCII 다이어그램·코드 스니펫)로 시각화하여 답변 부담 최소화
- "당연히 그렇게 가는" 결정(예: 기존 패턴 그대로 적용, 변경 없음)은 굳이 묻지 말고 본문에 "권장: 그대로" 한 줄로 처리. 진짜 분기가 있는 사항만 `AskUserQuestion`

## 개인 식별 정보 / 사내 식별자 노출 금지 (public OSS)

이 repo는 GitHub public이므로 다음 식별자는 **README/skills/docs/CLAUDE.md/이슈 본문 어디에도 노출 금지**. 코드 예시·시나리오·issue body 작성 시 항상 placeholder 사용.

| 노출 금지                                                         | 대체                                                      |
| ----------------------------------------------------------------- | --------------------------------------------------------- |
| 사내 Dooray 프로젝트 코드 (예: `tc-ocr`)                          | `<project>`                                               |
| NHN 도메인 (`nhnent`, `nhn.com`, `nhnent.com`, `nhn-comico` 등)   | `<tenant>` / `example.com`                                |
| 사내 이메일 (`*@nhn*.com`, `*@example.com` 사용 사외)             | `user@example.com`                                        |
| 실제 19자리 numeric ID (postId/pageId/memberId/projectId/groupId) | `<postId>` / `<pageId>` / `<memberId>` 등                 |
| 실명 (사용자 본인 + 동료 한국어 이름)                             | `<사용자A>` 또는 가상 이름(`홍길동`/`김철수`) — 가상은 OK |
| Dooray orgId (실제 19자리)                                        | `<orgId>`                                                 |

**검증 grep** (commit/이슈 작성/release 전 실행):

```bash
# cwd: <repo root>
grep -rnE "tc-ocr|nhnent|nhn-comico|@(nhn|nhnent)\.com|kim@example\.com" README.md skills/ docs/ CLAUDE.md 2>/dev/null
# 0건이어야 함

# 19자리 numeric (단 doc 예시의 dummy 패턴 1234567890123456789, 9876543210987654321은 OK)
grep -rnE "[0-9]{15,}" README.md skills/ docs/ 2>/dev/null | grep -vE "1234567890123456789|9876543210987654321|<postId>|<pageId>"
# 0건이어야 함 (남으면 실제값 가능성 — 검토 후 placeholder 또는 dummy로 교체)
```

**자동화**: `/release` 스킬 Step 3(문서 동기화)에 개인 식별 정보 사전 점검 통합 — release 전 자동 검증.

**예외**: 사용자가 명시적으로 "내부 wiki라 OK" 등 동의한 경우만. 디폴트는 placeholder.

## Task 작업 규칙

- 각 phase는 **원자적 단일 책임** — 다른 관심사면 별도 phase로 분리. **작업 항목 5개 이하** 엄수
- **task 파일 생성 즉시 git commit** — index.json + phase 파일을 실행 전에 커밋
- **task 파일 + planning docs 는 main 브랜치 직접 commit** — 별도 branch 분기 금지. 실제 코드 구현 시점에 새 `feat/`/`fix/` branch 잘라서 PR 워크플로우 시작
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

### 브랜치 명명 (5 prefix)

| 카테고리 | branch prefix | 사용 | 예시 |
|---|---|---|---|
| 신규 기능 task | `feat/{NNN}-{slug}` | task 디렉터리 카테고리가 `feat-` 일 때 | `feat/033-feat-post-edit-tag-options` |
| 버그 수정 task | `fix/{NNN}-{slug}` | task 디렉터리 카테고리가 `fix-` 일 때 | `fix/032-fix-member-group-resolver-guard` |
| 리팩토링 task | `refactor/{NNN}-{slug}` | task 디렉터리 카테고리가 `refactor-` 일 때 | `refactor/028-refactor-client-throw-await` |
| 메타 작업 | `chore/{topic}` | 의존성·도구·docs 일괄 정리 등 task 외 | `chore/replace-foreign-terms` |
| docs 단독 | `docs/{topic}` | docs 단독 변경 (코드 영향 0) | `docs/readability-6-patterns` |

**규칙**:

- task 폴더명 prefix (`feat-` / `fix-` / `refactor-`) 와 branch prefix 가 **반드시 일치** 한다
  - 잘못된 예: task `032-fix-...` 를 `feat/032-fix-...` branch 로 분기 → branch prefix 가 task 카테고리 오인
  - 옳은 예: task `032-fix-...` → `fix/032-fix-...` branch
- 기존 머지된 branch 는 소급 rename 금지. 향후 신규 task 부터 적용
- `chore/` 와 `docs/` 는 task 폴더 없이 단독 — slug 만 (`chore/cleanup-dist` / `docs/readability-6-patterns`)
