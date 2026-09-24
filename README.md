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

개별 값만 바꾸려면 `dooray config set` 을 쓴다. 값 자리에 `-` 를 주면 stdin 에서 읽는다.

```bash
printf '%s' "$TOKEN" | dooray config set api-key -
```

토큰을 명령 인자로 넘기면 셸 기록과 프로세스 목록에 남는다. 에이전트가 대신 실행하면 실행 로그에도 남는다.
stdin 으로 받은 값은 양끝 공백을 지운 뒤 저장하고, 비어 있으면 저장하지 않고 종료 코드 3 으로 끝낸다.
`imap-port` 와 `smtp-port` 는 1 에서 65535 사이의 정수만, `track-last-run` 은 `true`, `false`, `yes`, `no`, `1`, `0` 만 받는다.
그 밖의 값은 저장하지 않고 종료 코드 3 으로 끝낸다.
설정 파일 `~/.dooray/config.json` 은 소유자만 읽을 수 있는 권한(0600)으로 저장한다.

`api-key` 나 `base-url` 을 바꾸면 캐시를 함께 비우고 그 사실을 알린다.
캐시는 계정과 접속 환경별로 나뉘지 않아서, 비우지 않으면 이전 계정의 프로젝트와 멤버가 남아 잘못 매칭된다.
같은 값을 다시 설정하는 경우와 최초 설정에서는 비우지 않는다.

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

### 터미널에 익숙하지 않은 동료에게 넘기기

`skills/dooray-persona/references/bootstrap.md`에 붙여넣기용 프롬프트가 있다.
그 블록을 복사해 전달하면 받는 사람은 Claude Code에 한 번 붙여넣는 것으로 CLI 설치, 인증 설정, 스킬 연결, 수집, 문서 생성, 주입까지 진행한다.

받는 사람이 직접 해야 하는 것은 둘이다. Claude Code 설치와 Dooray 개인 인증 토큰 발급이다.
토큰 발급은 웹 로그인이 필요해 자동화할 수 없고, 프롬프트가 발급 화면 주소까지만 안내한다.

Claude 데스크톱 앱은 사용자 컴퓨터의 파일과 명령을 기본 상태로 다루지 못한다.
문서는 Claude Code에서 만들고, 완성한 문서를 데스크톱 앱의 프로젝트 지식이나 스타일 설정에 붙여넣어 쓴다.

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
업무 URL 을 그대로 붙여도 된다. 에이전트가 URL 에서 대상을 찾아낸다.

에이전트가 쓰는 명령 카탈로그와 판단 기준은 [스킬 문서](skills/dooray-cli/SKILL.md)에 있다.

## 에이전트 없이 직접 쓰기

터미널에서 바로 쓸 수도 있다.

```bash
dooray project list                          # 내 프로젝트
dooray post list <project>                   # 업무 목록
dooray post list <project> --tag "<태그 이름>"  # 태그로 거르기
dooray post get <project> 42                 # 업무 상세
dooray post create <project> --title "제목"  # 업무 생성
dooray post comment add <project> 42 --body "댓글"
dooray wiki pages <project>                  # 위키 페이지 목록
dooray wiki page get --id <page-id>          # 페이지 ID 하나로 조회 (project 불필요)
dooray wiki list --search 설계               # 위키 이름으로 찾기 (대소문자 무시)
dooray wiki page get --url "https://<tenant>.dooray.com/wiki/<wikiId>/<pageId>"
dooray wiki page edit --id <page-id> --body-file notes.md   # 페이지 ID 하나로 본문 수정
dooray wiki page move --id <page-id> --parent <parent-page-id>
dooray wiki page move --id <page-id> --parent <parent-page-id> --no-children
dooray mail list --unread                    # 안 읽은 메일
```

```bash
dooray post edit <project> 42 --cc-group <group-code>  # 제목·본문 없이 참조자 그룹 추가
```

참조자·담당자 옵션만 지정하면 `$EDITOR`를 열지 않고 기존 제목·본문·태그를 보존한 채 참여자만 바꾼다.

### 태그 확인과 태그로 찾기

업무 상세를 그냥 조회하면 붙어 있는 태그가 이름으로 함께 나온다.

`--json` 은 서버 응답을 그대로 내므로 태그에 `id` 만 들어 있다.
이름이 필요하면 `--with-tag-names` 를 함께 준다.

```bash
dooray post get <project> 42 --json --with-tag-names
dooray post list <project> --tag "<태그 이름>"
dooray post list <project> --tag "<이름 A>" --tag "<이름 B>"
```

`--with-tag-names` 는 이름을 채우지 못한 태그가 하나라도 있으면 멈춘다.
옵션을 주지 않으면 출력이 서버 응답 그대로다.

`--tag` 를 여러 번 주면 그 태그를 모두 가진 업무만 온다.

### 본문 형식

업무와 댓글과 위키 페이지의 본문은 마크다운이거나 HTML 이다.
`post edit`, `post comment edit`, `wiki page edit` 는 수정할 때 기존 형식을 그대로 유지한다.

