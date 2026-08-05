# CLAUDE.md — dooray-cli

## 프로젝트 개요

NHN Dooray REST API CLI 도구. TypeScript 와 Commander.js 기반.

## API 스펙 확인 절차 (필수 — 신규 endpoint 사용 / 동작 검증 시)

Dooray 공식 API 문서: [https://helpdesk.dooray.com/share/pages/9wWo-xwiR66BO5LGshgVTg/2939987647631384419](https://helpdesk.dooray.com/share/pages/9wWo-xwiR66BO5LGshgVTg/2939987647631384419)

공개 페이지지만 React 앱이라 `WebFetch` 로는 본문을 못 읽는다 — JS 를 실행하지 않으면 `<div id="root">` 가 빈 상태로 온다.
Orca 내장 브라우저(`~/.claude/scripts/orca-browser.sh`)로 열어 endpoint 와 request·response 스키마, 동작 특이점을 확인한 뒤 코드를 작성한다.

문서에 없거나 직관에 반하는 동작은 ADR 로 보존한다. 영역별 ADR 은 `docs/adr/INDEX.md` 에서 찾는다.

## 빌드 & 실행

```bash
pnpm install          # 의존성 설치
pnpm run build        # tsup 빌드 (dist/index.js 단일 번들)
pnpm tsc --noEmit     # 타입 체크 전용 (런타임 번들에는 미사용)
node dist/index.js    # 직접 실행
dooray                # 글로벌 링크 시
```

새 의존성을 추가하면 `package.json` 의 `exports` 맵 진입점이 의도와 맞는지 확인한다.
`moduleResolution: "Bundler"` 는 Node16 보다 exports 검증이 느슨해 잘못된 진입점이 조용히 통과한다.

## 디렉토리 구조

`docs/code-architecture.md` 가 단일 소스다 — 디렉터리 트리, 레이어, 의존 방향, API 전략을 담는다.

## 코드 컨벤션

- HTTP 클라이언트: `ky` 
- 빌드: `tsup` (CJS 단일 번들, shebang 포함)
- 패키지 매니저: `pnpm`
- 캐시: `~/.dooray/cache/` 디렉토리에 파일별 분리 (me.json, projects.json, members/{projectId}.json, workflows/{projectId}.json, tags/{projectId}.json, templates/{projectId}.json)
- config: `~/.dooray/config.json` (env var 폴백 없음)
- 에러: `DoorayCliError(message, exitCode)` 로 통일
- 출력: 데이터는 stdout, 스피너/에러는 stderr

## 명령 공통 규약

명령별 옵션·동작은 `docs/adr/INDEX.md` 와 `README.md` 에서 찾는다. 여기에는 전 명령 공통 규약만 둔다.

- **입력 형식** — post 17 명령, wiki page file 5, wiki page comment 6 이 공통으로 받는다
  - `<project> <number>` / `--id <id>` / `--url <url>` / 첫 positional 에 Dooray URL 직접 입력
  - wiki 의 `--id` 모드는 `--project` 동반 필수 — wiki API 가 page-only fetch 를 지원하지 않는다
- **옵션 이름**
  - 제목은 post·wiki 모두 `--title` (`--subject` 는 deprecated alias — stderr 경고 후 동작)
  - 본문은 `--body` / `--body-file` (`-` = stdin), 둘 다 없으면 `$EDITOR` fallback
- **resolver 매칭**: 정확일치 → 이름 부분일치 → 모호하면 에러와 후보 목록 출력
- **출력**: `--json` 은 raw 유지, `--quiet` 은 식별자만
- **파괴적 명령**: confirm 기본. non-TTY 는 abort, `--yes` 또는 `--no-confirm` 으로 생략
- **post 목록 정렬**: 최신순 (`-createdAt`)
- **interactive 모드**: non-interactive 전용 옵션은 무시하고 경고를 낸다

## 개인 식별 정보 / 사내 식별자 노출 금지 (public OSS)

아래 식별자는 git 추적 대상 어디에도 넣지 않는다 — 검증 grep 의 `SCAN` 목록이 대상 범위다.
`src/` 의 테스트 fixture 와 에러 메시지 예시, 이슈 본문도 포함한다. 항상 placeholder 를 쓴다.

구체적인 사내 식별자는 이 파일에도 적지 않는다 — CLAUDE.md 자체가 public 이라 나열이 곧 노출이다.
유형만 기술하고, 검증은 공개 화이트리스트 밖을 검출하는 방식으로 한다.


| 노출 금지                                                         | 대체                                       |
| ------------------------------------------------------------- | ---------------------------------------- |
| 사내 Dooray 프로젝트 코드                                             | `<project>`                              |
| 사내 NHN 도메인 (구체 도메인은 public repo 라 여기 명시하지 않음)                 | `<tenant>` / `example.com`               |
| 사내 이메일                                                        | `user@example.com`                       |
| 실제 19자리 numeric ID (postId/pageId/memberId/projectId/groupId) | `<postId>` / `<pageId>` / `<memberId>` 등 |
| 실명 (사용자 본인, 동료 한국어 이름)                                        | `<사용자A>` 또는 가상 이름(`홍길동`/`김철수`) — 가상은 OK  |
| Dooray orgId (실제 19자리)                                        | `<orgId>`                                |


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

`/release` 스킬 Step 3 이 이 점검을 포함한다 — release 전 자동 검증된다.

## 공개 문서(README · 공개 SKILL) — 내부 참조 번호 제외

`README.md` 와 `skills/dooray-cli/SKILL.md` 에는 `ADR-NNN`, `Issue #NN`, `task NN` 같은 내부 추적 번호를 넣지 않는다.
사용자는 ADR 맥락을 모르고, 이 문서를 그대로 LLM 에 붙여 실행을 요청하기도 한다.

- 기능 동작과 사용법만 기술한다. "왜 이렇게 설계했는가" 는 `docs/adr/` 에만 둔다
- 괄호 참조(`... (ADR-027)`)는 삭제하고, 문장에 녹은 참조는 번호를 빼고 재작성한다
- 내부 문서(`CLAUDE.md`, `docs/*`, `tasks/*`)는 내부 참조를 그대로 유지한다

**검증 grep** (README/SKILL 작성·수정 후 실행):

```bash
grep -rnE "ADR-[0-9]+|Issue #[0-9]+|task [0-9]+" README.md skills/ 2>/dev/null
# 0건이어야 함
```

## Git

커밋 메시지와 PR 제목·본문은 한국어로 작성한다.

