# 설치와 설정

설치, 인증 설정, 에이전트 스킬 설치, 출력 모드를 다룬다.

## 설치

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

## 설정 값 바꾸기

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

## 에이전트 스킬

에이전트에서 쓰려면 스킬을 설치한다. 한 번 실행하면 Claude Code와 Codex가 같은 CLI 사용법을 읽는다.

```bash
dooray skill install
dooray skill status
```

설치 경로는 Claude Code의 `~/.claude/skills/dooray-cli`와 Codex의 `~/.agents/skills/dooray-cli`다.
두 경로는 같은 관리형 저장소에 연결된다. 기존에 Claude Code에만 설치했다면 `dooray skill install`을 다시 실행해 Codex에도 연결한다.
Codex 설치 여부와 관계없이 양쪽 스킬을 관리하며, `install`과 `update`는 필요한 `~/.agents/skills` 디렉터리도 생성한다.
Codex에서는 `$dooray-cli`로 스킬을 호출할 수 있다. 새 스킬이 보이지 않으면 Codex를 다시 시작한다.

`dooray skill status`는 에이전트별 상태를 보여준다. `--quiet`는 양쪽 상태를 합친 토큰 하나를 출력하며, 둘 다 최신일 때만 `current`다.
기존 경로에 사용자 파일이나 디렉터리가 있으면 덮어쓰지 않는다. 내용을 확인한 뒤 `--force`를 주면 백업하고 교체한다.
CLI 를 새 버전으로 올린 뒤에는 `dooray skill update` 를 실행해야 양쪽 스킬이 함께 갱신된다.

## 도움말과 출력 모드

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