주는 본문의 형식이 기존과 다르면 `--mime-type` 으로 명시한다.
빠뜨리면 마크다운 본문이 HTML 로 저장되어 웹에서 원문이 그대로 보인다.

```bash
dooray post get <project> 42 --json | jq .body.mimeType    # "text/html"
dooray post edit <project> 42 --body-file notes.md --mime-type text/x-markdown
dooray post edit <project> 42 --mime-type text/html        # 본문은 그대로, 형식만 되돌리기
```

값은 `text/x-markdown` 과 `text/html` 둘뿐이다.
본문을 바꾸지 않고 형식만 바꾸면 CLI 가 본문을 변환하지 않는다는 경고가 나온다.

### 멘션과 업무 링크

`post edit` 과 `post comment edit` 은 본문에 멘션과 다른 업무 링크를 붙인다.

```bash
dooray post edit <project> 42 --title "배포 준비" --mention 홍길동
dooray post comment edit <project> 42 --comment-id <comment-id> --body "확인 부탁" --link-task <project>/7
```

| 옵션 | 동작 |
| --- | --- |
| `--mention <name>` | 이름으로 멤버를 찾아 본문 앞에 멘션을 붙인다 (반복 가능) |
| `--mention-group <code>` | 그룹 코드로 찾아 멘션을 붙인다 (반복 가능) |
| `--link-task <ref>` | 다른 업무 링크를 본문 끝에 붙인다. `<project>/<number>` 또는 postId (반복 가능) |
| `--dry-run` | API 를 호출하지 않고 합성된 본문만 stdout 에 출력한다 |

**본문 형식이 `text/html` 이면 이 세 옵션을 쓸 수 없다.**
그 형식의 멘션과 링크 표기가 확인되지 않아, 종료 코드 3 으로 멈추고
`--mime-type text/x-markdown` 으로 형식을 바꾸는 방법을 안내한다.
추측한 표기를 넣으면 링크로 렌더링되지 않는 문자열이 본문에 남는다.

`post edit` 에서 `--mention` 이나 `--link-task` 만 주면 `$EDITOR` 가 열리고 그 옵션은 무시된다.
`--title` 이나 `--body` 나 `--mime-type` 을 함께 주어야 적용된다.

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

`--no-color` 도 전역 옵션이다. 붙이면 색상을 끄고, 환경 변수 `NO_COLOR` 가 설정돼 있어도 같게 동작한다.

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

본문 형식에 따라 두 명령이 멈추는 조건이 있다.

- `comment file upload` 는 댓글 본문이 `text/html` 이면 파일을 올리기 전에 종료 코드 3 으로 멈춘다.
  그 형식의 첨부 표기가 확인되지 않아, 올려도 본문에서 그 파일에 닿을 수 없다
- `comment file delete` 는 댓글 본문에서 그 파일의 참조를 찾지 못하면
  본문도 파일도 건드리지 않고 종료 코드 3 으로 멈춘다.
  종전에는 참조를 찾지 못해도 파일을 지워 본문에 대상이 사라진 링크가 남았다.
  파일만 지우려면 `dooray post file delete` 를 쓴다

### 첨부 파일 내려받기

```bash
dooray post file download-all <project> 42 -o ./files
dooray post file download-all <project> 42 -o ./files --no-inline
```

첨부 목록에 있는 파일과 본문에 삽입된 파일을 함께 받는다.
본문에 이미지를 붙여 넣기만 한 업무는 첨부 목록이 비어 있어도 그 이미지를 받는다.
본문 쪽을 제외하려면 `--no-inline` 을 준다.

### 삭제 명령의 확인

| 영역 | 삭제 명령 |
| --- | --- |
| 업무 | `dooray post comment delete`<br>`dooray post file delete`<br>`dooray post comment file delete` |
| 위키 | `dooray wiki page delete`<br>`dooray wiki page file delete`<br>`dooray wiki page comment delete` |

여섯 명령은 TTY에서 기본값이 아니오인 `y/N` 확인을 요청한다.
자동화·파이프 등 non-TTY 실행에서는 `-y` 또는 `--yes`로 확인을 생략해야 한다.
플래그가 없으면 삭제 API를 호출하기 전에 종료 코드 3으로 끝난다.
기존 삭제 자동화에는 명시적인 yes 플래그를 추가해야 한다.

`post comment delete` 와 `post file delete` 는 `--json` 과 `--quiet` 을 함께 받는다.
`--json` 은 삭제한 식별자와 `status` 를 내고, `--quiet` 은 식별자 한 줄만 낸다.
식별자의 키 이름은 명령마다 다르다. 댓글 삭제는 `commentId`, 파일 삭제는 `fileId` 다.

### 프로젝트 태그 만들기

업무에 붙일 태그를 CLI 에서 만든다.

```bash
dooray project tags <project>                                    # 태그 목록
dooray project tags list <project>                               # 같은 동작
dooray project tags create <project> --name "배포환경:staging"    # 그룹에 속한 태그
dooray project tags create <project> --name "긴급" --color c6eab3  # 그룹 없는 태그
dooray project tags group <project> "배포환경" --select-one        # 그룹에서 하나만 고르게
```

