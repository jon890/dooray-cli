# 설치와 설정

설치, 인증 설정, 에이전트 스킬 설치, 출력 모드를 다룬다.

## 설치

Node.js 20 이상이 필요하다.

```bash
npm install -g @bifos/dooray-cli
```

`dooray setup` 이 먼저 인증 방식을 묻고 클라우드·테넌트·인증 값과 메일 설정을 대화형으로 받는다.
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

macOS 에서는 API 토큰(`api-key`), IMAP 비밀번호(`imap-password`), 세션 쿠키(`session-cookie`)를 설정 파일이 아니라 로그인 키체인에 저장한다.
키체인 접근 앱에서 이름이 `dooray-cli` 인 항목으로 보인다.
설정 파일과 그 백업·동기화 사본에 토큰이 남지 않게 하는 것이 목적이다. 같은 사용자로 실행한 프로그램은 `security` 명령으로 확인 창 없이 이 항목을 읽을 수 있다.
기본 위치(`~/.dooray/config.json`)의 설정은 계정 이름이 `apiKey`·`imapPassword`·`sessionCookie` 인 항목에 저장한다.
`HOME` 을 바꿔 다른 위치의 설정을 쓰면 계정 이름 뒤에 `:` 과 설정 파일 경로에서 만든 16자리 값이 붙어, 설정 파일마다 항목이 따로 생긴다.
설정 파일에 값이 남아 있으면 그 값을 쓰고, 없을 때만 키체인에서 읽는다.
예전 버전이 설정 파일에 평문으로 저장해 둔 값은 그대로 읽히고, `dooray setup` 이나 `dooray config set` 으로 설정을 한 번 저장하면 키체인으로 옮겨지면서 설정 파일에서 빠진다.
새로 지정하는 값은 영문·숫자·기호와 공백만 쓸 수 있다. 줄바꿈·탭·한글이 있으면 저장하지 않고 종료 코드 3 으로 끝낸다.
예전 버전이 저장해 둔 값에 그런 문자가 있으면 그 값만 설정 파일에 남기고 경고를 출력한다. 값을 바꾸면 그때 키체인으로 옮겨진다.
키체인에서 읽어야 하는데 키체인이 잠겨 있거나 접근이 거부되면 오류로 끝난다.
설정을 저장할 때는 키체인을 읽고 쓰므로, 아직 키체인으로 옮기지 않은 설정이라도 키체인이 잠겨 있으면 저장이 실패한다.
`dooray setup` 은 시작할 때 기존 설정을 키체인에서 읽어야 하는데 읽지 못하면 질문을 시작하기 전에 끝난다.
이때는 스킬 설치 단계도 건너뛰므로, 스킬은 `dooray skill install` 로 따로 설치한다.
설정 파일이 아직 없는 첫 설정이거나, API 토큰과 IMAP 비밀번호가 모두 설정 파일에 남아 있으면 시작할 때 키체인을 읽지 않는다.
그래서 질문은 끝까지 진행되지만 마지막 저장 단계에서 실패하고, 입력한 값은 저장되지 않는다.
SSH 같은 원격 세션에서는 로그인 키체인이 잠겨 있을 수 있다. `security unlock-keychain` 으로 잠금을 푼 뒤 `dooray setup` 을 실행한다.
그래도 실패하면 키체인 접근 앱에서 이름이 `dooray-cli` 인 항목을 지우고 `dooray setup` 을 다시 실행한다.
저장 중에 실패하면 이번에 바꾼 키체인 값을 이전 값으로 되돌린다.
macOS 가 아닌 OS 는 지금처럼 설정 파일에 저장한다.
설정 파일 하나를 macOS 와 다른 OS 에서 동기화해 함께 쓰면, 다른 OS 에서 넣은 토큰은 macOS 에서 설정을 저장할 때마다 키체인으로 옮겨지면서 설정 파일에서 빠진다. 그러면 다른 OS 쪽은 다시 설정 미완료가 된다. 이렇게 쓰려면 설정 파일을 동기화 대상에서 빼고 OS 마다 따로 설정한다.

