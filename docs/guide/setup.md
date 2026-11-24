# 설치와 설정

`dooray` 를 설치하고 Dooray 계정에 연결하는 방법을 순서대로 안내해요.
처음이라면 「설치」 부터 「연결 확인하기」 까지만 따라 하면 돼요.

1. [설치](#설치)
2. [인증 방식 고르기](#인증-방식-고르기)
3. [연결 확인하기](#연결-확인하기)
4. [에이전트 스킬](#에이전트-스킬)
5. [설정 값 바꾸기](#설정-값-바꾸기)
6. [도움말과 출력 모드](#도움말과-출력-모드)
7. [웹 방식의 지원 범위](#웹-방식의-지원-범위)
8. [문제 해결](#문제-해결)
9. [자세히](#자세히)

## 설치

Node.js 20 이상이 필요해요.

```bash
npm install -g @bifos/dooray-cli
```

설치가 끝나면 버전이 나오는지 확인해요.

```bash
dooray --version
```

## 인증 방식 고르기

`dooray` 가 Dooray 에 접속하는 방식은 두 가지예요.

| 방식 | 접속 경로 | 이럴 때 골라요 |
| --- | --- | --- |
| API 키 | 공개 API | 인증 토큰을 만들 수 있을 때. 기본값이고 모든 명령을 쓸 수 있어요 |
| 웹 로그인 세션 | 비공식 웹 API | API 키를 쓸 수 없을 때. 쓸 수 있는 명령이 일부예요 |

둘 중 하나만 따라 하면 돼요. 나중에 바꾸는 방법은 [설정 값 바꾸기](#설정-값-바꾸기)에 있어요.

### API 키로 연결하기

1. Dooray 웹에서 **설정 → API → 인증 토큰** 으로 가서 토큰을 만들어요.
2. 터미널에서 `dooray setup` 을 실행해요.

   ```bash
   dooray setup
   ```

3. 질문에 차례로 답해요. 인증 방식은 `API 키` 를 골라요.

   | 순서 | 질문 | 답 |
   | --- | --- | --- |
   | 1 | 인증 방식 | `API 키 (공개 API)` |
   | 2 | 테넌트명 | 회사 Dooray 주소의 앞부분 (`https://<tenant>.dooray.com` 의 `<tenant>`) |
   | 3 | API Endpoint | 쓰는 클라우드 (민간·공공·공공 업무망·금융) |
   | 4 | API Key | 1번에서 만든 토큰. 입력해도 화면에 보이지 않아요 |
   | 5 | 메일 기능 | 쓰면 IMAP 사용자 이메일과 비밀번호를 이어서 물어요 |
   | 6 | 스킬 설치 | [에이전트 스킬](#에이전트-스킬) 참고. 홈에 `.claude`, `.codex`, `.agents` 폴더 중 하나가 있을 때만 물어요. `npx` 로 실행하면 묻지 않고 경고만 나와요 |
   | 7 | `feedback --last` 모드 | 기본은 꺼짐이에요 |

4. 토큰이 맞으면 `✓ API 연결 성공 (<내 이름>)` 이 나오고, 마지막에 `✓ 설정 완료` 가 나와요.
   토큰이 틀리면 `✗ 연결 실패` 가 나오고 API Key 를 다시 물어요.

### API 키 방식에서 댓글 리액션 쓰기

`auth-mode` 를 API 키 방식으로 두고 아래 설정을 추가하면 `post comment react` 를 쓸 수 있어요.

1. `dooray config set tenant-name <tenant>` 로 로그인한 테넌트 이름을 설정해요.
2. 아래 [SESSION 쿠키 찾기](#웹-로그인-세션으로-연결하기) 절을 따라 같은 테넌트의 쿠키를 복사하고 `dooray config set session-cookie -` 에 파이프로 넘겨 저장해요.
3. `dooray doctor` 에서 쿠키가 설정됐는지 확인해요. 연결 테스트는 API 키로 실행해요.

쿠키가 없거나 만료되면 리액션 명령은 종료 코드 3 과 함께 쿠키를 다시 넣는 방법을 알려 줘요.

### 웹 로그인 세션으로 연결하기

웹 방식은 **비공식 웹 API** 를 써요.
경로와 응답이 예고 없이 바뀔 수 있어요.
SESSION 쿠키는 로그인 계정의 모든 권한을 가지므로 비밀값으로 다뤄요.
클라우드 주소 규칙은 민간 클라우드에서만 확인했어요.

**1단계. SESSION 쿠키를 찾아요.**

1. 브라우저에서 Dooray 웹(`https://<tenant>.dooray.com`)에 로그인해요.
2. 개발자 도구를 열어요. 보통 `F12` 예요. macOS 는 `Cmd + Option + I` 예요.
3. **Application → Storage → Cookies** 에서 테넌트 주소를 눌러요.
4. 이름이 `SESSION` 인 행의 값(Value)을 복사해요.

`document.cookie` 에는 SESSION 이 보이지 않아요. 콘솔에서 꺼내려 하지 말고 위 화면에서 복사해요.

**2단계. 쿠키를 넣어요.** 둘 중 편한 쪽을 써요.

- 대화형: `dooray setup` 을 실행하고 인증 방식에서 `웹 로그인 세션` 을 골라요.
  테넌트명과 클라우드를 답하면 접속 주소를 보여 주고, 이어서 SESSION 쿠키를 물어요.
  복사한 값을 붙여 넣으면 `✓ 웹 연결 성공 (<내 이름>)` 이 나와요.
- 명령으로: 먼저 접속 정보를 정하고, 쿠키는 클립보드에서 바로 넘겨요.
  `<tenant>` 는 실제 테넌트 이름으로 바꿔요. 영문 소문자·숫자·하이픈만 쓸 수 있어요.

  ```bash
  dooray config set base-url https://api.dooray.com
  dooray config set tenant-name <tenant>
  dooray config set auth-mode web
  ```

  그다음 운영체제에 맞는 명령으로 클립보드의 쿠키를 `-` 자리에 넘겨요.

  | 운영체제 | 명령 |
  | --- | --- |
  | macOS | `pbpaste \| dooray config set session-cookie -` |
  | Windows (PowerShell) | `Get-Clipboard \| dooray config set session-cookie -` |
  | Linux (X11) | `xclip -selection clipboard -o \| dooray config set session-cookie -` |
  | Linux (Wayland) | `wl-paste \| dooray config set session-cookie -` |

  성공하면 `✓ session-cookie 설정 완료` 가 나와요.

쿠키를 명령 인자로 적지 않는 이유는 [설정 값 바꾸기](#설정-값-바꾸기)에 있어요.
`dooray config set session-cookie -` 는 파이프로 값을 받아야 해요. 터미널에 그냥 붙여 넣으면 종료 코드 3 으로 끝나요.

**3단계. 연결을 확인해요.** [연결 확인하기](#연결-확인하기)로 넘어가요.

웹 방식을 쓸 때 알아 둘 것이 있어요.

- 브라우저에서 로그아웃하거나 세션이 만료되면 1단계부터 다시 해서 쿠키를 새로 넣어요.
- API 키가 없어도 설정은 끝난 것으로 봐요.
- 메일은 웹 방식과 상관없이 IMAP·SMTP 인증을 써요.
- 쓸 수 있는 명령은 [웹 방식의 지원 범위](#웹-방식의-지원-범위)에 있어요.
- 공개 API 로 돌아가려면 `dooray config set auth-mode api-key` 를 실행해요. 저장해 둔 쿠키는 그대로 남아요.

## 연결 확인하기

설정이 끝났으면 `doctor` 로 확인해요.

```bash
dooray doctor
```

설정, API 연결, 설정 파일 보안, 스킬 상태를 한 번에 점검해요.
잘 연결됐다면 이런 줄이 나와요.

```text
  연결:     ✅ 성공 (<내 이름>)
  ...
✓ 기본 설정이 완료되었습니다.
```

실패한 항목이 있으면 `❌` 로 표시하고 종료 코드 1 로 끝나요.
경고(`⚠`)만 있거나 스킬을 아직 설치하지 않았다면 종료 코드 0 이에요.
웹 방식이면 `인증 방식` 항목이 경고로 보이는데 정상이에요. 비공식 API 를 쓴다는 알림이에요.

연결이 안 되면 [문제 해결](#문제-해결)을 봐요.

## 에이전트 스킬

Claude Code 나 Codex 같은 에이전트가 `dooray` 를 쓰게 하려면 스킬을 설치해요.
한 번 실행하면 두 에이전트가 같은 사용법을 읽어요.

```bash
dooray skill install
dooray skill status
```

`dooray skill status` 는 에이전트마다 설치 상태를 보여 줘요.
`--quiet` 을 붙이면 두 에이전트의 상태를 합친 값 하나를 내고, 둘 다 최신일 때만 `current` 예요.

설치 경로는 아래와 같아요.

| 에이전트 | 경로 |
| --- | --- |
| Claude Code | `~/.claude/skills/dooray-cli` |
| Codex | `~/.agents/skills/dooray-cli` |

- 두 경로는 같은 관리형 저장소에 연결돼요.
- Codex 를 설치하지 않았어도 양쪽을 함께 관리해요. `install` 과 `update` 는 필요한 `~/.agents/skills` 폴더도 만들어요.
- 예전에 Claude Code 에만 설치했다면 `dooray skill install` 을 다시 실행해 Codex 에도 연결해요.
- Codex 에서는 `$dooray-cli` 로 스킬을 불러요. 새 스킬이 보이지 않으면 Codex 를 다시 시작해요.
- 해당 경로에 내가 만든 파일이나 폴더가 있으면 덮어쓰지 않아요. 내용을 확인한 뒤 `--force` 를 주면 백업하고 교체해요.

CLI 를 새 버전으로 올린 뒤에는 `dooray skill update` 를 실행해요. 그래야 두 에이전트의 스킬이 함께 갱신돼요.

## 설정 값 바꾸기

값 하나만 바꾸려면 `dooray config set <키> <값>` 을 써요.
토큰이나 쿠키처럼 비밀값은 `-` 를 주고 stdin 으로 넘겨요.

```bash
printf '%s' "$TOKEN" | dooray config set api-key -
```

명령 인자로 넘기면 셸 기록과 프로세스 목록에 남아요.
에이전트가 대신 실행하면 실행 로그에도 남아요.
stdin 으로 넘긴 값은 성공하면 `✓ api-key 설정 완료` 가 나와요.

저장할 때 아래 규칙을 지켜요.

- stdin 으로 받은 값은 양끝 공백을 지운 뒤 저장해요.
- stdin 으로 받은 값이 비어 있으면 저장하지 않고 종료 코드 3 으로 끝나요. 인자로 준 빈 값은 이 검사를 받지 않아요.
- `imap-port` 와 `smtp-port` 는 1 에서 65535 사이의 정수만 받아요.
- `track-last-run` 은 `true`, `false`, `yes`, `no`, `1`, `0` 만 받아요.
- 위 세 키에 그 밖의 값을 주면 저장하지 않고 종료 코드 3 으로 끝나요.
- macOS 에서 키체인에 저장하는 비밀값에는 문자 제한이 있어요. 자세한 내용은 [비밀값 저장 위치](#비밀값-저장-위치)에 있어요.

현재 값은 `dooray config get` 으로 봐요. API 키는 앞뒤 네 글자만 보여 주고, SESSION 쿠키는 값 대신 설정됨·미설정만 보여 줘요.

자주 바꾸는 값은 아래와 같아요.

| 키 | 하는 일 |
| --- | --- |
| `auth-mode` | `api-key` 와 `web` 중에서 인증 방식을 바꿔요 |
| `api-key` | API 토큰을 바꿔요 |
| `session-cookie` | 웹 방식과 웹 전용 명령이 쓰는 SESSION 쿠키를 바꿔요 |
| `base-url` | 클라우드 주소를 바꿔요 |
| `tenant-name` | 테넌트 이름을 바꿔요 |

계정이나 접속 환경이 바뀌는 키를 바꾸면 캐시를 함께 비우고 그 사실을 알려요.
그다음 조회는 API 를 다시 불러서 조금 느릴 수 있어요.
비우는 조건은 [자세히](#캐시를-비우는-때)에 있어요.

## 도움말과 출력 모드

전체 명령과 옵션은 `--help` 로 봐요.

```bash
dooray --help
dooray post --help
dooray post create --help
```

출력 모드는 세 가지예요.

| 플래그 | 출력 | 쓰는 곳 |
| --- | --- | --- |
| (없음) | 사람이 읽는 표 | 터미널 |
| `--json` | JSON | 파싱, 명령 연결 |
| `--quiet` | ID 만 | 스크립트 |

- 이 옵션들은 전역 옵션이라 모든 명령에 붙일 수 있어요. 서브커맨드의 `--help` 에는 나오지 않아요.
- `--no-color` 도 전역 옵션이에요. 붙이면 색상을 꺼요. 환경 변수 `NO_COLOR` 가 설정돼 있어도 같게 동작해요.

`--quiet` 으로 받은 ID 를 다음 명령에 넘길 수 있어요.

```bash
POST_ID=$(dooray post create <project> --title "배포" --quiet)
dooray post comment add --id "$POST_ID" --body "시작합니다"
```

## 웹 방식의 지원 범위

웹 방식에서는 아래 명령만 쓸 수 있어요.
지원하지 않는 명령이나 옵션은 API 를 부르기 전에 종료 코드 3 으로 끝나고, `auth-mode` 를 `api-key` 로 바꾸라고 안내해요.
`setup`, `config`, `doctor`, `cache`, `skill`, `feedback`, `mail` 은 이 목록과 상관없이 써요.

영역마다 「웹 응답에서 빠질 수 있는 필드」 가 있어요. 규칙은 모두 같아요.

- `--json` 은 공식 API 의 필드 이름과 구조를 그대로 써요.
- 웹에 없는 값은 키를 만들지 않아요.
- 캐시와 출력 선택 때문에 필요한 필드만 보이는 기존 동작도 그대로예요.

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

| 명령 | 빠질 수 있는 필드 |
| --- | --- |
| `project list` | 웹에 없는 organization·drive·wiki 참조. 목록 출력은 캐시의 id·code·wikiId 를 써요 |
| `project tags`, `project tags list` | 그룹 없는 태그는 그룹 필드가 비어 있어요 |
| `project groups` | 웹에서 code 가 없는 그룹의 code. 이름 매칭에서 제외하고 id 로 지정할 수 있어요 |
| `project templates` | 기존 목록 출력처럼 본문·가이드는 포함하지 않아요 |

### 멤버

| 지원 명령 | 지원하지 않는 옵션 |
| --- | --- |
| `member list` | 없음 |
| `member get` | `--with-org` |
| `member search` | 없음 |

#### 웹 응답에서 빠질 수 있는 필드

| 명령 | 빠질 수 있는 필드 |
| --- | --- |
| `member get` | 웹에 값이 없는 displayMemberId·userCode·externalEmailAddress 등 상세 필드 |
| `member search` | 웹에 값이 없는 userCode·externalEmailAddress |
| `member list`, `project members` | 기존 출력처럼 이름·식별자 위주예요. 목록용 이름 캐시와 상세 응답 캐시는 따로 보관해요 |

### 업무

| 명령 | 지원하지 않는 옵션 |
| --- | --- |
| `post list` | 없음 |
| `post search` | 없음 |
| `post get` | 없음 |
| `post create` | 없음 |
| `post edit` | 없음 |
| `post replace` | 없음 |
| `post done` | 없음 |
| `post workflow` | 없음 |
| `post comment list` | 없음 |
| `post comment latest` | 없음 |
| `post comment get` | 없음 |
| `post comment add` | 없음 |
| `post comment edit` | 없음 |
| `post comment delete` | 없음 |
| `post comment react` | 없음 |
| `post comment file list` | 없음 |
| `post comment file upload` | 없음 |
| `post comment file download` | 없음 |
| `post comment file delete` | 없음 |
| `post file list` | 없음 |
| `post file upload` | 없음 |
| `post file download` | 없음 |
| `post file download-all` | 없음 |
| `post file delete` | 없음 |

웹 방식에서 업무가 다르게 동작하는 곳이에요.

- 완료 상태가 여러 개인 프로젝트에서는 `post done` 이 대표 상태를 확인하지 못해 종료 코드 3 으로 멈춰요. `post workflow <상태>` 로 원하는 완료 상태를 직접 정해요. 완료 상태가 하나뿐이면 `post done` 을 써요.
- 담당자마다 진행 상태가 다른 업무는 수정을 요청하기 전에 종료 코드 3 으로 멈춰요.
- 같은 상태의 기존 참여자는 수정할 때 workflowId 를 그대로 보존해요.
- 다른 프로젝트의 업무를 상위 업무로 지정하는 것은 지원하지 않아요. `edit` 은 본문을 바꾸기 전에 상위 업무의 프로젝트를 검사해요.
- 외부 이메일 참여자(`emailUser`)가 있는 업무나 템플릿에는 쓰지 못하고 종료 코드 3 으로 멈춰요. 쓰기 요청 형식을 확인하지 못했기 때문이에요. 참여자를 조용히 빼지 않고 API 키 방식으로 바꾸라고 안내해요.
- 완료 기한 없음(`dueDateFlag` 가 false)으로 새로 바꾸는 요청은 서버가 무시해서 종료 코드 3 으로 멈춰요. 이미 false 인 업무의 본문을 고칠 때는 이 필드를 보내지 않고 그대로 둬요.
- 멤버·그룹 참여자와 HTML·Markdown 본문은 지원해요. 본문 합성·미리보기 옵션은 API 방식과 같아요.
- `post comment react` 는 웹 API 를 써요. API 키 방식에서도 [웹 세션을 저장](#api-키-방식에서-댓글-리액션-쓰기)하면 동작해요.
- 댓글 목록을 오름차순으로 읽으면 이전 댓글을 모아야 해서 큰 업무는 첫 조회가 오래 걸릴 수 있어요. 최신 댓글과 내림차순 첫 페이지는 최신 구간만 읽어요.

#### 웹 응답에서 빠질 수 있는 필드

- 웹 댓글에 `mailUsers` 가 없으면 이 키를 만들지 않아요.
- 업무의 `fileIdList` 와 댓글 단건의 `files` 는 그대로 둬요.
- 웹 내부의 버전·권한·다운로드 URL 같은 값은 공식 응답에 넣지 않아요.

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

- `--mime-type` 은 웹이 `text/x-markdown` 만 받아서 값과 상관없이 막아요. 기존 본문이 다른 형식인 페이지를 고치는 것도 요청 전에 종료 코드 3 으로 끝나요.
- `--to-wiki` 는 다른 위키로 옮기는 웹 경로를 확인하지 못해서 막아요.

#### 웹 응답에서 빠질 수 있는 필드

| 명령 | 빠질 수 있는 필드 |
| --- | --- |
| `wiki pages`, `wiki tree` | 작성자 이름. 공식 목록 응답에는 이름이 없고 웹 응답의 이름도 낼 공식 필드가 아니라서 작성자 열이 비어요 |
| `wiki page get` | 작성자 이름(같은 이유), 웹의 본문 식별자·위치·권한 등 공식에 없는 필드 |
| `wiki page comment list`, `wiki page comment get` | 웹의 수정자·첨부·반응 필드 |

웹 방식에서 위키가 다르게 동작하는 곳이에요.

- 같은 부모 아래에 같은 제목으로 페이지를 만들거나 제목을 바꾸면, 웹은 거절하지 않고 제목 뒤에 ` (1)` 을 붙여 저장해요. `dooray` 는 쓰기 전에 같은 부모의 형제 제목을 확인해서 같으면 종료 코드 1 로 끝내요. 공식 API 의 409 와 같은 결과예요.
- 확인과 쓰기 사이에 다른 사람이 같은 제목을 만들었거나, 권한 때문에 형제 목록에 보이지 않는 페이지가 있으면 서버가 제목을 바꿔 저장할 수 있어요. 그때는 쓴 뒤 저장된 제목을 stderr 로 경고해요.
- 페이지를 지우면 하위 페이지는 지워지지 않고 지운 페이지의 부모 아래로 올라가요.
- `wiki tree` 는 한 번에 받는 경로가 없어서 페이지 수만큼 형제 목록을 불러요. 큰 위키는 호출이 늘고 요청 간격 제한에 걸려 느려요.
- 댓글 목록은 `(page+1)×size` 가 1000 이하일 때만 지원해요. 1000 은 확인한 값이고 서버의 최대치는 아니에요.
- 첨부 다운로드·삭제는 먼저 페이지 상세에서 그 파일이 이 페이지의 것인지 확인해요. 없으면 종료 코드 1 로 끝나요.
- 제목 확인 때문에 쓰기마다 호출이 늘어요. 호출 횟수는 [자세히](#웹-방식-위키-쓰기의-호출-횟수)에 있어요.

### 메신저

| 지원 명령 | 지원하지 않는 옵션 |
| --- | --- |
| `messenger channels` | 없음 |
| `messenger logs` | 없음 |
| `messenger send` | 없음 |
| `messenger channel-send` | 없음 |
| `messenger thread-send` | 없음 |
| `messenger file download` | 없음 |

웹에는 상대 id 로 1:1 방에 바로 보내는 경로가 없어요.
`messenger send --to` 는 이렇게 동작해요.

- 나 자신이면 나와의 대화방으로 보내요.
- 그 밖에는 이미 있는 1:1 방으로 보내요.
- 방이 없으면 요청 전에 종료 코드 3 으로 끝나요.

메시지 보내기는 나에게 보내는 대화방에서만 확인했어요. 다른 사람의 대화방과 스레드도 같은 요청이에요.

#### 웹 응답에서 빠질 수 있는 필드

| 명령 | 빠질 수 있는 필드 |
| --- | --- |
| `messenger channels` | 웹에 없는 `archivedAt`. 대화방 `role` 은 웹 값(`creator`, `member`)이에요 |
| `messenger logs` | 메시지 `type` 은 파일(`FILE`)과 답장(`REPLY`)만 채워요 |
| `messenger send`, `messenger channel-send`, `messenger thread-send` | 결과는 `id`(와 `channelId`)만 나와요 |

### 캘린더

| 지원 명령 | 지원하지 않는 옵션 |
| --- | --- |
| `calendar list` | 없음 |
| `calendar event list` | 없음 |
| `calendar event get` | 없음 |
| `calendar event create` | `--to`, `--cc` |
| `calendar event edit` | `--to`, `--cc` |
| `calendar event delete` | 없음 |

참석자와 참조자를 넣는 쓰기는 웹에서 확인하지 못해서 지원하지 않아요.
일정을 읽을 때의 참석자는 웹 응답대로 보여 줘요.

#### 웹 응답에서 빠질 수 있는 필드

| 명령 | 빠질 수 있는 필드 |
| --- | --- |
| `calendar list` | 웹에 없는 `projectId`(개인 캘린더). 구독 캘린더는 공식 목록처럼 나오지 않아요 |
| `calendar event list` | 웹에 없는 `conferencing`. `category` 를 보내지 않아 일반 일정만 나와요 |
| `calendar event get` | 웹에 없는 첨부 `files`, `conferencing` |

### 스트림

| 지원 명령 | 지원하지 않는 옵션 |
| --- | --- |
| `stream list` | 없음 |

#### 웹 응답에서 빠질 수 있는 필드

| 명령 | 빠질 수 있는 필드 |
| --- | --- |
| `stream list` | 웹의 캘린더 공유 알림·위키 활동 같은 공식 종류에 없는 항목은 빠져요(처음 빠질 때 stderr 로 알려 줘요). 웹 카드 하나가 원소 여러 개가 되므로 `--size` 는 카드 수예요 |

## 문제 해결

먼저 `dooray doctor` 를 실행해서 어느 항목이 실패했는지 봐요.

**`doctor` 가 설정이 필요하다고 해요.**
`dooray setup` 을 실행해요. 웹 방식이면 접속 주소를 만들 수 없을 때도 이 안내가 나와요.
이때는 클라우드와 테넌트 이름을 확인해요. 기본값인 `example` 은 웹 방식에서 미설정으로 봐요.

**API 키 방식에서 `연결 실패` 가 나와요.**
토큰이 틀렸거나 테넌트·클라우드가 맞지 않는 경우예요.
`dooray setup` 을 다시 실행해 세 가지를 확인해요.

**웹 방식에서 쿠키를 다시 넣으라고 해요.**
브라우저에서 로그아웃했거나 세션이 만료된 경우예요. 종료 코드 2 로 끝나요.
[웹 로그인 세션으로 연결하기](#웹-로그인-세션으로-연결하기)의 1단계부터 다시 해요.

**웹 방식에서 권한이 없다고 해요.**
종료 코드는 같은 2 지만 쿠키 문제가 아니에요. 그 대상에 대한 권한이 없다는 뜻이에요.
`doctor` 는 연결 실패를 종료 코드 1 로 보고하고 원래 안내를 그대로 보여 줘요.

**명령이 종료 코드 3 으로 끝나요.**
종료 코드 3 은 입력이나 옵션이 잘못됐을 때 나와요. 포트 범위를 벗어난 값, 빈 stdin 입력, 잘못된 기간 같은 경우예요.
먼저 오류 메시지를 읽고 그 안내대로 입력을 고쳐요.

웹 방식에서 메시지가 지원하지 않는 명령이나 옵션이라고 안내할 때만 아래를 따라요.

1. [웹 방식의 지원 범위](#웹-방식의-지원-범위)에서 그 명령과 옵션이 지원되는지 확인해요.
2. 지원되지 않으면 `dooray config set auth-mode api-key` 로 API 키 방식으로 바꿔요.

**macOS 에서 키체인 오류가 나요.**
키체인이 잠겨 있거나 접근이 거부된 경우예요. SSH 같은 원격 세션에서 자주 생겨요.

1. `security unlock-keychain` 으로 잠금을 풀어요.
2. 같은 명령을 다시 실행해요.
3. 그래도 안 되면 키체인 접근 앱에서 `dooray-cli` 항목을 지우고 `dooray setup` 을 다시 실행해요.

`dooray setup` 은 시작할 때 기존 설정을 키체인에서 읽지 못하면 질문 전에 끝나요.
이때는 스킬 설치 단계도 건너뛰니 `dooray skill install` 로 따로 설치해요.

**에이전트가 새 명령을 몰라요.**
`dooray skill update` 를 실행해요.

## 자세히

사용에는 필요하지 않지만 동작을 정확히 알고 싶을 때 보는 내용이에요.

### 비밀값 저장 위치

macOS 에서는 API 토큰(`api-key`), IMAP 비밀번호(`imap-password`), SESSION 쿠키(`session-cookie`)를 설정 파일이 아니라 로그인 키체인에 저장해요.
키체인 접근 앱에서 이름이 `dooray-cli` 인 항목으로 보여요.
설정 파일과 그 백업·동기화 사본에 토큰이 남지 않게 하려는 거예요.
같은 사용자로 실행한 프로그램은 `security` 명령으로 확인 창 없이 이 항목을 읽을 수 있어요.

설정 파일 `~/.dooray/config.json` 은 소유자만 읽을 수 있는 권한(0600)으로 저장해요.
macOS 가 아닌 OS 는 비밀값도 이 파일에 저장해요.

macOS 에서 새로 지정하는 비밀값(`api-key`, `imap-password`, `session-cookie`)에는 영문·숫자·기호와 공백만 써요.
줄바꿈, 탭, 한글이 있으면 저장하지 않고 종료 코드 3 으로 끝나요.
다른 OS 는 비밀값도 설정 파일에 그대로 저장하므로 이 제한이 없어요.

계정 이름, 읽기 우선순위, 옮기는 시점, 실패했을 때 되돌리는 규칙은 [데이터 스키마](../data-schema.md)의 「비밀 필드의 저장 위치」 가 정해요.

설정 파일 하나를 macOS 와 다른 OS 에서 동기화해 함께 쓰면 안 돼요.

- 다른 OS 에서 넣은 토큰이 macOS 에서 저장할 때 키체인으로 옮겨져요.
- 그러면 다른 OS 쪽이 설정 미완료가 돼요.
- 이렇게 쓰려면 설정 파일을 동기화 대상에서 빼고 OS 마다 따로 설정해요.

### 캐시를 비우는 때

프로젝트와 멤버 같은 조회 결과는 캐시에 저장해요.
캐시는 계정과 접속 환경별로 나뉘지 않아서, 비우지 않으면 이전 계정의 프로젝트와 멤버가 남아 잘못 매칭돼요.
그래서 아래 경우에 캐시를 함께 비우고 그 사실을 알려요.

- `api-key`, `base-url`, `auth-mode`, `session-cookie` 를 바꿀 때
- 웹 방식에서 `tenant-name` 을 바꿀 때

같은 값을 다시 설정하는 경우와 최초 설정에서는 비우지 않아요.
캐시 구조와 TTL 은 [데이터 스키마](../data-schema.md)에 있어요.

### 설정 파일 보안 경고

설정을 읽는 명령은 아래 경우에 stderr 로 경고해요.

- macOS 에서 설정 파일에 키체인으로 옮길 수 있는 평문 비밀값이 남아 있을 때
- macOS·Linux 에서 비밀값이 든 파일의 권한이 넓을 때

읽기만으로 파일이나 키체인을 고치지는 않아요.
경고에 나온 명령을 그대로 실행하면 현재 실행 기록 설정을 유지한 채 다시 저장해요.
macOS 에서는 비밀값을 키체인으로 옮기고, 모든 OS 에서 파일 권한을 0600 으로 맞춰요.

예를 들어 실행 기록이 꺼져 있다면 이렇게 돼요.

```bash
dooray config set track-last-run false
```

실행 기록이 켜져 있다면 `false` 대신 `true` 를 써요.
키체인에 넣을 수 없는 구버전 값과 암호화 저장소를 지원하지 않는 OS 의 평문 저장은 `dooray doctor` 에서만 경고로 보여요.
파일 권한 경고는 이 경우에도 나와요.

### doctor 의 JSON 출력

`dooray doctor --json` 은 기존 설정·연결·스킬 정보와 함께 `checks` 배열을 담아요.
각 항목에는 아래 값이 들어 있어요.

- `id`
- `status`: `pass`, `warn`, `fail` 중 하나
- `message`
- `fix`: 고칠 방법이 있을 때만

`doctor` 는 설정, API 연결, 설정 파일 보안 중 실패 항목이 있으면 종료 코드 1 로 끝나요.

### 웹 방식 위키 쓰기의 호출 횟수

위키에서 같은 제목을 막는 확인 때문에 쓰기 하나마다 호출이 늘어요.

| 작업 | 호출 횟수 | 호출 내용 |
| --- | --- | --- |
| 페이지 생성 | 2번 | 형제 목록, 저장된 제목 확인 |
| 제목만 고치는 수정 | 1~2번 | 페이지 상세, 제목이 바뀔 때 형제 목록 |
| 제목과 본문을 함께 고치는 수정 | 2~3번 | 페이지 상세, 제목이 바뀔 때 형제 목록, 저장된 제목 확인 |

### 웹 방식 쿠키 입력의 세부 규칙

- `dooray config set session-cookie -` 는 값만, `SESSION=값`, `Cookie: a=1; SESSION=값; b=2` 를 모두 받아서 SESSION 값만 저장해요.
- 쿠키를 위치 인자로 넘기면 셸 기록과 프로세스 목록에 남을 수 있어요.
- `dooray config get session-cookie` 는 값 대신 설정됨·미설정만 보여 줘요. API 방식에서도 저장해 둔 쿠키를 확인할 수 있어요.
- 일반 조회에서는 쿠키 키체인을 추가로 읽지 않아요.
- 비공식 API 경고는 `config set auth-mode web` 과 setup 에서 웹을 고를 때 한 번 나와요. 일반 조회에는 나오지 않아요.
