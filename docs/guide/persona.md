# Dooray 문체 페르소나

`dooray-persona` 스킬은 Dooray 에 쌓인 내 업무 글과 댓글을 모아서 개인 업무 문체 문서를 만들어요.
완성한 문서를 AI 에이전트의 규칙으로 연결하면 업무와 댓글 초안을 내 문체로 쓸 수 있어요.

1. [시작하기 전에](#시작하기-전에)
2. [스킬 설치하기](#스킬-설치하기)
3. [처음 실행하기](#처음-실행하기)
4. [웹 방식으로 쓸 때](#웹-방식으로-쓸-때)
5. [스킬 업데이트하기](#스킬-업데이트하기)
6. [터미널에 익숙하지 않은 동료에게 넘기기](#터미널에-익숙하지-않은-동료에게-넘기기)

## 시작하기 전에

- `dooray` CLI 가 설치돼 있고 `dooray setup` 이 끝나 있어야 해요. [설치와 설정](setup.md)을 먼저 따라 해요.
- CLI 는 `member get me` 가 들어간 버전이어야 해요. 스크립트가 이 명령을 써요.
- 이 스킬은 `dooray skill install` 로 설치되지 않아요. 사용자 글을 로컬에서 분석하는 별도 워크플로우라서 직접 설치해요.

## 스킬 설치하기

1. 저장소를 내려받아요.

   ```bash
   git clone https://github.com/jon890/dooray-cli.git
   cd dooray-cli
   ```

2. 스킬 폴더를 `~/.claude/skills/` 아래에 연결해요. 링크와 복사 중 하나를 골라요.

   링크로 연결하면 저장소를 업데이트할 때 스킬도 함께 바뀌어요.

   ```bash
   mkdir -p ~/.claude/skills
   ln -s "$PWD/skills/dooray-persona" ~/.claude/skills/dooray-persona
   ```

   복사하면 저장소와 따로 써요.

   ```bash
   mkdir -p ~/.claude/skills
   cp -R skills/dooray-persona ~/.claude/skills/
   ```

3. `~/.claude/skills/dooray-persona` 가 생겼는지 확인해요.

## 처음 실행하기

Claude Code 에서 "내 업무 글 문체 분석해 줘", "문체 페르소나 만들어 줘" 같은 말로 시키면 `dooray-persona` 스킬이 실행돼요.

- 설정 파일은 `~/.claude/dooray-persona.config.json` 이에요.
- 처음에는 후보 프로젝트를 탐색해서 대상을 고르고, 내 글을 수집해요.
- 스크립트는 인증 정보를 직접 읽지 않고 `dooray ... --json` 명령을 실행해요. 그래서 토큰이나 쿠키를 따로 입력하지 않아요.

## 웹 방식으로 쓸 때

인증 방식(API 키 또는 웹 로그인 세션)은 CLI 의 `auth-mode` 설정을 따라요.

- 웹 방식에서는 수집에 쓰는 `project list`, `member get me`, `post list`, `post get`, `post comment list` 를 웹이 지원해야 동작해요. 스크립트가 쓰는 명령 가운데 지원하지 않는 것은 없어요.
- 지원하지 않는 명령이 생기면 CLI 가 종료 코드 3 과 안내로 멈춰요.
- 지원 범위는 [설치와 설정](setup.md#웹-방식의-지원-범위)에서 확인해요.

## 스킬 업데이트하기

이 스킬은 CLI 와 함께 업데이트되지 않아요. 설치한 방식에 따라 직접 업데이트해요.

| 설치 방식 | 업데이트 방법 |
| --- | --- |
| 링크 | 내려받은 저장소에서 `git pull` |
| 복사 | 스킬 폴더를 다시 복사 |

## 터미널에 익숙하지 않은 동료에게 넘기기

`skills/dooray-persona/references/bootstrap.md` 에 붙여넣기용 프롬프트가 있어요.
그 블록을 복사해 전달하면 받는 사람은 Claude Code 에 한 번 붙여넣는 것으로 아래를 모두 진행해요.

- CLI 설치
- 인증 설정
- 스킬 연결
- 수집
- 문서 생성
- 주입

받는 사람이 직접 해야 하는 것은 Claude Code 설치와 Dooray 개인 인증 토큰 발급이에요.
토큰 발급은 웹 로그인이 필요해서 자동화할 수 없어요. 프롬프트가 발급 화면 주소까지만 안내해요.

Claude 데스크톱 앱은 사용자 컴퓨터의 파일과 명령을 기본 상태로 다루지 못해요.
문서는 Claude Code 에서 만들고, 완성한 문서를 데스크톱 앱의 프로젝트 지식이나 스타일 설정에 붙여넣어서 써요.