`api-key`, `base-url`, `auth-mode`, `session-cookie` 를 바꾸거나 웹 방식에서 `tenant-name` 을 바꾸면 캐시를 함께 비우고 그 사실을 알린다.
캐시는 계정과 접속 환경별로 나뉘지 않아서, 비우지 않으면 이전 계정의 프로젝트와 멤버가 남아 잘못 매칭된다.
같은 값을 다시 설정하는 경우와 최초 설정에서는 비우지 않는다.

## 웹 로그인 세션으로 연결하기

`dooray setup` 에서 `web` 을 선택하면 테넌트 주소를 확인한 뒤 SESSION 쿠키를 가려진 입력으로 받는다. 기존 API 키는 지우지 않는다.
웹 방식은 **비공식 웹 API** 를 사용한다. 경로와 응답이 예고 없이 바뀔 수 있고 SESSION 은 로그인 계정의 모든 권한을 가진다.
클라우드 주소 규칙은 민간 클라우드에서 실측했으며 다른 클라우드에서는 실측하지 않았다.

1. Dooray 웹에 로그인하고 브라우저 개발자 도구를 연다.
2. Application → Storage → Cookies 에서 테넌트 웹 주소를 선택한다.
3. 이름이 SESSION 인 쿠키의 값을 복사해 setup 의 가려진 입력에 넣는다.

수동으로 설정할 수도 있다. 아래 `<tenant>` 는 실제 테넌트 이름으로 바꾼다. 영문 소문자·숫자·하이픈만 쓸 수 있으며 기본값 `example` 은 웹 방식에서 미설정으로 본다.

```bash
dooray config set base-url https://api.dooray.com
dooray config set tenant-name <tenant>
dooray config set auth-mode web
dooray config set session-cookie -
dooray doctor
```

마지막 쿠키 입력은 stdin 이다. 값, `SESSION=값`, `Cookie: a=1; SESSION=값; b=2` 를 받아 SESSION 값만 저장한다.
쿠키를 위치 인자로 넘기면 셸 기록·프로세스 목록에 남을 수 있다. `config get session-cookie` 는 값 대신 설정됨·미설정만 보여 준다.
API 방식에서도 저장한 쿠키를 확인할 수 있으며, 일반 조회에서는 쿠키 키체인을 추가로 읽지 않는다.
`config set auth-mode web` 과 setup 에서 웹을 고를 때 비공식 API 경고가 한 번 나온다. 일반 조회에는 나오지 않으며 doctor 의 인증 방식 항목은 경고로 표시한다.

브라우저 로그아웃이나 세션 만료 뒤에는 쿠키를 다시 넣는다. 401·로그인 화면 리다이렉트는 종료 코드 2 와 재입력 방법을 안내한다.
403 은 같은 종료 코드지만 쿠키 대신 대상에 대한 권한이 없다고 안내한다. doctor 는 연결 실패를 종료 코드 1 로 보고하며 원래 안내를 보여 준다.
웹 방식은 API 키가 없어도 완료된 설정이고 메일은 기존 IMAP·SMTP 인증을 쓴다.
공개 API 를 다시 쓰려면 `dooray config set auth-mode api-key` 로 바꾼다. 기존 쿠키는 남겨 둔다.

## 웹 방식의 지원 범위

웹 방식에서는 아래 명령만 사용할 수 있다. 지원하지 않는 명령·옵션은 API 요청 전에 종료 코드 3 으로 끝나며 `auth-mode` 를 `api-key` 로 바꾸라고 안내한다.
`setup`, `config`, `doctor`, `cache`, `skill`, `feedback`, `mail` 은 이 목록과 무관하게 사용할 수 있다.

### 프로젝트

| 지원 명령 | 지원하지 않는 옵션 |
| --- | --- |
| `project list` | 없음 |
| `project members` | 없음 |
| `project workflows` | 없음 |
| `project groups` | 없음 |
| `project tags` | 없음 |
| `project tags list` | 없음 |
| `project tags create` | 없음 |
| `project tags group` | 없음 |
| `project templates` | 없음 |

