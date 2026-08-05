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

`docs/code-architecture.md` 가 단일 소스다 — 디렉터리 트리, 레이어, 의존 방향, API 전략을 담는다.

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

## 명령 공통 규약

명령별 옵션·동작의 단일 소스는 `docs/adr/` 와 `README.md` 다.
아래 "상황별 ADR 필수 참조" 표에서 영역별로 찾는다.
여기에는 그 표로 라우팅되지 않는 전 명령 공통 규약만 둔다.

- **입력 형식** — post 17 명령, wiki page file 5, wiki page comment 6 이 공통으로 받는다
  - `<project> <number>` / `--id <id>` / `--url <url>` / 첫 positional 에 Dooray URL 직접 입력
  - wiki 의 `--id` 모드는 `--project` 동반 필수 — wiki API 가 page-only fetch 를 지원하지 않는다
- **옵션 이름**
  - 제목은 post·wiki 모두 `--title` (`--subject` 는 deprecated alias — stderr 경고 후 동작)
  - 본문은 `--body` / `--body-file` (`-` = stdin), 둘 다 없으면 `$EDITOR` fallback
- **resolver 매칭**: 정확일치 → 이름 부분일치 → 모호하면 에러와 후보 목록 출력
- **출력**: 데이터는 stdout, 스피너·에러는 stderr. `--json` 은 raw 유지, `--quiet` 은 식별자만
- **파괴적 명령**: confirm 기본. non-TTY 는 abort, `--yes` 또는 `--no-confirm` 으로 생략
- **post 목록 정렬**: 최신순 (`-createdAt`)
- **interactive 모드**: non-interactive 전용 옵션은 무시하고 경고를 낸다

