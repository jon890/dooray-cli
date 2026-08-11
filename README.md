# dooray-cli

[![npm version](https://img.shields.io/npm/v/@bifos/dooray-cli.svg)](https://www.npmjs.com/package/@bifos/dooray-cli)
[![npm downloads](https://img.shields.io/npm/dm/@bifos/dooray-cli.svg)](https://www.npmjs.com/package/@bifos/dooray-cli)
[![CI](https://github.com/jon890/dooray-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/jon890/dooray-cli/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@bifos/dooray-cli.svg)](https://github.com/jon890/dooray-cli/blob/main/LICENSE)

[NHN Dooray](https://dooray.com) 를 AI 에이전트가 다룰 수 있게 만든 CLI 다.

업무·댓글·위키·메일·메신저를 명령 한 줄로 처리하고, 결과를 `--json` 으로 내보낸다.
Claude Code 같은 에이전트에 스킬로 설치하면 "업무 만들어줘" 같은 자연어 지시를 그대로 처리한다.

```bash
npm install -g @bifos/dooray-cli
dooray setup
dooray skill install
```

## 설치와 설정

Node.js 20 이상이 필요하다.

```bash
npm install -g @bifos/dooray-cli
```

`dooray setup` 이 API endpoint 와 API key, 메일 설정까지 대화형으로 받는다.
API key 는 Dooray 웹의 **설정 → API → 인증 토큰** 에서 만든다.

```bash
dooray setup
dooray doctor   # 설정이 제대로 됐는지 확인
```

에이전트에서 쓰려면 스킬을 설치한다. Claude Code 가 이 CLI 의 사용법을 알게 된다.

```bash
dooray skill install
dooray skill status
```

CLI 를 새 버전으로 올린 뒤에는 `dooray skill update` 를 실행해야 스킬도 갱신된다.

## Dooray 문체 페르소나

`dooray-persona` 스킬은 Dooray에 쌓인 본인 업무 글과 댓글을 모아 개인 업무 문체 문서를 만든다.
완성한 문서를 AI 에이전트의 규칙으로 연결하면 업무와 댓글 초안을 본인 문체에 맞춰 작성할 수 있다.

이 스킬은 사용자 글을 로컬에서 분석하는 별도 워크플로우이므로 `dooray skill install`의 설치 대상이 아니다.
저장소를 내려받은 뒤 스킬 디렉터리를 `~/.claude/skills/` 아래에 링크하거나 복사한다.

```bash
git clone https://github.com/jon890/dooray-cli.git
cd dooray-cli
mkdir -p ~/.claude/skills
ln -s "$PWD/skills/dooray-persona" ~/.claude/skills/dooray-persona
```

링크 대신 복사해서 사용하려면 마지막 명령을 다음 명령으로 바꾼다.

```bash
cp -R skills/dooray-persona ~/.claude/skills/
```

설정 파일은 `~/.claude/dooray-persona.config.json`이며, 최초 실행에서는 후보 프로젝트를 탐색해 대상을 고른 뒤 본인 글을 수집한다.
인증은 `dooray setup`이 만든 `~/.dooray/config.json`을 읽어 사용하므로 토큰을 따로 입력하지 않는다.

## 사용법

설정을 마치면 에이전트에게 한국어로 시키면 된다.

```
"내 프로젝트 목록 보여줘"
"백엔드 프로젝트에 '로그인 실패 로그 확인' 업무 만들고 김철수 담당자로 지정해줘"
"42번 업무에 '80% 완료' 댓글 달아줘"
"이번 주 회의록 위키 페이지 만들어줘"
"안 읽은 메일 보여줘"
"개발팀 대화방에 배포 완료 알려줘"
"이 업무 완료 처리하고 담당자에게 알려줘"
```

에이전트가 알맞은 `dooray` 명령으로 옮기고, 필요하면 프로젝트 코드나 업무 번호를 먼저 조회한다.
업무 URL 을 그대로 붙여도 된다 — 에이전트가 URL 에서 대상을 찾아낸다.

에이전트가 쓰는 명령 카탈로그와 판단 기준은 [스킬 문서](skills/dooray-cli/SKILL.md)에 있다.

## 에이전트 없이 직접 쓰기

터미널에서 바로 쓸 수도 있다.

```bash
dooray project list                          # 내 프로젝트
dooray post list <project>                   # 업무 목록
dooray post get <project> 42                 # 업무 상세
dooray post create <project> --title "제목"  # 업무 생성
dooray post comment add <project> 42 --body "댓글"
dooray wiki pages <project>                  # 위키 페이지 목록
dooray mail list --unread                    # 안 읽은 메일
```

```bash
dooray post edit <project> 42 --cc-group <group-code>  # 제목·본문 없이 참조자 그룹 추가
```

참조자·담당자 옵션만 지정하면 `$EDITOR`를 열지 않고 기존 제목·본문·태그를 보존한 채 참여자만 바꾼다.

전체 명령과 옵션은 `--help` 로 본다.

```bash
dooray --help
dooray post --help
dooray post create --help
```

출력은 세 가지 모드다.

| 플래그 | 출력 | 쓰는 곳 |
| --- | --- | --- |
| (없음) | 사람이 읽는 표 | 터미널 |
| `--json` | JSON | 파싱, 명령 연결 |
| `--quiet` | ID 만 | 스크립트 |

전역 옵션이라 모든 명령에 붙일 수 있다. 서브커맨드의 `--help` 에는 나오지 않는다.

```bash
POST_ID=$(dooray post create <project> --title "배포" --quiet)
dooray post comment add --id "$POST_ID" --body "시작합니다"
```

### 댓글에 파일 첨부

```bash
dooray post comment file upload <project> <number> <comment-id> <path>
```

이미지 확장자는 이미지 마크다운으로, 그 외 파일은 일반 링크로 댓글 본문에 추가한다.
`comment file list`는 웹 UI 첨부와 CLI 업로드 파일을 함께 보여주며 `출처` 열로 구분한다.
CLI로 올린 파일은 댓글의 첨부 카드가 아니라 본문 링크로 표시된다.

### 삭제 명령의 확인

| 영역 | 삭제 명령 |
| --- | --- |
| 업무 | `dooray post comment delete`<br>`dooray post file delete`<br>`dooray post comment file delete` |
| 위키 | `dooray wiki page delete`<br>`dooray wiki page file delete`<br>`dooray wiki page comment delete` |

여섯 명령은 TTY에서 기본값이 아니오인 `y/N` 확인을 요청한다.
자동화·파이프 등 non-TTY 실행에서는 `-y` 또는 `--yes`로 확인을 생략해야 한다.
플래그가 없으면 삭제 API를 호출하기 전에 종료 코드 3으로 끝난다.
기존 삭제 자동화에는 명시적인 yes 플래그를 추가해야 한다.

## 프로젝트 구조

```
src/
  index.ts       CLI 진입점
  api/           Dooray REST API 클라이언트 (ky), IMAP·SMTP 클라이언트
  cache/         ~/.dooray/cache/ 파일 캐시
  config/        ~/.dooray/config.json 스키마와 읽기·쓰기
  resolvers/     이름·이메일·URL 을 ID 로 바꾸는 계층
  commands/      Commander.js 명령 정의
  formatters/    표·JSON·quiet 출력
  editor/        $EDITOR 연동
  skill/         Claude Code 스킬 설치·갱신
  utils/         에러, 스피너, 종료 코드
```

의존 방향은 `api/` → `resolvers/` → `commands/` → `formatters/` 다.

| 문서 | 담는 것 |
| --- | --- |
| [docs/prd.md](docs/prd.md) | 제품 목적과 범위 |
| [docs/flow.md](docs/flow.md) | 사용자 흐름 |
| [docs/code-architecture.md](docs/code-architecture.md) | 디렉터리 트리, 레이어, API 전략 |
| [docs/data-schema.md](docs/data-schema.md) | 캐시 구조와 TTL |
| [docs/adr/INDEX.md](docs/adr/INDEX.md) | 기술 의사결정 기록 |

## 기여하기

이슈와 PR 모두 환영한다.

### 개발 환경

```bash
git clone https://github.com/jon890/dooray-cli.git
cd dooray-cli
pnpm install

pnpm run build       # tsup 으로 dist/index.js 단일 번들 생성
pnpm test            # vitest
pnpm tsc --noEmit    # 타입 검사 (빌드는 타입을 검사하지 않는다)

node dist/index.js --help   # 빌드 결과 직접 실행
npm link                    # dooray 명령으로 실행
```

`pnpm` 을 쓴다. 빌드는 `tsup`(esbuild) 이 담당하고 `tsc` 는 타입 검사 전용이므로,
타입 오류를 잡으려면 `pnpm tsc --noEmit` 를 따로 돌려야 한다.

### 새 명령을 추가할 때

1. `src/api/client.ts` 에 API 호출을 추가한다. 기존 메서드로 되는지 먼저 확인한다
2. 이름을 ID 로 바꿔야 하면 `src/resolvers/` 에 resolver 를 만든다. 매칭 정책은 정확일치 → 부분일치 → 모호하면 후보와 함께 에러다
3. `src/commands/` 에 명령을 정의한다. 인접한 명령의 구조를 따르는 것이 가장 빠르다
4. 출력은 `src/formatters/` 에서 표·JSON·quiet 세 모드를 모두 지원한다
5. `src/**/*.test.ts` 에 테스트를 추가한다

새 설정 값이 필요하면 `src/config/` 의 스키마와 `config set` 처리에 키를 추가한다.

Dooray API 의 동작이 문서와 다르거나 직관에 반하면 [docs/adr/](docs/adr/) 에 기록한다.
파일 업로드의 307 리다이렉트나 multipart 필드 순서처럼, 모르고 접근하면 다시 막히는 것들이 이미 32건 쌓여 있다.

### PR 을 낼 때

- 커밋과 PR 제목은 `type(scope): 설명` 형식을 쓴다
- 커밋 메시지와 PR 본문은 한국어로 쓴다
- PR 을 열면 CI 가 빌드와 테스트를 돌리고, Claude 가 코드 리뷰를 남긴다
- 리뷰의 🔴 항목은 머지 전에 반영한다

### 버그와 제안

CLI 안에서 바로 이슈를 만들 수 있다.

```bash
dooray feedback                                   # 대화형
dooray feedback --title "제목" --body "내용" --label bug
dooray feedback --last --title "에러 제목"        # 직전 실패 명령을 자동 첨부
```

`--last` 는 미리 켜야 한다: `dooray config set track-last-run true`.
argv 는 API 키 같은 값을 가린 뒤 저장한다.

[GitHub Issues](https://github.com/jon890/dooray-cli/issues) 에 직접 올려도 된다.

## 기술 스택

| 분류 | 사용 |
| --- | --- |
| 언어·런타임 | TypeScript, Node.js 20+ |
| CLI 프레임워크 | Commander.js |
| HTTP | ky |
| 메일 | imapflow (조회), nodemailer (발송), mailparser |
| 출력 | chalk, cli-table3, ora |
| 대화형 입력 | @inquirer/prompts |
| 빌드 | tsup (CJS 단일 번들) |
| 테스트 | vitest |

## 라이선스

MIT