#### 웹 응답에서 빠질 수 있는 필드

`--json` 은 공식 API 의 필드 이름과 구조를 유지한다. 웹에 없는 값은 키를 만들지 않는다.
캐시와 출력 선택 때문에 필요한 필드만 보이는 기존 동작도 유지한다.

| 명령 | 빠질 수 있는 필드 |
| --- | --- |
| `project list` | 웹에 없는 organization·drive·wiki 참조. 목록 출력은 캐시의 id·code·wikiId 를 사용 |
| `project tags`, `project tags list` | 그룹 없는 태그는 그룹 필드가 비어 있음 |
| `project groups` | 웹에서 code 가 없는 그룹의 code. 이름 매칭에서 제외하며 id 로 지정 가능 |
| `project templates` | 기존 목록 출력처럼 본문·가이드는 포함하지 않음 |

### 멤버

| 지원 명령 | 지원하지 않는 옵션 |
| --- | --- |
| `member list` | 없음 |
| `member get` | `--with-org` |
| `member search` | 없음 |

#### 웹 응답에서 빠질 수 있는 필드

`--json` 은 공식 API 의 필드 이름과 구조를 유지한다. 웹에 없는 값은 키를 만들지 않는다.
캐시와 출력 선택 때문에 필요한 필드만 보이는 기존 동작도 유지한다.

| 명령 | 빠질 수 있는 필드 |
| --- | --- |
| `member get` | 웹에 값이 없는 displayMemberId·userCode·externalEmailAddress 등 상세 필드 |
| `member search` | 웹에 값이 없는 userCode·externalEmailAddress |
| `member list`, `project members` | 기존 출력처럼 이름·식별자 위주. 목록용 이름 캐시와 상세 응답 캐시는 따로 보관 |

### 업무

아직 지원하지 않음.

#### 웹 응답에서 빠질 수 있는 필드

이 영역을 지원할 때 기록한다.

### 위키

| 지원 명령 | 지원하지 않는 옵션 |
| --- | --- |
| `wiki list` | 없음 |
| `wiki pages` | 없음 |
| `wiki tree` | 없음 |
| `wiki page get` | 없음 |
| `wiki page create` | 없음 |
| `wiki page edit` | `--mime-type` |
| `wiki page replace` | 없음 |
| `wiki page move` | `--to-wiki` |
| `wiki page delete` | 없음 |
| `wiki page file list` | 없음 |
| `wiki page file upload` | 없음 |
| `wiki page file download` | 없음 |
| `wiki page file download-all` | 없음 |
| `wiki page file delete` | 없음 |
| `wiki page comment list` | 없음 |
| `wiki page comment latest` | 없음 |
| `wiki page comment get` | 없음 |
| `wiki page comment add` | 없음 |
| `wiki page comment edit` | 없음 |
| `wiki page comment delete` | 없음 |

- `--mime-type` 은 값과 관계없이 막는다. 웹이 본문 형식으로 `text/x-markdown` 만 받아서 `text/html` 같은 값은 서버가 거절한다. 기존 본문이 `text/x-markdown` 이 아닌 페이지를 고치는 것도 같은 이유로 요청 전에 종료 코드 3 으로 끝난다.
- `--to-wiki` 는 다른 위키로 옮기는 웹 경로를 확인하지 못해 막는다.

#### 웹 응답에서 빠질 수 있는 필드

`--json` 은 공식 API 의 필드 이름과 구조를 유지한다. 웹에 없는 값은 키를 만들지 않는다.
캐시와 출력 선택 때문에 필요한 필드만 보이는 기존 동작도 유지한다.

| 명령 | 빠질 수 있는 필드 |
| --- | --- |
| `wiki pages`, `wiki tree` | 작성자 이름. 공식 목록 응답에는 이름이 없고 웹 응답의 이름도 낼 공식 필드가 아니라서 작성자 열이 빈다 |
| `wiki page get` | 작성자 이름(같은 이유), 웹의 본문 식별자·위치·권한 등 공식에 없는 필드 |
| `wiki page comment list`, `wiki page comment get` | 웹의 수정자·첨부·반응 필드 |