`--name` 은 `"그룹명:태그명"` 형식이고 그룹명은 생략할 수 있다.
같은 그룹명으로 여러 번 만들면 그 그룹에 태그가 쌓인다.
`--color` 를 생략하면 회색이 붙는다.

`group` 은 그룹의 필수 여부(`--mandatory`)와 단일 선택 여부(`--select-one`)를 바꾼다.
해제는 `--no-mandatory` 와 `--no-select-one` 이고, 지정하지 않은 쪽은 그대로 둔다.
태그가 하나도 없는 그룹은 대상이 되지 않는다.

프로젝트 코드가 `list`, `create`, `group` 중 하나와 같으면 그 인자가 하위 명령으로 먼저 읽힌다.
그때는 `dooray project tags list <project>` 로 목록을 조회한다.

태그 이름·색상 수정과 태그 삭제는 Dooray API 에 경로가 없어 웹 설정 화면에서 한다.

### 메신저로 알리기

작업 결과를 메신저로 바로 보낸다.

```bash
dooray messenger send --to user@example.com --body "배포 완료됐습니다"   # 1:1 메시지
dooray messenger channel-send --channel "배포알림" --body "v1.2.3 배포"  # 대화방 메시지
```

`send` 의 `--to` 는 멤버 ID 나 이메일을 받고 이름은 받지 않는다.
`channel-send` 의 `--channel` 은 channelId 나 대화방 이름을 받고, 이름으로는 자신이 속한 방만 찾는다.
`--body` 대신 `--body-file` 로 파일을 주거나 둘 다 생략해 `$EDITOR` 에서 쓸 수 있다.

진행 상황을 여러 번 보고할 때는 스레드를 열어 그 안에 쌓는다.
`thread-send` 에 `--quiet` 을 붙이면 새로 만들어진 스레드 채널의 id 가 나오고,
그 값을 `channel-send` 의 `--channel` 에 주면 메시지가 스레드에 붙는다.

```bash
THREAD=$(dooray messenger thread-send --channel "배포알림" --body "v1.2.3 배포" --quiet)
dooray messenger channel-send --channel "$THREAD" --body "테스트 통과"
```

`--thread-body` 로 스레드 첫 메시지를 함께 보낼 수 있고, 파일로 주려면 `--thread-body-file <path>` 를 쓴다.
둘 다 생략하면 스레드만 열린다.

이미 올라간 메시지에 스레드를 열려면 그 메시지의 log-id 를 `--log` 로 준다.

```bash
dooray messenger thread-send --channel "배포알림" --log <logId> --body "빌드 로그"
```

대화방에 올라온 메시지는 `logs` 로 읽는다. 대화방 인자는 `channel-send` 와 같게 channelId 나 이름을 받는다.

```bash
dooray messenger logs "배포알림"              # 최근 20건
dooray messenger logs "배포알림" -n 200       # 최근 200건
dooray messenger logs "배포알림" --json       # 서버 응답 원형
```

표는 오래된 메시지가 위, 최신이 아래로 나오고 발신자는 이름으로 보여준다.
이름 조회에 실패한 발신자는 id 로 남는다. `--json` 은 서버 응답 그대로라 이름이 들어가지 않고,
정렬도 서버가 주는 대로 최신이 앞이다. 표와 `--quiet` 은 대화 순서대로 뒤집는다.

표의 내용 열은 60자에서 자르고 잘린 자리에 `…` 를 붙인다. 메시지 전문은 `--json` 으로 봐야 한다.
긴 메시지를 옮겨 적거나 요약할 때 표만 보면 뒷부분을 놓친다.

가져올 수 있는 범위는 최근 1000건까지다. 그 이전으로 거슬러 갈 수단이 API 에 없어
`-n` 에 1000 을 넘기면 조용히 잘리는 대신 에러로 끝난다. 날짜로 거르는 옵션도 없다.
가져온 것보다 오래된 메시지가 남아 있으면 그 사실만 stderr 로 알린다. stdout 은 데이터만 담는다.

**이 명령이 부르는 endpoint 는 Dooray 공식 API 문서에 실려 있지 않다.**
같은 경로로 메시지를 보내는 쪽은 문서에 있는데 읽는 쪽만 없다.
동작은 실제 호출로 확인했지만 호환을 약속받은 것이 아니라서, 예고 없이 막히거나 응답이 바뀔 수 있다.
멈추면 곤란한 자동화에 넣을 때는 이 점을 감안한다.

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
파일 업로드의 307 리다이렉트나 multipart 필드 순서처럼, 모르고 접근하면 다시 막히는 것들이 여러 건 쌓여 있다.

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
argv 는 API 키 같은 값을 가린 뒤 저장한다. `config set <키> <값>` 의 값도 키와 관계없이 가린다.
`--last` 는 `--title` 을 줘도 등록 전에 본문 미리보기를 stderr 로 보여 주고 확인을 받는다.
터미널이 아닌 환경에서는 미리보기를 확인한 뒤 `--yes` 를 붙여 다시 실행해야 등록된다.

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