자기 규약 적용 — 아래 "docs / ADR 작성 형식" 6가지 패턴을 CLAUDE.md 자신에게도 적용한다.

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
| `wiki page delete` 명령 (비공식 endpoint)                  | **ADR-032** (미문서화 DELETE endpoint + 하위 페이지 조부모 재부착 실측 + confirm 기본, Issue #87) |
| `wiki tree` 명령 (페이지 계층 트리)                        | **ADR-034** (list endpoint flat 미제공 → root 부터 레벨별 재귀 drill-down + 형제 병렬 조회(동시 상한 10) + `--depth` 상한 + `--json` flat 유지, Issue #101) |
| `wiki page comment` 6 명령                                 | (ADR 없음 — `src/commands/wiki/page-comment/`. post comment 패턴 mirror 이며 wiki API 가 mention·참조자·첨부를 지원하지 않아 시그니처가 축소됨) |
| `messenger send` / `channel-send` 명령                     | **ADR-033** (direct-send memberId 직접 + channel logs + `--to` id/email + `--channel` id/이름 lookup, Issue #88) |
| member-group resolver (응답 shape 정규화 + 가드)           | **ADR-028** (nested array unwrap `flat()` + id 직접 입력 fallback + `match.ts` 가드, Issue #65 #76) |
| project resolver (numeric 입력 fallback)                   | **ADR-030** (`PROJECT_ID_RE` 분기 + cache 우회 + 권한은 후속 API 4xx 위임, Issue #78)         |
| file 명령군 `--json` 출력 (post file + wiki page file)     | **ADR-031** (8 명령 스키마 통일 + `download-all` 부분 실패 표현 + quiet 모드 일관, Issue #73)  |
| `post create --template` + `project templates` 명령        | **ADR-027** (interpolation 기본 true + 사용자 옵션 우선 override + `--field` 사용자 변수 제외) |
| 파일 업로드/다운로드 (307 처리)                            | **ADR-015** (수동 redirect + Auth 헤더 재첨부)                                                 |
| `dooray setup` 마법사 변경                                 | **ADR-016**, **ADR-035** (대화형 + 스킬 설치 위임)                                             |
| `dooray skill` 설치·진단·저장소 변경                       | **ADR-035** (명시 갱신 + 관리형 저장소 + 콘텐츠 해시)                                          |
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
- **대형 docs 파일** (`docs/adr/` 등)은 grep으로 필요 섹션만 찾아 offset 지정

## 조사/탐색 접근 방식

- **직접 질문에는 직접 답변부터** — 사용자가 특정 파일/영역/패턴을 명시했다면 해당 위치부터 확인. 광범위한 codebase 탐색 금지
- **사용자가 조사 경로를 제시했으면 그 경로부터** — 지시받은 영역에서 codebase 전체를 먼저 뒤지지 않는다
- **Explore agent는 최후 수단** — Grep/Glob/Read로 3번 이상 시도한 후에도 못 찾을 때만 사용
- **가정 없이 주장하지 않기** — "dead code", "미사용" 같은 판단은 실제로 참조를 grep한 후에만 제기

## 한국어 표현 정책 (프로젝트 고유 매핑)

기본 원칙, 공용 매핑 표, 기존 문서 발견 시 처리는 글로벌 `~/.claude/rules/korean-style.md` 가 단일 소스다.
여기에는 이 repo 에서 추가로 금지하는 표현만 둔다.

| 금지          | 권장 대체                                                                     |
| ------------- | ----------------------------------------------------------------------------- |
| 자명성 게이트 | **ADR 작성 전 점검** (자명성 자체는 한자어 OK — 동사화 "자명한지 확인" 도 OK) |
| 사전 소진     | **사전 해소** ("소진" 은 자원 고갈 비유 — 직관 어려움)                        |
| 단일 진실원   | **단일 소스** ("진실원" 은 truth-source 직역, 한국어 자연어 아님)             |
| 변질 의심     | **변질 우려** ("의심" 보다 "우려" 가 더 자연)                                 |
| 패턴 답습     | **동일 패턴 적용** / **그대로 적용** ("답습" 은 "낡은 것 베끼기" 부정 뉘앙스) |

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

기본 규칙(도구 사용, 권장안 첫 번째 배치, 설명 선행)은 글로벌 CLAUDE.md 가 단일 소스다.
이 repo 에서 더하는 것만 둔다.

- `/planning` 안에서도 예외 없이 `AskUserQuestion` 을 쓴다 — markdown 체크박스 표·번호 리스트로 옵션을 나열하면 사용자가 일일이 타이핑해야 한다
- 복잡한 비교는 옵션마다 `preview` (ASCII 다이어그램·코드 스니펫)로 시각화한다
- "당연히 그렇게 가는" 결정(기존 패턴 그대로 적용, 변경 없음)은 묻지 않고 본문에 "권장: 그대로" 한 줄로 처리한다

## 개인 식별 정보 / 사내 식별자 노출 금지 (public OSS)

이 repo는 GitHub public이므로 다음 식별자는 **README/skills/docs/CLAUDE.md/이슈 본문 + src 코드 (테스트 fixture·에러 메시지 예시 포함) 어디에도 노출 금지**. 코드 예시·시나리오·issue body·테스트 fixture 작성 시 항상 placeholder 사용.

CLAUDE.md 자체도 public repo 에 포함되므로 사내 식별자를 블랙리스트로 나열하면 그 자체가 노출이다.
구체 식별자는 여기 적지 않고, 유형만 기술 + 검증은 공개 화이트리스트 외 검출 방식을 쓴다.

| 노출 금지                                                         | 대체                                                      |
| ----------------------------------------------------------------- | --------------------------------------------------------- |
| 사내 Dooray 프로젝트 코드                                         | `<project>`                                               |
| 사내 NHN 도메인 (구체 도메인은 public repo 라 여기 명시하지 않음) | `<tenant>` / `example.com`                                |
| 사내 이메일                                                       | `user@example.com`                                        |
| 실제 19자리 numeric ID (postId/pageId/memberId/projectId/groupId) | `<postId>` / `<pageId>` / `<memberId>` 등                 |
| 실명 (사용자 본인 + 동료 한국어 이름)                             | `<사용자A>` 또는 가상 이름(`홍길동`/`김철수`) — 가상은 OK |
| Dooray orgId (실제 19자리)                                        | `<orgId>`                                                 |

**검증 grep** (commit/이슈 작성/release 전 실행):

```bash
# cwd: <repo root>
# 검사 대상 — .claude/ 와 tasks/ 도 git 추적 대상이므로 포함한다
# 배열 + "${SCAN[@]}" 로 쓴다. 두 셸이 각각 다른 방식으로 조용히 망가지기 때문이다
#   - 문자열 변수 + $SCAN: zsh 는 단어 분할을 하지 않아 "a b c" 전체가 한 경로가 된다
#   - 배열 + unquoted $SCAN: bash 는 첫 원소로 축약해 README.md 만 검사한다
SCAN=(README.md skills/ docs/ CLAUDE.md .claude/ scripts/ tasks/ src/)
# 허용 dummy ID + 공개 helpdesk 페이지 ID
OK_IDS="1234567890123456789|9876543210987654321|2939987647631384419"
OK_IDS="$OK_IDS|1111222233334444555|2222333344445555666|3333444455556666777"
OK_IDS="$OK_IDS|4444555566667777888|9999888877776666555|9999999999999999999"
OK_IDS="$OK_IDS|1111111111111111111|2222222222222222222|123456789012345"

# 1) 공개 도메인 화이트리스트 밖의 URL/이메일 도메인 (사내 도메인 가능성) — 사내 도메인은 여기 명시하지 않는다
#    https:// 또는 @ prefix 를 요구해 코드의 property 접근(.com/.net) false positive 를 배제
grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" "${SCAN[@]}" 2>/dev/null \
  | grep -vE "dooray\.com|gov-dooray\.com|dooray\.co\.kr|gov-dooray\.co\.kr|helpdesk\.dooray\.com|github\.com|npmjs\.com|example\.com|youtube\.com|anthropic\.com|x\.com"
# 0건이어야 함 (남으면 사내/미허용 도메인 가능성 — placeholder 또는 화이트리스트 검토)

# 2) 19자리 numeric
grep -rnE "[0-9]{15,}" "${SCAN[@]}" 2>/dev/null | grep -vE "$OK_IDS|<postId>|<pageId>"
# 0건이어야 함 (남으면 실제값 가능성 — 검토 후 placeholder 또는 dummy로 교체)

# 3) 사내 프로젝트 코드 — 화이트리스트 방식으로는 잡히지 않는다 (임의 문자열)
#    CLI 예시의 project 자리 값을 뽑아 placeholder 인지 눈으로 확인한다
grep -rohE "(post (create|list|get|search)|project (show|members|groups|tags|templates|workflows)|wiki (pages|tree)) [A-Za-z][A-Za-z0-9_-]{2,}" "${SCAN[@]}" 2>/dev/null \
  | awk '{print $NF}' | sort -u
# 허용: my-project / testproj / ai-service-dev / NONEXIST / <project> (모두 가상 예시)
# 그 밖의 값이 나오면 사내 프로젝트 코드인지 확인 후 placeholder 로 교체
```

**자동화**: `/release` 스킬 Step 3(문서 동기화)에 개인 식별 정보 사전 점검 통합 — release 전 자동 검증.

**예외**: 사용자가 명시적으로 "내부 wiki라 OK" 등 동의한 경우만. 디폴트는 placeholder.

## 공개 문서(README · 공개 SKILL) — 내부 참조 번호 제외

`README.md` 와 `skills/dooray-cli/SKILL.md` 는 **사용자 대상** 문서다.
`ADR-NNN` / `Issue #NN` / `task NN` 같은 **내부 개발 추적 번호를 본문에 넣지 않는다.**

이유:

- 사용자는 프로젝트의 의사결정(ADR) 맥락을 전혀 모른다 — 번호는 의미 없는 노이즈.
- 사용자가 README/SKILL 본문을 그대로 LLM 에게 붙여 실행을 요청하기도 한다 — 내부 참조가 혼란을 준다.

규칙:

- 기능 **동작·사용법**만 기술한다.
- "왜 이렇게 설계했는가" 는 `docs/adr/` 단일 소스에만 둔다.
- `... (ADR-027)` 같은 괄호 참조는 삭제한다.
- 문장에 녹은 참조(예: "ADR-030 안내 확인")는 번호를 빼고 자연스럽게 재작성한다.
- 적용 대상은 `README.md` 와 `skills/dooray-cli/SKILL.md` 뿐이다. 내부 문서(`CLAUDE.md` / `docs/*` / `tasks/*`)는 내부 참조를 유지한다.

**검증 grep** (README/SKILL 작성·수정 후 실행):

```bash
grep -rnE "ADR-[0-9]+|Issue #[0-9]+|task [0-9]+" README.md skills/dooray-cli/SKILL.md 2>/dev/null
# 0건이어야 함
```

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

### PR 본문

- **commit 목록을 본문에 나열하지 않는다** — GitHub PR 의 Commits 탭에서 바로 확인 가능 (본문 중복 + 해시 변경 시 유지보수 부담)
- 본문에는 개요·결정 근거·검증 결과만 담는다

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
