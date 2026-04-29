# Phase 2: src/index.ts catch hook + feedback --last 로직

## 컨텍스트

phase 1의 sanitize/store 위에 (1) 에러 발생 시 last-run 기록 hook + (2) `feedback --last` 옵션을 통한 자동 첨부.

### 먼저 읽을 파일

- `src/index.ts` `program.parseAsync().catch((err) => { ... })` (대략 126:) — hook 추가 지점
- `src/commands/feedback.ts` (013) — `--last` 옵션 추가 대상
- `src/utils/feedback-meta.ts` (013) `buildIssueBody` — 본문 조립 헬퍼 (확장 또는 새 헬퍼)
- `src/utils/argv-sanitize.ts`, `src/cache/last-run.ts` (phase 1)
- `src/config/store.ts` (phase 1) — `trackLastRun`

## 작업 목록 (4개)

### 1) `src/index.ts` — catch hook 통합

기존:
```ts
program.parseAsync().catch((err) => {
  if (err instanceof DoorayCliError) {
    process.stderr.write(chalk.red(`오류: ${err.message}`) + "\n");
    process.exit(err.exitCode);
  }
  process.stderr.write(chalk.red(`오류: ${err.message}`) + "\n");
  process.exit(1);
});
```

변경 — 에러 출력 *전*에 last-run 기록 (best-effort, swallow):
```ts
import { sanitizeArgv } from "./utils/argv-sanitize.js";
import { writeLastRun } from "./cache/last-run.js";
import { getConfigOrThrow } from "./config/store.js";

program.parseAsync().catch(async (err) => {
  const errorMessage = err instanceof Error ? err.message : String(err);
  const exitCode = err instanceof DoorayCliError ? err.exitCode : 1;

  // last-run 기록 (best-effort, opt-in, feedback 명령은 제외)
  try {
    const config = await getConfigOrThrow();
    const isFeedbackCommand =
      process.argv.includes("feedback") &&
      process.argv[2] === "feedback";
    if (config.trackLastRun && !isFeedbackCommand) {
      await writeLastRun({
        argv: sanitizeArgv(process.argv.slice(1)),  // node 경로 제외
        exitCode,
        errorMessage,
        timestamp: new Date().toISOString(),
      });
    }
  } catch {
    // last-run 기록 실패는 무시 — 원래 에러 마스킹 금지
  }

  process.stderr.write(chalk.red(`오류: ${errorMessage}`) + "\n");
  process.exit(exitCode);
});
```

> **재귀 방지**: `process.argv[2] === "feedback"` 체크로 `dooray feedback ...` 자체 실행은 last-run에 안 남김. argv[0]=node, argv[1]=dist/index.js, argv[2]=서브명령.
>
> **getConfigOrThrow 내부에서 throw 가능성**: config 자체 읽기 실패 → 그냥 try/catch로 swallow. last-run 기록만 못 할 뿐 원래 에러는 정상 출력.

### 2) `src/commands/feedback.ts` — `--last` 옵션 + 본문 조립

기존 옵션 옆에 추가:
```ts
.option("--last", "직전 실행한 dooray 명령의 argv + 에러를 본문 상단에 자동 첨부")
```

action 핸들러 — 본문 결정 단계 *전*에 last 처리:
```ts
import { readLastRun } from "../cache/last-run.js";
import { buildLastRunBlock } from "../utils/feedback-meta.js";  // phase 1에서 또는 본 phase에서 신규

// action 안:
if (opts.last) {
  const last = await readLastRun();
  if (!last) {
    throw new DoorayCliError(
      "기록된 직전 실행이 없습니다. config.json에 trackLastRun: true 설정 후 dooray 명령 실행 시 자동 기록됩니다.\n  설정: dooray config set track-last-run true",
      EXIT_PARAM_ERROR,
    );
  }
  // userBody 앞에 last-run 블록 prepend
  const lastBlock = buildLastRunBlock(last);
  // 인터랙티브 모드: editor가 열렸을 때 lastBlock + (사용자 입력) 결합
  if (userBody == null) {
    userBody = await editor({
      message: "본문 작성 ($EDITOR가 열림)",
      default: lastBlock + "\n\n",
    });
  } else {
    userBody = lastBlock + "\n\n" + userBody;
  }
}
```

