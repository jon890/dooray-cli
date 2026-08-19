# CLAUDE.md — dooray-cli

## 프로젝트 개요

NHN Dooray REST API CLI 도구. TypeScript 와 Commander.js 기반.

## API 스펙 확인 절차 (필수 — 신규 endpoint 사용 / 동작 검증 시)

Dooray 공식 API 문서: [https://helpdesk.dooray.com/share/pages/9wWo-xwiR66BO5LGshgVTg/2939987647631384419](https://helpdesk.dooray.com/share/pages/9wWo-xwiR66BO5LGshgVTg/2939987647631384419)

공개 페이지지만 React 앱이라 `WebFetch` 로는 본문을 못 읽는다.
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
- 캐시: `~/.dooray/cache/` 에 파일별 분리 — 구조와 TTL 은 `docs/data-schema.md`
- config: `~/.dooray/config.json` (env var 폴백 없음)
- 에러: `DoorayCliError(message, exitCode)` 로 통일
- 출력: 데이터는 stdout, 스피너/에러는 stderr

## 명령 공통 규약

명령별 옵션·동작은 `docs/adr/INDEX.md` 와 `README.md` 에서 찾는다. 여기에는 전 명령 공통 규약만 둔다.

- **입력 형식** — post 계열, wiki page file, wiki page comment 명령이 공통으로 받는다
  - `<project> <number>` / `--id <id>` / `--url <url>` / 첫 positional 에 Dooray URL 직접 입력
  - wiki 의 `--id` 모드는 `--project` 동반 필수 — wiki API 가 page-only fetch 를 지원하지 않는다
- **옵션 이름**
  - 제목은 post·wiki 모두 `--title` (`--subject` 는 deprecated alias — stderr 경고 후 동작)
  - 본문은 `--body` / `--body-file` (둘 다 `-` 로 stdin 을 받는다)
  - `config set <key> <value>` 의 값도 `-` 로 stdin 을 받는다 — 토큰이 셸 기록과 프로세스 목록에 남지 않게 하는 경로다
  - `post edit`, `wiki page edit`, `post`·`wiki page` 의 `comment add`/`edit` 는 둘 다 없으면 `$EDITOR` 가 열린다. 단 `post edit` 의 태그·참조자·담당자 변경 옵션은 제목·본문 없이도 비대화형 수정으로 실행한다. `create` 계열은 fallback 없이 에러가 된다
- **mail 계열 예외**: `mail get`·`mail reply` 는 IMAP UID 만 받는다. 웹 메일 주소와 그 주소의 mail id 는 형태로 알아보고 조회 없이 거절한다 (ADR-040)
- **resolver 매칭**: 정확일치 → 이름 부분일치 → 모호하면 에러와 후보 목록 출력
- **출력**: `--json` 은 raw 유지, `--quiet` 은 식별자만
- **파괴적 삭제 명령**: 확인을 기본으로 하고 `-y`/`--yes` 로 생략한다 (ADR-036)
  - TTY 확인의 기본값은 아니오다. 사용자가 거절하면 API를 호출하지 않고 정상 취소한다
  - non-TTY에서 `-y`/`--yes`가 없으면 설정 조회·resolver·API 호출 전에 `EXIT_PARAM_ERROR`(3)로 중단한다
- **post 목록 정렬**: 최신순 (`-createdAt`)
- **interactive 모드**: 비대화형 진입 조건이 아닌 전용 옵션은 무시하고 경고를 낸다

## 개인 식별 정보 / 사내 식별자 노출 금지 (public OSS)

아래 식별자는 git 추적 대상 어디에도 넣지 않는다. 검사 범위는 `scripts/check-pii.sh` 의 `SCAN` 목록이다.
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


**검증** (commit·이슈 작성·release 전 실행):

```bash
# cwd: <repo root>
bash scripts/check-pii.sh
```

세 가지를 본다 — 공개 화이트리스트 밖의 도메인, 허용 목록 밖의 15자리 이상 숫자, 예시에 쓰인 낯선 project 값.
위반을 출력하고 종료 코드 1 로 끝난다. 화이트리스트는 그 스크립트가 소유한다.

가상 예시를 새로 쓰려면 스크립트의 `OK_PROJECTS` 나 `OK_DOMAINS` 에 먼저 추가한다.
CI 가 같은 스크립트를 돌리므로 통과하지 않으면 PR 이 막힌다.

## 공개 문서(README · 공개 SKILL) — 내부 참조 번호 제외

`README.md` 와 `skills/dooray-cli/SKILL.md` 에는 `ADR-NNN`, `Issue #NN`, `task NN` 같은 내부 추적 번호를 넣지 않는다.
사용자는 ADR 맥락을 모르고, 이 문서를 그대로 LLM 에 붙여 실행을 요청하기도 한다.

- 기능 동작과 사용법만 기술한다. "왜 이렇게 설계했는가" 는 `docs/adr/` 에만 둔다
- 괄호 참조(`... (ADR-027)`)는 삭제하고, 문장에 녹은 참조는 번호를 빼고 재작성한다
- 내부 문서(`CLAUDE.md`, `docs/*`, `tasks/*`)는 내부 참조를 그대로 유지한다

**검증** (README·SKILL 작성·수정 후 실행):

```bash
# cwd: <repo root>
bash scripts/check-public-refs.sh
```

CI 가 같은 스크립트를 돌린다.

## `tasks/` — 완료된 plan 은 실행 기록이다

완료된 `tasks/{NNN}-*/` 는 그 plan 을 실행한 executor 에게 **실제로 전달된 지시의 기록**이다.
문구를 바꾸면 당시 무엇을 시켰는지가 훼손되고, 나중에 결과와 지시를 대조할 수 없게 된다.

- 문체·표기 일괄 교정, 용어 통일, 링크 정비 같은 **저장소 전역 sweep 의 대상에서 제외**한다
- 오탈자 하나를 고치려고 완료된 phase 파일을 열지 않는다
- 실행 중인 plan 은 예외다. 파이프라인이 `index.json` 상태를 갱신하고 재계획으로 phase 를 다시 쓰는 것은 정상 동작이다

sweep 을 돌릴 때는 대상 경로를 `docs/`, `.claude/`, `README.md`, `skills/` 로 한정하고,
제외한 건수와 이유를 보고에 남긴다. 조용히 빼면 전수 처리한 것으로 읽힌다.

## Git

커밋 메시지와 PR 제목·본문은 한국어로 작성한다.
