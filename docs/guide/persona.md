# Dooray 문체 페르소나

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

## 터미널에 익숙하지 않은 동료에게 넘기기

`skills/dooray-persona/references/bootstrap.md`에 붙여넣기용 프롬프트가 있다.
그 블록을 복사해 전달하면 받는 사람은 Claude Code에 한 번 붙여넣는 것으로 CLI 설치, 인증 설정, 스킬 연결, 수집, 문서 생성, 주입까지 진행한다.

받는 사람이 직접 해야 하는 것은 둘이다. Claude Code 설치와 Dooray 개인 인증 토큰 발급이다.
토큰 발급은 웹 로그인이 필요해 자동화할 수 없고, 프롬프트가 발급 화면 주소까지만 안내한다.

Claude 데스크톱 앱은 사용자 컴퓨터의 파일과 명령을 기본 상태로 다루지 못한다.
문서는 Claude Code에서 만들고, 완성한 문서를 데스크톱 앱의 프로젝트 지식이나 스타일 설정에 붙여넣어 쓴다.
