# Phase 01 — `--json` / `--quiet` 모드에서 spinner 비활성화

## 컨텍스트

GitHub Issue #35 의 1번 항목. `dooray post get tc-ocr 471 --json | jq '.id'` 같은 자동화 파이프에서 spinner 메시지 (`- 업무 조회 중...` / `✔ 업무 조회 완료`) 가 stdout 에 섞여 jq 가 실패한다.

코드 현황:
- `src/utils/spinner.ts` — ora 9.3.0 사용. `stream: process.stderr` 명시되어 있으나 ora 의 non-TTY fallback 이 stdout 으로 leak 되는 현상이 보고됨.
- `src/index.ts:48-49` — 전역 옵션 `--json` / `--quiet` 정의. preAction hook 으로 `--no-color` 처리.

직전 plan 과의 관계: 014-018 은 모두 신규 명령 추가 (groups/tags, comment-list-filters, comment-mention, member-search, feedback-last). spinner / 출력 정책은 손대지 않음. 충돌 없음.

```bash
# cwd: /Users/nhn/personal/dooray-cli
git log origin/main --oneline -10 -- src/utils/spinner.ts src/index.ts
# 기대: 결과 비어있음 또는 7b89bee 만 (initial release)
```

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- src/utils/spinner.ts src/index.ts
```

기대 결과 (총 2 파일):
```
src/utils/spinner.ts
src/index.ts
```

## 작업 항목

### 1. `src/utils/spinner.ts` — quiet 모드 추가 (no-op proxy 반환)

모듈에 `setQuiet(quiet: boolean)` 함수 추가. quiet=true 이면 `startSpinner` 가 ora 를 시작하지 않고 **`Ora` 타입을 만족하는 no-op proxy** 반환. 반환 타입은 `Ora` 그대로 유지 → 호출처(`spinner.text = ...`, `spinner.stop()` 등) 무수정.

> 왜 `Ora | null` 이 아니라 proxy 인가? `obj?.prop = v` 는 ECMAScript 사양상 **SyntaxError** (optional chaining 은 assignment LHS 에 못 씀). 호출처를 모두 `if (spinner) spinner.text = ...` 로 가드하느니 spinner 모듈 안에서 흡수.

구현 패턴 (정확히 이 패턴 사용):

```ts
import ora, { type Ora } from "ora";

let current: Ora | null = null;
let quiet = false;

const noopSpinner: Ora = new Proxy({} as Ora, {
  get(_target, prop) {
    if (prop === "text" || prop === "prefixText" || prop === "suffixText") return "";
    if (prop === "isSpinning") return false;
    // 모든 메서드는 self-chainable no-op
    return () => noopSpinner;
  },
  set() {
    // text / prefixText / suffixText 등 setter 는 silent ignore
    return true;
  },
});

export function setQuiet(value: boolean): void {
  quiet = value;
}

export function startSpinner(text: string): Ora {
  if (quiet) return noopSpinner;
  current = ora({ text, stream: process.stderr }).start();
  return current;
}

export function stopSpinner(success?: boolean, text?: string): void {
  if (!current) return;  // quiet 모드에서는 current 가 절대 set 안 되므로 no-op
  if (success === false) current.fail(text);
  else current.succeed(text);
  current = null;
}
```

**핵심 약속**: `startSpinner` 반환 타입은 `Ora` 그대로. 따라서 `download-all.ts:39` 의 `spinner.text = ...` 같은 호출처는 **수정 불필요** — proxy 의 set trap 이 silent 흡수.

### 2. `src/index.ts` — preAction hook 에서 quiet 모드 활성화

기존 preAction hook 에 한 줄 추가. `--json` 또는 `--quiet` 면 `setQuiet(true)`.

```ts
import { setQuiet } from "./utils/spinner.js";

