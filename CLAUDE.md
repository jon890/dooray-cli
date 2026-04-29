# CLAUDE.md — dooray-cli

## 프로젝트 개요

NHN Dooray REST API CLI 도구. TypeScript + Commander.js 기반.

## 빌드 & 실행

```bash
pnpm install          # 의존성 설치
pnpm run build        # tsup 빌드 (dist/index.js 단일 번들)
node dist/index.js    # 직접 실행
dooray                # 글로벌 링크 시
```

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
- post 하위 12개 명령(get/edit/done/workflow + comment 4개 + file 5개)은 `<project> <post-number>` 외에도 `--id <postId>` / `--url <url>` / 첫 positional에 Dooray URL 직접 입력 지원. `resolvePostInput` 단일 헬퍼에서 분기
- `dooray member get/list` 명령으로 표시명 조회. `post comment list` table 출력은 Creator 컬럼을 project 멤버 캐시로 enrich (단 `--json`은 raw 유지)
- `dooray feedback`은 GitHub issue를 `gh` CLI에 위임해서 생성. baseUrl/시크릿은 자동 메타에 미포함. `--last`(직전 명령 추적)는 후속 이슈로 분리
- 제목 옵션 이름은 post·wiki 모두 `--title`로 통일 (Issue #8)
- resolver(멤버·워크플로우·태그·마일스톤)는 정확일치 → 이름 부분일치, 모호하면 에러 + 후보 목록 출력
- post 목록은 최신순 정렬 (`-createdAt`)

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
