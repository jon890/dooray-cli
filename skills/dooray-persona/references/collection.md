# 대상 탐색과 원문 수집

이 문서는 1단계 대상 탐색과 2단계 원문 수집을 다룬다.
스크립트는 `~/.dooray/config.json`의 Dooray 인증 정보를 읽지만 수정하지 않는다.

## 대상 탐색

설정의 `targets`가 비어 있을 때만 다음 명령을 실행한다.

```bash
node ~/.claude/skills/dooray-persona/scripts/discover-targets.mjs
```

별도 설정과 작업 디렉터리를 쓰는 예시는 다음과 같다.

```bash
node ~/.claude/skills/dooray-persona/scripts/discover-targets.mjs \
  --config ./dooray-persona.config.json \
  --out ./persona-work
```

빠른 시험이 필요하면 `--max-pages <양의 정수>`로 프로젝트별 조회 페이지 수를 제한할 수 있다.
이때 집계는 전체 결과가 아니므로 최종 대상 선정 전에는 제한 없이 다시 실행한다.

결과는 표준 출력과 작업 디렉터리의 `candidates.json`에 기록된다.
`projects` 배열을 관련 글 수가 많은 순서로 다음처럼 보여준다.

| 선택 | 프로젝트 | 이름 | 작성 | 개인 담당 | 그룹 담당 | 참조 | 관련 합계 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | `my-project` | 예시 프로젝트 | 12 | 4 | 30 | 8 | 42 |

사용자에게 포함할 행을 고르게 한다.
관련 합계만으로 자동 선택하지 말고, 업무 성격과 개인 문체가 드러나는지 함께 확인한다.

## 선택 결과 저장

선택한 행의 `projectId`, `code`, `name`을 기본 설정 파일 `~/.claude/dooray-persona.config.json`의 `targets`에 저장한다.
설정 예시는 다음과 같다.

```json
{
  "version": 1,
  "targets": [
    {
      "projectId": "<projectId>",
      "code": "my-project",
      "name": "예시 프로젝트"
    }
  ],
  "outputPath": "~/.claude/dooray-persona.md",
  "workDir": "~/.local/share/dooray-persona",
  "since": null,
  "sessionScan": {
    "enabled": true,
    "roots": ["~/.claude/projects"]
  }
}
```

`projectId`는 `candidates.json`의 값을 그대로 쓴다.
설정에 대상이 이미 있으면 이 탐색과 선택 절차를 건너뛴다.
대상 구성이 달라졌을 때만 다시 탐색한다.

## 원문 수집

대상을 저장한 뒤 다음 명령을 실행한다.

```bash
node ~/.claude/skills/dooray-persona/scripts/collect.mjs
```

별도 경로를 쓰면 대상 탐색 때와 같은 `--config`와 `--out`을 전달한다.
결과는 작업 디렉터리의 `corpus.jsonl`에 저장된다.

기존 `corpus.jsonl`이 있으면 스크립트는 원문을 보존하고 종료한다.
대상, 수집 시작일, Dooray 원문이 바뀌어 다시 모아야 할 때만 `--refresh`를 붙인다.

```bash
node ~/.claude/skills/dooray-persona/scripts/collect.mjs --refresh
```

단순히 분류 기준이나 문체 문서를 다시 다듬는 경우에는 재수집하지 않는다.
보존된 원문으로 분류 이후 단계만 다시 실행한다.

## 재발견 비용이 큰 API 함정

### 팀 그룹 담당을 포함한다

담당자가 개인이 아니라 팀 그룹으로 걸린 업무도 본인 관련 업무로 수집해야 한다.
이를 놓치면 대외 회신 표본이 통째로 사라질 수 있다.
실측한 한 프로젝트에서는 개인 담당이 1건이었지만 그룹 담당까지 포함하면 254건이었다.

### 모든 호출이 속도 제어를 공유한다

초당 5회를 넘기면 명시적인 오류가 아니라 빈 결과가 올 수 있다.
실패가 성공처럼 보이므로 수집 결과가 조용히 비게 된다.
프로젝트 목록, 업무 목록, 상세, 댓글 호출이 하나의 공유 속도 제어를 사용해야 한다.

### 목록에서 후보를 먼저 좁힌다

업무 목록 응답에는 본문이 없다.
대신 작성자와 담당자 정보는 있으므로 본인 작성, 개인 담당, 그룹 담당, 참조 여부로 후보를 로컬에서 먼저 좁힌다.
그 후보에만 업무 상세와 댓글 API를 호출해 속도 제한 안에서 필요한 원문을 모은다.
