# 기여하기

이슈와 PR 모두 환영한다.

## 개발 환경

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

## 새 명령을 추가할 때

1. `src/api/client.ts` 에 API 호출을 추가한다. 기존 메서드로 되는지 먼저 확인한다
2. 이름을 ID 로 바꿔야 하면 `src/resolvers/` 에 resolver 를 만든다. 매칭 정책은 정확일치 → 부분일치 → 모호하면 후보와 함께 에러다
3. `src/commands/` 에 명령을 정의한다. 인접한 명령의 구조를 따르는 것이 가장 빠르다
4. 출력은 `src/formatters/` 에서 표·JSON·quiet 세 모드를 모두 지원한다
5. `src/**/*.test.ts` 에 테스트를 추가한다

새 설정 값이 필요하면 `src/config/` 의 스키마와 `config set` 처리에 키를 추가한다.

Dooray API 의 동작이 문서와 다르거나 직관에 반하면 [docs/adr/](docs/adr/) 에 기록한다.
파일 업로드의 307 리다이렉트나 multipart 필드 순서처럼, 모르고 접근하면 다시 막히는 것들이 여러 건 쌓여 있다.

## PR 을 낼 때

- 커밋과 PR 제목은 `type(scope): 설명` 형식을 쓴다
- 커밋 메시지와 PR 본문은 한국어로 쓴다
- PR 을 열면 CI 가 빌드와 테스트를 돌리고, Claude 가 코드 리뷰를 남긴다
- 리뷰는 P1 부터 P5 까지 등급을 붙인다. P1 이 남으면 머지하지 않고, P2 는 고치거나 PR 에 까닭을 적는다

## 버그와 제안

CLI 안에서 바로 이슈를 만들 수 있다.

```bash
dooray feedback                                   # 대화형
dooray feedback --title "제목" --body "내용" --label bug
dooray feedback --last --title "에러 제목"        # 직전 실패 명령을 자동 첨부
```

`--last` 는 미리 켜야 한다: `dooray config set track-last-run true`.
argv 는 API 키 같은 값을 가린 뒤 저장한다. `config set <키> <값>` 의 값도 키와 관계없이 가린다.
`--last` 는 `--title` 을 줘도 등록 전에 본문 미리보기를 stderr 로 보여 주고 확인을 받는다.
터미널이 아닌 환경에서는 미리보기를 확인한 뒤 `--yes` 를 붙여 다시 실행해야 등록된다.

[GitHub Issues](https://github.com/jon890/dooray-cli/issues) 에 직접 올려도 된다.

## 프로젝트 구조

```
src/
  index.ts       CLI 진입점
  api/           Dooray REST API 클라이언트 (ky), IMAP·SMTP 클라이언트
  cache/         ~/.dooray/cache/ 파일 캐시
  config/        ~/.dooray/config.json 스키마와 읽기·쓰기
  resolvers/     이름·이메일·URL 을 ID 로 바꾸는 읽기 계층
  services/      상태를 바꾸는 API 를 호출하고 그 엔티티의 캐시를 지우는 계층
  commands/      Commander.js 명령 정의
  formatters/    표·JSON·quiet 출력
  editor/        $EDITOR 연동
  skill/         Claude Code 스킬 설치·갱신
  utils/         에러, 스피너, 종료 코드
```

의존 방향은 읽기와 쓰기로 나뉜다.
읽기는 `api/` → `resolvers/` → `commands/` → `formatters/` 다.
쓰기는 `commands/` → `services/` → `api/` 와 `cache/` 다.
`services/` 는 `resolvers/` 를 의존하지 않는다. 이름을 ID 로 바꾸는 일과 바꾸는 일을 조합하는 것은 `commands/` 다.

| 문서 | 담는 것 |
| --- | --- |
| [docs/prd.md](docs/prd.md) | 제품 목적과 범위 |
| [docs/flow.md](docs/flow.md) | 사용자 흐름 |
| [docs/code-architecture.md](docs/code-architecture.md) | 디렉터리 책임, 레이어, 의존 방향 |
| [docs/data-schema.md](docs/data-schema.md) | 캐시 구조와 TTL |
| [docs/adr/INDEX.md](docs/adr/INDEX.md) | 기술 의사결정 기록 |

이 저장소를 AI 에이전트로 만든 과정은
[AI 에이전트와 함께 MVP 만들기](https://blog.fosworld.co.kr/posts/AI/practice/mvp-with-ai-agent.md) 에 있다.

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
