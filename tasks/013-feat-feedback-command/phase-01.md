# Phase 1: feedback-meta 헬퍼 + 단위 테스트

## 컨텍스트

Issue #19 — `dooray feedback` 명령의 본문 조립/메타 수집 로직을 단일 헬퍼로 분리. 시크릿 누출 방지가 핵심. ADR-022.

### 먼저 읽을 파일

- `docs/adr.md` ADR-022 — sanitization 정책
- `package.json` — version 필드 위치
- vitest 인프라 (011) — `pnpm test` 동작 확인

## 작업 목록 (3개)

### 1) `src/utils/feedback-meta.ts` — 신규

```ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * package.json에서 버전 읽기.
 * tsup 번들 후에도 동작하도록 __dirname 기반.
 */
export async function readCliVersion(): Promise<string> {
  // 빌드된 번들 위치: <pkg>/dist/index.js
  // package.json 위치: <pkg>/package.json
  // 개발 실행 시(tsx): <pkg>/src/utils/feedback-meta.ts → ../../package.json
  // 단일 번들이면 __dirname = <pkg>/dist → ../package.json
  // 양쪽 모두 시도해서 처음 성공하는 경로 사용.
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "..", "package.json"),
    join(here, "..", "..", "package.json"),
    join(here, "..", "..", "..", "package.json"),
  ];
  for (const p of candidates) {
    try {
      const raw = await readFile(p, "utf-8");
      const pkg = JSON.parse(raw);
      if (pkg.name === "dooray-cli" && typeof pkg.version === "string") {
        return pkg.version;
      }
    } catch {
      // 다음 후보
    }
  }
  return "unknown";
}

export interface FeedbackMeta {
  cliVersion: string;
  nodeVersion: string;
  os: string;
  arch: string;
}

export function collectMeta(version: string): FeedbackMeta {
  return {
    cliVersion: version,
    nodeVersion: process.version,
    os: process.platform,
    arch: process.arch,
  };
}

/**
 * 자동 메타 + 사용자 본문을 GitHub issue body로 조립.
 * baseUrl/시크릿은 절대 포함하지 않음 (ADR-022).
 */
export function buildIssueBody(userBody: string, meta: FeedbackMeta): string {
  return [
    "## 환경",
    `- dooray-cli 버전: ${meta.cliVersion}`,
    `- Node: ${meta.nodeVersion}`,
    `- OS: ${meta.os} ${meta.arch}`,
    "",
    "## 사용자 피드백",
    "",
    userBody.trim(),
    "",
  ].join("\n");
}
```

### 2) `src/utils/feedback-meta.test.ts` — 단위 테스트

```ts
import { describe, it, expect } from "vitest";
import { buildIssueBody, collectMeta } from "./feedback-meta.js";

const FAKE_META = {
  cliVersion: "0.5.2",
  nodeVersion: "v18.20.4",
  os: "darwin",
  arch: "arm64",
};

describe("buildIssueBody", () => {
  it("환경 + 본문 섹션 포함", () => {
    const out = buildIssueBody("의견 내용", FAKE_META);
    expect(out).toContain("## 환경");
    expect(out).toContain("- dooray-cli 버전: 0.5.2");
    expect(out).toContain("- Node: v18.20.4");
    expect(out).toContain("- OS: darwin arm64");
    expect(out).toContain("## 사용자 피드백");
    expect(out).toContain("의견 내용");
  });

  it("baseUrl 미포함 (ADR-022)", () => {
    const out = buildIssueBody("의견", FAKE_META);
    expect(out).not.toMatch(/baseUrl|api\.dooray|https:\/\//);
  });

  it("apiKey/password 등 시크릿 키워드 미포함", () => {
    const out = buildIssueBody("의견", FAKE_META);
    expect(out.toLowerCase()).not.toMatch(/apikey|api[_-]?key|password|token|secret/);
  });

  it("사용자 본문이 trim 처리됨", () => {
    const out = buildIssueBody("\n\n  의견  \n\n", FAKE_META);
    expect(out).toContain("의견");
    // trailing newlines가 폭발하지 않게 정리
    expect(out).not.toMatch(/\n{4,}/);
  });
});

describe("collectMeta", () => {
  it("프로세스 정보로 채움", () => {
    const m = collectMeta("9.9.9");
    expect(m.cliVersion).toBe("9.9.9");
    expect(m.nodeVersion).toBe(process.version);
    expect(m.os).toBe(process.platform);
    expect(m.arch).toBe(process.arch);
  });

  it("config 객체에 접근하지 않음 (시그니처 검증)", () => {
    // collectMeta는 version 외 인자 받지 않음 — 타입 시스템이 강제
    expect(collectMeta.length).toBe(1);
  });
});
```

### 3) (검증) — `readCliVersion` 단위 테스트는 생략

이유: file system 의존 → 빌드 환경별 경로 분기 다양. phase 3 시나리오에서 `dooray feedback --dry-run` 출력에 실제 버전이 들어가는지 확인으로 충분.

## 성공 기준

- [ ] `pnpm build` 성공
- [ ] `pnpm test` 통과 (feedback-meta 6+ 케이스)
- [ ] `grep -c "buildIssueBody\|collectMeta\|readCliVersion" src/utils/feedback-meta.ts` → 3 이상
- [ ] `grep -c "baseUrl\|apiKey\|password\|token" src/utils/feedback-meta.ts` → 0 (헬퍼가 시크릿 키워드 자체를 다루지 않음)
- [ ] `git diff --stat` — `src/utils/feedback-meta.ts(.test.ts)` 만 변경

## 주의사항

- **`buildIssueBody`는 config 객체를 인자로 받지 않음** — 시크릿 접근 자체를 차단하는 시그니처
- **baseUrl 누출 회귀 방지**: 단위 테스트의 "baseUrl 미포함" 케이스가 회귀 가드 (정규식이 `https://`까지 포함하므로 미래에 누가 URL을 본문에 넣으면 즉시 실패)
- **vitest는 011의 산출물** — 011 미머지 상태에서 본 task 실행 시 vitest 설치를 먼저
- **`readCliVersion` 경로 후보**: 개발(tsx) / 빌드(dist) 양쪽 동작 — phase 3 시나리오로 검증

## Blocked 조건

- vitest 미설치 → `PHASE_BLOCKED: vitest 설치 필요 (011 의존)`
- `package.json` 구조 변경 (name/version 필드 부재) → `PHASE_BLOCKED: package.json 검증 실패`
