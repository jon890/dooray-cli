---
name: dooray-persona
description: >-
  Dooray에 쌓인 본인 업무 글과 댓글을 모아 업무 글 문체 페르소나 문서를 만든다.
  "문체 페르소나", "내 글투 추출", "AI 티 안 나게", "업무 글 문체 분석"이나
  "writing persona", "extract my writing style", "make it sound like me",
  "sounds like me", "match my Dooray tone", "analyze my workplace writing style" 같은 요청에 사용한다.
  업무·댓글 단건 조회·등록·수정은 dooray-cli 스킬이 맡으며,
  "업무 목록 보여줘" 같은 단순 조회에는 이 스킬을 사용하지 않는다.
---

# dooray-persona

Dooray에 축적된 본인 글에서 개인 문체를 추출하고, 계속 재사용할 수 있는 규칙 문서를 만든다.
이 파일은 라우터이므로 현재 단계에 필요한 reference만 읽는다.

## 어느 reference를 읽을지

| 하려는 일 | 먼저 읽을 문서 |
| --- | --- |
| 대상 프로젝트 탐색, 설정 저장, 최초·갱신 수집 | [collection.md](references/collection.md) |
| AI 작성분과 정형 양식 분리, 경계 항목 확인 | [classification.md](references/classification.md) |
| 문체 추출, 페르소나 작성, 하네스 주입과 Dooray 연동 | [authoring.md](references/authoring.md) |
| 최종 문서 골격 확인 | [persona.md](templates/persona.md) |
| 터미널에 익숙하지 않은 사람에게 이 워크플로우 넘기기 | [bootstrap.md](references/bootstrap.md) |

## 6단계 워크플로우

1. **대상 탐색** — 관련 글이 충분한 프로젝트 후보를 집계하고 사용자가 수집 대상을 고른다.
2. **원문 수집** — 선택한 프로젝트에서 본인이 쓴 업무 본문과 댓글을 로컬 작업 디렉터리에 모은다.
3. **작성 주체 분류** — AI 작성 의심분과 정형 양식을 분리하고 경계 항목을 사용자와 확정한다.
4. **문체 추출** — `human` 표본을 직접 읽어 수신자별 모드, 반복 습관, 하지 않는 것을 찾는다.
5. **문서 생성** — 템플릿을 채워 설정의 `outputPath`에 페르소나 문서를 쓴다.
6. **주입과 확인** — 사용하는 하네스가 문서를 매번 읽게 연결하고 짧은 댓글로 자가 점검한다.

최초 설정에서 대상을 고르는 확인과 3단계 경계 항목 확인을 건너뛰지 않는다.
이미 저장된 `targets`는 앞선 대상 확인 결과이므로 그대로 재사용한다.

## 실행 전에 알 것

- 팀 그룹 담당 업무를 제외하면 대외 회신 표본을 크게 놓칠 수 있다.
- API 호출이 초당 5회를 넘으면 오류 대신 빈 결과가 올 수 있으므로 모든 호출이 속도 제어를 공유해야 한다.
- 목록 응답에는 본문이 없으므로 작성자·담당자로 후보를 먼저 좁힌 뒤 상세를 조회한다.
- 헤더와 표가 많다는 이유만으로 AI 작성분으로 확정하지 않는다. 사람이 쓴 정형 배포 기록일 수 있다.

구체적인 실행과 판단 근거는 해당 reference를 따른다.

## 설치와 설정

이 스킬은 `dooray` CLI 설치 명령의 대상이 아니다.
저장소를 내려받은 뒤 `skills/dooray-persona` 디렉터리를 `~/.claude/skills/dooray-persona`로 링크하거나 복사한다.

기본 설정 파일은 `~/.claude/dooray-persona.config.json`이다.
기본 중간 산출물 디렉터리는 `~/.local/share/dooray-persona`, 기본 결과 경로는 `~/.claude/dooray-persona.md`다.
다른 경로를 쓰려면 모든 스크립트에 같은 `--config <path>` 또는 `--out <dir>`를 전달한다.

최초 실행에서는 [collection.md](references/collection.md)에 따라 후보를 탐색하고 사용자가 고른 `targets`를 설정에 저장한 뒤 수집한다.
설정에 `targets`가 이미 있으면 대상 탐색을 건너뛰고 수집부터 시작한다.

터미널 작업에 익숙하지 않은 사람에게 이 워크플로우를 넘길 때는 [bootstrap.md](references/bootstrap.md)의 프롬프트를 전달한다.
설치와 인증 설정, 스킬 연결, 주입까지 한 번에 진행하게 되어 있다.
