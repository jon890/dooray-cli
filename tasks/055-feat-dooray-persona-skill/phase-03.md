# Phase 03 — 분류·세션 대조·통계 스크립트와 단위 테스트

**Execution profile**: standard

---

## 목표

모은 표본에서 **본인이 직접 쓴 글만** 남기고, 문체 추출을 뒷받침할 빈도 통계를 낸다.

- `classify.mjs` — 구조 신호로 `human` / `ai-suspect` / `formal-template` 3분류
- `scan-sessions.mjs` — 세션 로그가 있으면 AI 가 등록한 글을 확정 제외 (선택 기능)
- `stats.mjs` — 남은 표본의 기호·종결어미·문장 길이 빈도

**범위 외**: 문체 규칙을 실제로 뽑아 문서를 쓰는 일은 스크립트가 아니라 모델이 한다. 그 절차는 phase 04 의 `references/authoring.md` 가 맡는다.

---

## 전제

phase 02 가 만든 `corpus.jsonl` 형식을 입력으로 받는다.
필드는 `docs/data-schema.md` 의 `CorpusEntry` 가 단일 소스다.

---

## 배경 — 3분류가 필요한 이유

구조 신호만으로 AI 작성분을 판정하면 틀린다.
헤더와 표가 많다는 이유로 AI 로 분류한 58건을 다시 봤더니, 상당수가 사람이 쓴 **정형 양식**이었다. 패치노트와 배포 기록이 그렇다.

정형 양식은 문체가 아니라 서식이다. 페르소나 표본에서는 빼야 하지만 "AI 가 썼다" 로 세면 안 된다.
집계가 오염되면 "내 글의 몇 할이 AI 였나" 라는 판단 자체가 틀어진다.

그래서 라벨을 셋으로 나누고, 애매한 것은 사용자에게 보여 확인받는다.

---

## 작업 항목 (3)

### 1. `skills/dooray-persona/scripts/classify.mjs` 와 `lib/signals.mjs` — 신규

판정 로직은 순수 함수로 `lib/signals.mjs` 에 두고, 스크립트는 파일 입출력만 맡는다. 테스트가 순수 함수만 부르게 하려는 것이다.

`lib/signals.mjs` 가 내보낼 것은 둘이다.

- `extractSignals(text)` → 신호 값 객체
- `labelEntry(entry, signals, corpusContext)` → `{ label, needsReview, reasons }`

`extractSignals` 가 세는 신호는 다음과 같다. 값은 개수이며 정규화하지 않는다.

| 신호 | 뜻 |
| --- | --- |
| `headings` | `#` 로 시작하는 줄 수 |
| `tableRows` | `|` 로 시작하고 끝나는 줄 수 |
| `boldRuns` | `**...**` 등장 횟수 |
| `bullets` | `-` 또는 `*` 로 시작하는 줄 수 |
| `emoji` | 이모지 문자 수 |
| `closingSections` | `결론`·`정리`·`요약`·`다음 단계` 를 제목처럼 쓴 줄 수 |
| `chars` | 전체 글자 수 |

`labelEntry` 판정 순서를 지킨다. 순서가 결과를 바꾼다.

1. **정형 양식 먼저 본다.** 같은 `corpusContext` 안에서 제목이 같은 꼴로 3건 이상 반복되거나, 제목·본문에 배포·릴리스·패치노트 성격의 정형 지표가 있으면 `formal-template` 이다
2. 그다음 AI 의심을 본다. 헤더·표·굵은 글씨·마무리 섹션 신호가 함께 높으면 `ai-suspect` 다
3. 둘 다 아니면 `human` 이다

`needsReview` 는 판정이 갈린 경우에 참이다. `ai-suspect` 로 잡혔는데 정형 양식 지표가 하나라도 있으면 반드시 참으로 둔다.
이 표시가 사용자 확인 단계의 입력이 된다.

임계값을 코드에 상수로 박되, 값의 근거를 주석에 남긴다.
근거를 못 대는 숫자는 넣지 말고 신호를 그대로 내보내 사용자가 판단하게 한다.

스크립트 `classify.mjs` 는 `corpus.jsonl` 을 읽어 `classified.jsonl` 을 쓴다.
한 줄 형식은 `docs/data-schema.md` 의 `ClassifiedEntry` 다. `confirmed` 는 이 단계에서 전부 거짓으로 둔다.

`--report` 를 주면 stdout 에 요약 JSON 을 낸다 — 라벨별 건수와 `needsReview` 항목의 `id`·제목·상위 신호. 이것이 사용자 확인 화면의 재료다.

