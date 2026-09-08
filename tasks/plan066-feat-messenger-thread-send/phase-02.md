# Phase 02. 스레드 명령을 문서에 반영한다

**Execution profile**: standard

## 목표

phase 01 이 만든 `messenger thread-send` 를 문서 다섯에 반영한다.
스레드에 메시지를 잇는 방법도 함께 적는다. 그 경로가 새 명령이 아니라 기존 명령이라 적지 않으면 알 수 없다.

**범위 외**: `src/` 를 고치지 않는다. 이 phase 는 문서만 다룬다.
`CLAUDE.md` 는 손대지 않는다. 명령별 스펙을 그 파일에 쌓지 않는 것이 이 저장소 규약이다.

## 컨텍스트

**근거 문서**: `docs/adr/052-messenger-thread-send.md`.

`.claude/planning-overlay.md` 의 「변경 유형별 docs 영향 표」 가 손댈 곳을 정한다.
이 변경은 「신규 CLI 명령 (소)」 와 「신규 ADR 동반 변경」 두 행에 걸린다.

| 문서 | 담을 것 | 지금 상태 |
| --- | --- | --- |
| `docs/code-architecture.md` | `src/commands/messenger/` 트리에 새 파일 셋 | 112행부터가 그 절이다 |
| `docs/prd.md` | MVP 범위 한 줄에 스레드 추가 | 53행이 messenger 줄이다 |
| `docs/flow.md` | 사용자 흐름에 스레드 예시 | 480행의 `## 메신저 흐름` 이 그 절이다 |
| `README.md` | 사용 예 | messenger 절이 없다. 새로 만든다 |
| `skills/dooray-cli/SKILL.md` | 빠른 참조 표와 시나리오 예시 | 221행의 `## 메신저` 절이다 |

**`README.md` 와 `skills/dooray-cli/SKILL.md` 의 현재 상태를 실측했다.**

- `README.md` 에 messenger 를 다루는 절이 없다. 10행의 소개 문장 하나뿐이고 `channel-send` 는 0 건이다
- `skills/dooray-cli/SKILL.md` 에 「자동화 시나리오」 라는 절이 없다.
  `## 메신저` 절의 빠른 참조 표 하나뿐이다

**공개 문서에는 내부 추적 번호를 넣지 않는다.**
`README.md` 와 `skills/dooray-cli/SKILL.md` 가 그 대상이다. `ADR-052` 를 그 둘에 쓰지 않는다.
규칙은 `CLAUDE.md` 의 「공개 문서의 내부 참조 번호 제외」 절이 소유하고, 검사는 `scripts/check-public-refs.mjs` 가 소유한다.

## 의도 메모

- **스레드에 메시지를 잇는 방법을 반드시 적는다.** 그 동작에 새 명령이 없어서,
  적지 않으면 사용자가 방법이 없다고 판단한다. `channel-send` 에 스레드 채널 id 를 주면 된다.
- `--quiet` 가 `channelId` 를 내는 것은 다른 messenger 명령과 다르다.
  사용 예를 그 차이가 드러나는 형태로 쓴다. 스레드를 열고 그 값으로 이어 붙이는 두 줄이면 충분하다.
- 공개 문서에는 왜 그렇게 설계했는지를 적지 않는다. 무엇을 어떻게 하는지만 적는다.

## 작업 항목

### 1. `docs/code-architecture.md` 의 트리 둘을 늘린다

phase 01 이 만드는 파일은 `src/commands/messenger/` 와 `src/api/` 두 곳에 걸친다.
트리도 두 곳을 고친다.

112행부터의 `messenger/` 절에 둘을 더한다.

- `thread-send.ts` — 스레드 생성. `--log` 유무로 두 endpoint 를 가른다
- `thread-options.ts` — 옵션 조합 판정

26행부터의 `api/` 절에 하나를 더한다.

- `messenger-thread-request.ts` — 스레드 endpoint 경로와 요청 body 를 만드는 순수 함수

테스트 파일은 적지 않는다. 이 트리가 테스트 파일을 나열하지 않는다.

같은 절의 기존 항목이 쓰는 형식을 따른다. endpoint 와 ADR 역참조를 담는 형태다.

### 2. `docs/prd.md` 의 messenger 줄을 고친다

53행이다. 지금 `send` 와 `channel-send` 둘을 적는다.
스레드 생성을 그 줄에 더하고 ADR 역참조에 `ADR-052` 를 넣는다.

### 3. `docs/flow.md` 의 messenger 절에 스레드 흐름을 넣는다