웹 방식에서 다르게 동작하는 것:

- 같은 부모 아래 같은 제목으로 페이지를 만들거나 제목을 바꾸면, 웹은 거절하지 않고 제목에 ` (1)` 을 붙여 저장한다. CLI 는 쓰기 전에 같은 부모의 형제 제목을 확인해 같으면 종료 코드 1 로 끝낸다(공식 API 의 409 와 같은 결과). 확인과 쓰기 사이에 다른 사람이 같은 제목을 만들었거나 권한 때문에 형제 목록에 보이지 않는 페이지가 있으면 서버가 제목을 바꿔 저장할 수 있다. 그때는 쓴 뒤 저장된 제목을 stderr 로 경고한다. 이 확인 때문에 쓰기 하나마다 호출이 늘어난다. 페이지 생성은 두 번(형제 목록, 저장된 제목 확인), 제목만 고치는 수정은 한 번에서 두 번(페이지 상세, 제목이 바뀔 때 형제 목록), 제목과 본문을 함께 고치는 수정은 두 번에서 세 번(페이지 상세, 제목이 바뀔 때 형제 목록, 저장된 제목 확인)이다.
- 페이지를 지우면 하위 페이지는 지워지지 않고 지운 페이지의 부모 아래로 올라간다.
- `wiki tree` 는 한 번에 받는 경로가 없어 페이지 수만큼 형제 목록을 부른다. 큰 위키는 호출이 늘고 요청 간격 제한에 묶여 느리다.
- 댓글 목록은 `(page+1)×size` 가 1000 이하일 때만 지원한다. 1000 은 확인한 값이며 서버의 최대치는 아니다.
- 첨부 다운로드·삭제는 먼저 페이지 상세로 그 파일이 이 페이지의 것인지 확인한다. 없으면 종료 코드 1 로 끝난다.

### 메신저

아직 지원하지 않음.

#### 웹 응답에서 빠질 수 있는 필드

이 영역을 지원할 때 기록한다.

### 캘린더

아직 지원하지 않음.

#### 웹 응답에서 빠질 수 있는 필드

이 영역을 지원할 때 기록한다.

### 스트림

아직 지원하지 않음.

#### 웹 응답에서 빠질 수 있는 필드

이 영역을 지원할 때 기록한다.

## 보안 경고와 진단

macOS 에서 설정 파일에 키체인으로 옮길 수 있는 평문 비밀값이 남아 있거나, macOS·Linux 에서 비밀값을 담은 파일의 권한이 넓으면 설정을 읽는 명령이 stderr 로 경고한다.
읽기만으로 파일이나 키체인을 고치지는 않는다.
경고에 나온 명령을 그대로 실행하면 현재 실행 기록 설정을 유지하면서 다시 저장한다.
macOS 에서는 비밀값을 키체인으로 옮기고, 모든 OS 에서 파일 권한을 0600 으로 맞춘다.
예를 들어 현재 실행 기록이 꺼져 있다면 다음과 같다.

```bash
dooray config set track-last-run false
```

실행 기록이 켜져 있다면 `false` 대신 `true` 를 쓴다.
키체인에 넣을 수 없는 구버전 값과 암호화 저장소를 지원하지 않는 OS 의 평문 저장은 `dooray doctor` 에서만 경고로 보인다.
파일 권한 경고는 이 경우에도 적용된다.

`dooray doctor` 는 설정, API 연결, 설정 파일 보안에 실패 항목이 있으면 종료 코드 1 로 끝난다.
경고만 있거나 스킬이 미설치된 경우에는 종료 코드 0 이다.
`dooray doctor --json` 은 기존 설정·연결·스킬 정보와 함께 `checks` 배열에 항목별 `id`, `status`(`pass`, `warn`, `fail`), `message`, 필요한 경우 `fix` 를 담는다.

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

출력 모드는 다음과 같다.

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