### 2. `skills/dooray-persona/scripts/scan-sessions.mjs` — 신규

Claude Code 는 댓글 등록에 성공하면 세션 로그에 그 사실을 남긴다.
그 기록을 대조하면 AI 가 등록한 글을 추측이 아니라 확정으로 제외할 수 있다.

- 설정의 `sessionScan.roots[]` (기본 `~/.claude/projects`) 아래 `*.jsonl` 을 훑는다
- `댓글이 추가되었습니다: <id>` 패턴에서 `<id>` 를 모은다. 이 문자열은 `src/commands/post/comment/add.ts` 의 성공 출력과 같아야 한다
- `classified.jsonl` 에서 `id` 의 `log-` 부분이 이 집합에 있으면 라벨을 `ai-confirmed` 로 덮어쓰고 `confirmed` 를 참으로 둔다

경로가 없거나 파일을 하나도 못 찾으면 **조용히 건너뛴다.** stderr 에 건너뛴 사실만 남기고 종료 코드는 0 이다.
다른 하네스를 쓰는 사용자에게는 이 파일이 아예 없고, 있어도 보관 기간이 짧다. 없는 것이 정상이므로 실패로 취급하면 안 된다.

### 3. `skills/dooray-persona/scripts/stats.mjs` 와 테스트 — 신규

`classified.jsonl` 에서 `label === "human"` 인 표본만 골라 빈도를 낸다.
`assigneeKind` 별로 나눠 집계한다 — 수신자 축이 실제로 존재하는지를 사용자가 숫자로 확인해야 하기 때문이다.

집계 항목은 다음과 같다.

- 기호 빈도 — `=>`, `->`, 취소선, 물결, 느낌표, `ㅠ`
- 문장 종결 형태 빈도 — 명사구로 끝난 줄과 동사로 끝난 줄의 비율
- 문장 길이 분포 — 중앙값과 사분위
- 인사말·멘션으로 시작하는 글의 비율

집계 로직도 순수 함수로 분리해 `lib/stats.mjs` 에 두고, 스크립트는 입출력만 맡는다.

테스트 `lib/signals.test.mjs` 와 `lib/stats.test.mjs` 를 만든다. 최소한 다음을 덮는다.

- 헤더와 표가 많은 배포 기록형 글이 `ai-suspect` 가 아니라 `formal-template` 으로 분류된다
- 헤더·표·마무리 섹션이 모두 높은 글이 `ai-suspect` 로 분류되고, 정형 지표가 섞이면 `needsReview` 가 참이다
- 짧은 항목 나열 글이 `human` 으로 남는다
- 통계 함수가 `assigneeKind` 별로 결과를 갈라 낸다

---

## Critical Files

| 파일 | 변경 |
| --- | --- |
| `skills/dooray-persona/scripts/lib/signals.mjs` | 신규 |
| `skills/dooray-persona/scripts/lib/signals.test.mjs` | 신규 |
| `skills/dooray-persona/scripts/lib/stats.mjs` | 신규 |
| `skills/dooray-persona/scripts/lib/stats.test.mjs` | 신규 |
| `skills/dooray-persona/scripts/classify.mjs` | 신규 |
| `skills/dooray-persona/scripts/scan-sessions.mjs` | 신규 |
| `skills/dooray-persona/scripts/stats.mjs` | 신규 |

## 검증

```bash
# cwd: <repo root>
pnpm test -- skills/dooray-persona
for f in skills/dooray-persona/scripts/*.mjs skills/dooray-persona/scripts/lib/*.mjs; do node --check "$f"; done
```

세션 로그가 없는 환경에서 조용히 건너뛰는지 확인한다.

```bash
# cwd: <repo root>
node skills/dooray-persona/scripts/scan-sessions.mjs --config /nonexistent/persona.json; echo "exit=$?"
```

- 종료 코드가 0 이다.
- stderr 에 건너뛴다는 안내가 있다.

## 의도 메모 (왜)

- 판정을 순수 함수로 떼는 이유는, 실제 Dooray 응답 없이 분류 규칙을 테스트로 고정하기 위해서다. 이 규칙이 틀리면 표본 전체가 오염되는데 오염은 눈에 잘 안 띈다.
- 정형 양식을 AI 와 분리한 이유는 위 배경에 적은 실측 오판 때문이다. 라벨 하나로 합치면 같은 실수가 재발한다.
- 세션 대조를 실패가 아닌 건너뛰기로 둔 이유는, 이 스킬이 Claude Code 전용이 아니어야 하기 때문이다.
