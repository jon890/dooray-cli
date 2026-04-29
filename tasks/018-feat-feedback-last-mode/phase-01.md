# Phase 1: config schema + sanitization util + last-run store + 단위 테스트

## 컨텍스트

Issue #27 — last-run 추적 인프라. ADR-023 (opt-in + 에러시만 + 최소 세트 + argv 패턴 마스킹).

### 먼저 읽을 파일

- `docs/adr.md` ADR-023 — 결정 근거 + sanitization 룰 표
- `src/config/store.ts` — Config 스키마, getConfigOrThrow 시그니처
- `src/cache/store.ts` `getMe`/`setMe` — JSON 파일 read/write 패턴 (atomic write 필요 시 참고)
- `src/utils/feedback-meta.ts` (013) — 단위 테스트 형식 참고

## 작업 목록 (4개)

### 1) `src/config/store.ts` — `trackLastRun?: boolean` 추가

기존 `Config` 인터페이스에 optional 필드 추가:

```ts
export interface Config {
  // ... 기존 필드
  trackLastRun?: boolean;
}
```

**`set` 명령 핸들러**: `case "track-last-run":` 추가, value를 `"true"`/`"false"` 파싱해 boolean 저장. `dooray config set track-last-run true` 형태로 활성화.

기존 `case "tenant-name":` 같은 패턴 답습. set 알 수 없는 키 에러 메시지의 사용 가능 키 목록에 `track-last-run` 추가.

### 2) `src/utils/argv-sanitize.ts` — 신규 + 단위 테스트

```ts
/**
 * argv에서 시크릿 패턴을 자동 마스킹.
 * ADR-023 sanitization 룰 표 기준.
 */

const KEY_VALUE_PATTERNS = [
  /^(--api-key|--token|--password)=(.+)$/,
];
const SEPARATED_KEYS = new Set(["--api-key", "--token", "--password"]);

export function sanitizeArgv(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    let masked = a;

    // --key=value 형태
    let kvMatch: RegExpMatchArray | null = null;
    for (const re of KEY_VALUE_PATTERNS) {
      const m = re.exec(a);
      if (m) { kvMatch = m; break; }
    }
    if (kvMatch) {
      out.push(`${kvMatch[1]}=***`);
      continue;
    }

    // --key value 형태 — 다음 토큰을 마스킹
    if (SEPARATED_KEYS.has(a)) {
      out.push(a);
      if (i + 1 < argv.length) {
        out.push("***");
        i++;
      }
      continue;
    }

    // Authorization: ... 형태 (단일 string에 들어있을 때)
    if (/^Authorization\s*:/i.test(a) || /^Bearer\s+\S+/.test(a)) {
      out.push(a.replace(/(Authorization\s*:\s*).+/i, "$1***").replace(/^(Bearer\s+).+/i, "$1***"));
      continue;
    }

    out.push(masked);
  }
  return out;
}
```

**`src/utils/argv-sanitize.test.ts`** (vitest):

```ts
import { describe, it, expect } from "vitest";
import { sanitizeArgv } from "./argv-sanitize.js";

describe("sanitizeArgv", () => {
  it("--api-key=value 마스킹", () => {
    expect(sanitizeArgv(["dooray", "post", "--api-key=secret123"]))
      .toEqual(["dooray", "post", "--api-key=***"]);
  });
  it("--api-key value 분리 형태 마스킹", () => {
    expect(sanitizeArgv(["dooray", "--api-key", "secret123", "post"]))
      .toEqual(["dooray", "--api-key", "***", "post"]);
  });
  it("--token / --password 동일 처리", () => {
    expect(sanitizeArgv(["--token=t", "--password=p"]))
      .toEqual(["--token=***", "--password=***"]);
  });
  it("Authorization 헤더 인자 마스킹", () => {
    expect(sanitizeArgv(["--header", "Authorization: Bearer abc123"]))
      .toEqual(["--header", "Authorization: ***"]);
  });
  it("일반 인자는 그대로", () => {
    expect(sanitizeArgv(["dooray", "post", "create", "<project>", "--title", "X"]))
      .toEqual(["dooray", "post", "create", "<project>", "--title", "X"]);
  });
  it("회귀 가드 — secret 단어가 결과에 0건", () => {
    const out = sanitizeArgv(["--api-key", "MY_SECRET_TOKEN_XXX"]);
    expect(out.join(" ")).not.toContain("MY_SECRET_TOKEN_XXX");
  });
});
```

### 3) `src/cache/last-run.ts` 신규 (또는 src/utils/) — store 헬퍼

> `~/.dooray/last-run.json`은 cache 디렉토리 *외부* (config 옆) — `cache clear`로 지워지지 않음. 따라서 `src/cache/store.ts`가 아니라 별도 파일.

```ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const LAST_RUN_PATH = join(homedir(), ".dooray", "last-run.json");

export interface LastRun {
  argv: string[];           // sanitized
  exitCode: number;
  errorMessage: string;
  timestamp: string;        // ISO 8601
}

export async function readLastRun(): Promise<LastRun | null> {
  try {
    const raw = await readFile(LAST_RUN_PATH, "utf-8");
    return JSON.parse(raw) as LastRun;
  } catch {
    return null;
  }
}

export async function writeLastRun(data: LastRun): Promise<void> {
  await mkdir(join(homedir(), ".dooray"), { recursive: true });
  await writeFile(LAST_RUN_PATH, JSON.stringify(data, null, 2) + "\n");
}
```

> 실패는 swallow — 기록 실패가 사용자 명령 자체를 실패시키면 안 됨 (catch 블록 내부에서 호출되므로).

### 4) (검증) — sanitize 단위 테스트 통과

phase 1의 핵심 검증은 sanitize 단위 테스트. 시크릿 단어가 출력에 들어가지 않는지 회귀 가드.

## 성공 기준

- [ ] `pnpm run build` 성공
- [ ] `pnpm test` 통과 (sanitize 6+ 케이스 추가)
- [ ] `grep -c "trackLastRun" src/config/store.ts` → 2 이상 (interface + set case)
- [ ] `grep -c "track-last-run" src/config/store.ts` → 2 이상 (set case + 사용가능 키 목록)
- [ ] `ls src/utils/argv-sanitize.ts src/utils/argv-sanitize.test.ts src/cache/last-run.ts` → 3 파일
- [ ] `grep -c "readLastRun\|writeLastRun" src/cache/last-run.ts` → 2 이상
- [ ] sanitize 단위 테스트 "secret 단어 0건" 회귀 가드 통과

## 주의사항

- **명령/hook 통합은 phase 2** — 본 phase는 헬퍼만
- **`writeLastRun` 실패는 swallow** — catch 블록에서 호출되므로 부수 effect로 다른 에러 마스킹 금지
- **CLAUDE.md PII gate 호환**: cwd/env 미저장. argv는 sanitized 후만 저장
- **재귀 방지는 phase 2의 catch hook에서** — `feedback` 자체는 last-run에 안 남김
- **last-run.json 위치**: `~/.dooray/last-run.json` (config 옆). cache 디렉토리 안에 두지 말 것 — `cache clear`로 의도와 다르게 지워짐

## Blocked 조건

- `Config` 인터페이스 변경이 다른 호출자에 영향 → optional 필드라 호환. 컴파일 에러시 호출자 점검
- vitest 미설치 → 011 의존 — 이미 main에 머지됨
