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
| `docs/flow.md` | 사용자 흐름에 스레드 예시 | 486행부터가 messenger 절이다 |
| `README.md` | 사용 예 | messenger 절을 찾아 잇는다 |
| `skills/dooray-cli/SKILL.md` | 빠른 참조 표와 자동화 시나리오 | 225행부터가 messenger 행이다 |

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

### 1. `docs/code-architecture.md` 의 messenger 트리를 늘린다

112행부터의 `messenger/` 절에 파일 셋을 더한다.

- `thread-send.ts` — 스레드 생성. `--log` 유무로 두 endpoint 를 가른다
- `thread-options.ts` — 옵션 조합 판정
- `thread-options.test.ts` 는 적지 않는다. 이 트리가 테스트 파일을 나열하지 않는다

같은 절의 기존 항목이 쓰는 형식을 따른다. endpoint 와 ADR 역참조를 담는 형태다.

### 2. `docs/prd.md` 의 messenger 줄을 고친다

53행이다. 지금 `send` 와 `channel-send` 둘을 적는다.
스레드 생성을 그 줄에 더하고 ADR 역참조에 `ADR-052` 를 넣는다.

### 3. `docs/flow.md` 의 messenger 절에 스레드 흐름을 넣는다

486행부터다. 기존 예시가 명령줄을 나열하는 형식이다. 그 형식을 따른다.

담을 것은 셋이다.

- 대화방에 스레드를 열면서 메시지를 보내는 것
- 이미 있는 메시지에 스레드를 여는 것
- 연 스레드에 메시지를 잇는 것

세 번째가 `channel-send` 를 쓰는 것이라는 점이 드러나야 한다.

### 4. `README.md` 에 사용 예를 넣는다

messenger 를 다루는 절을 찾아 잇는다.

스레드를 열고 그 값으로 메시지를 잇는 두 줄을 담는다.
`--quiet` 가 스레드 채널 id 를 낸다는 것이 예시에서 보여야 한다.

`--log` 로 기존 메시지에 스레드를 여는 것도 한 줄 넣는다.

**`ADR-052` 를 쓰지 않는다.** 왜 그렇게 설계했는지도 적지 않는다.

### 5. `skills/dooray-cli/SKILL.md` 를 고친다

두 곳이다.

- **빠른 참조 표** — 225행부터의 messenger 행 아래에 스레드 행을 더한다.
  기존 두 행이 쓰는 형식을 따른다. 명령과 짧은 설명이다
- **자동화 시나리오** — 스레드를 쓰는 시나리오를 담는다.
  대화방에 진행 상황을 여러 번 보고할 때 본문 대신 스레드에 쌓는 형태다.
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
grep -c "ADR-052" docs/code-architecture.md              # >= 1
grep -c "thread-send" docs/prd.md                        # >= 1
grep -c "thread-send" docs/flow.md                       # >= 1
grep -c "thread-send" README.md                          # >= 1
grep -c "thread-send" skills/dooray-cli/SKILL.md         # >= 1
```

일곱이 모두 맞아야 한다.

**스레드에 메시지를 잇는 방법이 적혔는지 본다.** 이 phase 의 핵심이다.

```bash
# cwd: <repo root>
grep -c "channel-send" docs/flow.md                      # >= 3
grep -c "channel-send" README.md                         # >= 2
```

기존에 있던 `channel-send` 예시에 스레드로 잇는 예시가 더해져 수가 늘어야 한다.
실행 전에 현재 수를 세어 두고 늘었는지 확인한다.

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
| `docs/code-architecture.md` | 수정 — messenger 트리에 파일 둘 |
| `docs/prd.md` | 수정 — MVP 범위 줄 |
| `docs/flow.md` | 수정 — 사용자 흐름 예시 |
| `README.md` | 수정 — 사용 예 |
| `skills/dooray-cli/SKILL.md` | 수정 — 빠른 참조 표와 자동화 시나리오 |