> 인터랙티브 모드일 땐 editor에 lastBlock을 default로 넣어 사용자가 그 위에 의견 한 줄 추가 후 저장. non-interactive(--body 명시)면 본문 앞에 prepend.

### 3) `src/utils/feedback-meta.ts` — `buildLastRunBlock` 추가

```ts
import type { LastRun } from "../cache/last-run.js";

export function buildLastRunBlock(last: LastRun): string {
  return [
    "## 직전 실행 (자동 첨부)",
    "",
    "```",
    `$ ${last.argv.join(" ")}`,
    last.errorMessage,
    "```",
    "",
    `- exit code: ${last.exitCode}`,
    `- 시각: ${last.timestamp}`,
  ].join("\n");
}
```

기존 `buildIssueBody`는 변경 없음 — `buildLastRunBlock` 결과를 호출자가 사용자 본문 앞에 prepend.

### 4) (단위 테스트) `src/utils/feedback-meta.test.ts` 확장

`buildLastRunBlock` 형식 검증:
```ts
import { buildLastRunBlock } from "./feedback-meta.js";

describe("buildLastRunBlock", () => {
  it("argv + 에러 + exit code + timestamp 모두 포함", () => {
    const out = buildLastRunBlock({
      argv: ["dooray", "post", "create", "<project>"],
      exitCode: 2,
      errorMessage: "API 호출 실패: USER_INVALID_TAG_MANDATORY_PREFIX",
      timestamp: "2026-04-29T10:00:00Z",
    });
    expect(out).toContain("$ dooray post create <project>");
    expect(out).toContain("USER_INVALID_TAG_MANDATORY_PREFIX");
    expect(out).toContain("exit code: 2");
    expect(out).toContain("2026-04-29T10:00:00Z");
  });
  it("baseUrl/apiKey/시크릿 없음 회귀 가드", () => {
    const out = buildLastRunBlock({
      argv: ["dooray"],
      exitCode: 1,
      errorMessage: "x",
      timestamp: "2026-04-29T00:00:00Z",
    });
    expect(out).not.toMatch(/baseUrl|apiKey|api[_-]?key|password|token|Bearer/i);
  });
});
```

## 성공 기준

- [ ] `pnpm run build` 성공
- [ ] `pnpm test` 통과 (buildLastRunBlock 2+ 케이스 추가)
- [ ] `node dist/index.js feedback --help` → `--last` 옵션 노출
- [ ] `grep -c "writeLastRun\|sanitizeArgv\|trackLastRun" src/index.ts` → 3 이상
- [ ] `grep -c "isFeedbackCommand" src/index.ts` → 1 이상 (재귀 방지)
- [ ] `grep -c "readLastRun\|buildLastRunBlock\|opts.last" src/commands/feedback.ts` → 3 이상

## 주의사항

- **best-effort 기록**: catch 블록 내부 try/catch가 원래 에러 출력을 절대 마스킹하지 않도록. last-run 기록 실패는 silent
- **재귀 방지 필수**: `process.argv[2] === "feedback"` 체크. feedback이 자기 자신 argv를 last-run에 남기면 다음 feedback에 fed back
- **opt-in 게이트**: `config.trackLastRun !== true` 면 기록 X
- **--last 사용 시 last-run 없음 → 명확한 에러 메시지** (단위 테스트로는 검증 어려움 — phase 3 시나리오)
- **인터랙티브 모드 editor default**: lastBlock + "\n\n"로 사용자가 그 아래 의견 작성. 사용자 의견이 빈 줄이면 lastBlock만으로도 본문 충분
- **non-interactive 모드 (--body)**: lastBlock + "\n\n" + userBody prepend. `--dry-run`으로 사전 확인 가능

## Blocked 조건

- phase 1 산출물 부재 → `PHASE_BLOCKED: phase 1 미완료`
- `getConfigOrThrow`가 catch 내부에서 동작 안 함 (config 미존재 케이스 throw) → try/catch로 swallow 처리, blocked 아님
- editor prompt가 default 인자 안 받음 → `@inquirer/prompts editor` 시그니처 확인 후 조정