program.hook("preAction", () => {
  const opts = program.opts();
  if (opts.color === false || process.env.NO_COLOR) {
    chalk.level = 0;
  }
  if (opts.json || opts.quiet) {
    setQuiet(true);
  }
});
```

### 3. spinner 호출처 영향 검증 (수정 불필요)

작업 1 의 no-op proxy 패턴 덕분에 호출처 코드 변경은 **불필요**. 다음 명령으로 호출처를 확인하고, proxy 가 `spinner.text = ...` / `spinner.stop()` 등을 silent 흡수하는지 빌드/타입체크로 확인:

```bash
# cwd: /Users/nhn/personal/dooray-cli
grep -rnE "(const|let)\s+\w+\s*=\s*startSpinner" src/
# 기대: download-all.ts:20 같은 1~2건. 본 phase 에서 이 파일들은 수정 안 함.

# Ora setter 호출 패턴 (.text = ...) 파악
grep -rnE "spinner\.(text|prefixText|suffixText)\s*=" src/
# 기대: download-all.ts:39 의 1줄. 그대로 유지 — proxy 가 흡수.

pnpm build  # tsup 가 타입 통과 확인
```

### 4. `src/utils/spinner.test.ts` — 단위 테스트 (신규)

quiet 모드 회귀 가드.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setQuiet, startSpinner, stopSpinner } from "./spinner.js";

describe("spinner quiet mode", () => {
  beforeEach(() => setQuiet(false));

  it("setQuiet(true) suppresses stderr output from startSpinner", () => {
    const stderrWrite = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    setQuiet(true);
    const s = startSpinner("test");
    expect(stderrWrite).not.toHaveBeenCalled();
    s.stop();
    stderrWrite.mockRestore();
  });

  it("noop proxy: text setter / stop() / succeed() / fail() 호출 안전", () => {
    setQuiet(true);
    const s = startSpinner("init");
    expect(() => { s.text = "updated"; s.stop(); s.succeed("ok"); s.fail("nope"); }).not.toThrow();
  });

  it("setQuiet(false) 복귀 후 정상 동작", () => {
    setQuiet(false);
    const s = startSpinner("normal");
    expect(s).toBeDefined();
    stopSpinner(true, "done");
  });
});
```

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. 빌드 + 테스트 통과
pnpm build && pnpm test
# 기대: exit 0, 모든 vitest suite pass

# 2. setQuiet export 확인
grep -n "export function setQuiet" src/utils/spinner.ts
# 기대: 1줄 매칭

# 3. preAction hook 에 setQuiet 호출 추가됐는지
grep -n "setQuiet" src/index.ts
# 기대: 2줄 (import + 호출)

# 4. quiet 모드 단위 테스트 — `src/utils/spinner.test.ts` (신규 또는 기존 확장)
#    setQuiet(true) 후 startSpinner 호출 시 stderr 무출력 + 반환 객체에 .text=... / .stop() 호출 안전
grep -nE "setQuiet\(true\)" src/utils/spinner.test.ts 2>/dev/null
# 기대: 1줄 이상

# 5. 수동 검증: --json 파이프 청결성 (executor 가 빌드 후 직접 실행)
node dist/index.js --help >/dev/null 2>&1
# 기대: exit 0
```

## 작업 외 금지

- 다른 명령의 spinner 메시지 wording 변경 금지 (별도 PR 사항)
- ora 버전 변경 금지
- `--no-progress` 같은 신규 옵션 추가 금지 (이번 phase scope 외)
- ADR 추가 금지 (자명성 게이트 통과 못 함 — 일반적 CLI 패턴)

## 커밋

phase 작업 완료 후 단일 commit:

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/019-feat-cli-automation-quickwins
git add src/utils/spinner.ts src/index.ts $(grep -rlE "(const|let)\s+\w+\s*=\s*startSpinner" src/)
git commit -m "fix(utils): suppress spinner in --json/--quiet to keep stdout pipeable

Issue #35 item 1: spinner output mixed with JSON broke jq pipelines.
Add setQuiet() to spinner module + activate from preAction hook."
```