480행의 `## 메신저 흐름` 절이다. 기존 예시가 명령줄을 나열하는 형식이다. 그 형식을 따른다.

담을 것은 셋이다.

- 대화방에 스레드를 열면서 메시지를 보내는 것
- 이미 있는 메시지에 스레드를 여는 것
- 연 스레드에 메시지를 잇는 것

세 번째가 `channel-send` 를 쓰는 것이라는 점이 드러나야 한다.

### 4. `README.md` 에 메신저 절을 새로 만든다

`## 에이전트 없이 직접 쓰기` 아래의 `###` 절들과 같은 층에 둔다.
`### 프로젝트 태그 만들기` 다음, `## 프로젝트 구조` 앞이 그 자리다.
제목은 `### 메신저로 알리기` 로 한다.

1:1 다이렉트 메시지와 대화방 메시지도 함께 적는다. 지금 README 에 그 둘이 없다.

스레드를 열고 그 값으로 메시지를 잇는 두 줄을 담는다.
`--quiet` 가 스레드 채널 id 를 낸다는 것이 예시에서 보여야 한다.

`--log` 로 기존 메시지에 스레드를 여는 것도 한 줄 넣는다.

**`ADR-052` 를 쓰지 않는다.** 왜 그렇게 설계했는지도 적지 않는다.

### 5. `skills/dooray-cli/SKILL.md` 를 고친다

두 곳이다.

- **빠른 참조 표** — 226행의 대화방 메시지 행 아래에 스레드 행을 더한다.
  기존 두 행이 쓰는 형식을 따른다. 명령과 짧은 설명이다
- **시나리오 예시** — 표 아래에 코드블록 하나를 둔다. 절을 새로 만들지 않는다.
  「자동화 시나리오」 라는 절이 이 파일에 없고, `## 메신저` 절이 이미 그 주제를 담는다.
  대화방에 진행 상황을 여러 번 보고할 때 본문 대신 스레드에 쌓는 형태를 적는다.
  스레드를 열고 그 채널 id 를 받아 이어 붙이는 흐름이 드러나야 한다

**`ADR-052` 를 쓰지 않는다.**

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm run build
pnpm test
```

셋 다 통과해야 한다. 이 phase 는 `src/` 를 고치지 않으므로 회귀가 없어야 한다.

문서에 실제로 들어갔는지 본다.

```bash
# cwd: <repo root>
grep -c "thread-send" docs/code-architecture.md          # >= 1
grep -c "thread-options" docs/code-architecture.md       # >= 1
grep -c "messenger-thread-request" docs/code-architecture.md  # >= 1
grep -c "ADR-052" docs/code-architecture.md              # >= 1
grep -c "thread-send" docs/prd.md                        # >= 1
grep -c "thread-send" docs/flow.md                       # >= 1
grep -c "thread-send" README.md                          # >= 1
grep -c "thread-send" skills/dooray-cli/SKILL.md         # >= 1
```

여덟이 모두 맞아야 한다.

**스레드에 메시지를 잇는 방법이 적혔는지 본다.** 이 phase 의 핵심이다.

```bash
# cwd: <repo root>
grep -c "channel-send" docs/flow.md                      # >= 3
grep -c "channel-send" README.md                         # >= 2
```

착수 전 실측값은 `docs/flow.md` 가 2 이고 `README.md` 가 0 이다.
`docs/flow.md` 는 스레드에 잇는 예시가 더해져 3 이상이 된다.
`README.md` 는 절을 새로 만들면서 대화방 메시지와 스레드에 잇는 예시 둘이 들어가 2 이상이 된다.

**공개 문서에 내부 참조가 들어가지 않았는지 본다.**

```bash
# cwd: <repo root>
node scripts/check-public-refs.mjs
```

종료 코드 0 이어야 한다.

문서 검사와 개인 식별 정보 검사를 통과시킨다.

```bash
# cwd: <repo root>
~/.claude/skills/korean-check/scripts/check.sh docs/code-architecture.md docs/prd.md docs/flow.md README.md skills/dooray-cli/SKILL.md
node scripts/check-pii.mjs
```

둘 다 종료 코드 0 이어야 한다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `docs/code-architecture.md` | 수정 — messenger 트리에 둘, api 트리에 하나 |
| `docs/prd.md` | 수정 — MVP 범위 줄 |
| `docs/flow.md` | 수정 — 사용자 흐름 예시 |
| `README.md` | 수정 — 메신저 절 신설 |
| `skills/dooray-cli/SKILL.md` | 수정 — 빠른 참조 표와 시나리오 예시 |
