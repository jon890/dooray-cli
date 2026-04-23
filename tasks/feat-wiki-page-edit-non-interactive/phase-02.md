# Phase 2: readBody/readStdin 공유 유틸 추출 + page-create 마이그레이션 + 충돌 가드

## 컨텍스트

현재 `readBody()` + `readStdin()` 가 5개 파일에 복붙되어 있다 (post/create, post/edit, post/comment/add, post/comment/edit, wiki/page-create). 이 phase는 **Issue #4 스코프를 좁게** 유지하기 위해 **wiki 쪽만 공유 유틸로 추출**한다. post 4개 파일은 별도 task(GitHub Issue #12)에서 정리.

또한 `--body` 와 `--body-file` **동시 지정 시 silent ignore** 버그를 이 기회에 fix — readBody가 충돌을 명시적 에러로 던진다.

### 먼저 읽을 파일

- `src/commands/wiki/page-create.ts` L12-37 — 기존 `readBody`, `readStdin` 구현 (추출 원본)
- `src/utils/errors.ts` — `DoorayCliError` 사용 패턴
- `src/utils/exit-codes.ts` — `EXIT_PARAM_ERROR` 의미
- (참고) `src/commands/post/create.ts` L14-37 — 비슷한 로직. 이번 phase에서는 **건드리지 않음**

### 이전 phase 상호작용

Phase 1에서 API 메서드·타입은 추가됐지만, commands 레이어는 아직 변경 없음. 이 phase는 commands 레이어의 본문 입력 처리를 유틸로 외재화.

### 설계 원칙

- **단일 공용 API**: `readBodyInput(opts): Promise<string>` — `--body`, `--body-file` 옵션을 받아 최종 문자열 반환
- **충돌 가드**: 둘 다 지정되면 `DoorayCliError("--body와 --body-file은 함께 사용할 수 없습니다.", EXIT_PARAM_ERROR)` 던짐
- **no-input 허용**: 둘 다 비어있으면 `""` 반환 (호출자가 "본문 없음"을 어떻게 해석할지 결정 — page-create는 빈 본문 허용)
- **stdin 트리거**: 값이 정확히 `"-"`일 때만

## 목표

1. `src/utils/body-input.ts` 신규 — `readBodyInput()` export
2. `src/commands/wiki/page-create.ts` 의 로컬 `readBody`/`readStdin` 제거 + 공유 유틸 import
3. 동작 동일 + 충돌 가드 추가
4. 빌드 통과

## 작업 목록

### 1) `src/utils/body-input.ts` 신규 생성

```ts
import { DoorayCliError } from "./errors.js";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";

export interface BodyInputOptions {
  body?: string;
  bodyFile?: string;
}

/**
 * `--body` / `--body-file` 옵션을 받아 본문 문자열을 돌려준다.
 *
 * - 둘 중 하나만 지정 가능. 동시 지정 시 에러.
 * - 값이 `"-"`이면 stdin에서 읽음.
 * - 둘 다 비어있으면 빈 문자열 반환 (호출자 책임으로 의미 해석).
 */
export async function readBodyInput(opts: BodyInputOptions): Promise<string> {
  if (opts.body != null && opts.bodyFile != null) {
    throw new DoorayCliError(
      "--body와 --body-file은 함께 사용할 수 없습니다.",
      EXIT_PARAM_ERROR,
    );
  }
  if (opts.bodyFile) {
    if (opts.bodyFile === "-") return readStdin();
    const { readFile } = await import("node:fs/promises");
    return readFile(opts.bodyFile, "utf-8");
  }
  if (opts.body === "-") return readStdin();
  return opts.body ?? "";
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new DoorayCliError(
      "stdin에서 읽으려면 파이프로 데이터를 전달해주세요.",
      EXIT_PARAM_ERROR,
    );
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}
```

**설계 주석**:
- `readFile` 을 동적 import한 이유: 이전 page-create.ts에 `import fs from "node:fs/promises"` 가 있었지만, 이 유틸은 파일 경로가 지정됐을 때만 `fs`를 쓰므로 lazy import로 번들 초기화 비용 절감. 정적 `import`도 괜찮다면 `import { readFile } from "node:fs/promises";` 로 대체 가능.
- **정적 import로 통일**: tsup 번들에서 어차피 bundle됨. 위 코드는 **정적 import**로 최종 작성할 것.

**최종 버전 (정적 import)** — 위 예시에서 `const { readFile } = await import(...)` 를 제거하고 파일 상단에 `import { readFile } from "node:fs/promises";` 를 추가한 형태로 작성한다.

실제 파일 내용:

```ts
import { readFile } from "node:fs/promises";
import { DoorayCliError } from "./errors.js";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";

export interface BodyInputOptions {
  body?: string;
  bodyFile?: string;
}

export async function readBodyInput(opts: BodyInputOptions): Promise<string> {
  if (opts.body != null && opts.bodyFile != null) {
    throw new DoorayCliError(
      "--body와 --body-file은 함께 사용할 수 없습니다.",
      EXIT_PARAM_ERROR,
    );
  }
  if (opts.bodyFile) {
    if (opts.bodyFile === "-") return readStdin();
    return readFile(opts.bodyFile, "utf-8");
  }
  if (opts.body === "-") return readStdin();
  return opts.body ?? "";
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new DoorayCliError(
      "stdin에서 읽으려면 파이프로 데이터를 전달해주세요.",
      EXIT_PARAM_ERROR,
    );
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}
```

### 2) `src/commands/wiki/page-create.ts` 마이그레이션

(a) top import 정리 — 로컬 `readBody`/`readStdin` 제거를 위한 준비:

기존:
```ts
import fs from "node:fs/promises";
```
→ 제거 (readBody가 사라지면 fs 직접 사용처도 없어짐).

import 블록에 추가:
```ts
import { readBodyInput } from "../../utils/body-input.js";
```

(b) 파일 중간의 `async function readBody(...)` 블록(L12-23)과 `async function readStdin(...)` 블록(L25-37) **완전 삭제**.

(c) action 내부(L51):
```ts
    const bodyContent = await readBody(opts);
```
→
```ts
    const bodyContent = await readBodyInput(opts);
```

기존 `readBody(opts)`의 `opts` 타입과 `BodyInputOptions`가 호환됨을 확인 — commander의 opts는 `body`, `bodyFile` 카멜케이스 키를 갖고, 이게 `BodyInputOptions`의 optional 필드와 일치.

### 3) 빌드 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm run build
```

### 4) 정적 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 신규 유틸 파일 존재 확인
test -f src/utils/body-input.ts && echo OK

# export 확인
grep -n "export async function readBodyInput\|export interface BodyInputOptions" src/utils/body-input.ts

# page-create: 로컬 readBody 제거 확인
grep -n "^async function readBody\|^async function readStdin" src/commands/wiki/page-create.ts || echo "OK_REMOVED"

# page-create: 공용 유틸 import 확인
grep -n "readBodyInput" src/commands/wiki/page-create.ts

# page-create: fs import 제거 확인 (더 이상 직접 사용 없음)
grep -n 'from "node:fs/promises"' src/commands/wiki/page-create.ts || echo "OK_FS_REMOVED"

# 충돌 가드 번들 포함 확인
grep -c "함께 사용할 수 없습니다" dist/index.js
```

## 성공 기준

- [ ] `pnpm run build` 성공 (exit 0)
- [ ] `test -f src/utils/body-input.ts` 통과
- [ ] `grep "export async function readBodyInput" src/utils/body-input.ts` → 1줄
- [ ] `grep "export interface BodyInputOptions" src/utils/body-input.ts` → 1줄
- [ ] `grep "^async function readBody" src/commands/wiki/page-create.ts` → 매치 없음
- [ ] `grep "^async function readStdin" src/commands/wiki/page-create.ts` → 매치 없음
- [ ] `grep "readBodyInput" src/commands/wiki/page-create.ts` → 2줄 (import + 호출)
- [ ] `grep 'from "node:fs/promises"' src/commands/wiki/page-create.ts` → 매치 없음
- [ ] `grep -c "함께 사용할 수 없습니다" dist/index.js` → 1 이상
- [ ] `git diff --stat src/` → 2 파일 (utils/body-input.ts 신규 + commands/wiki/page-create.ts 수정)

## 주의사항

- **page-create의 동작 변경 최소화** — 입력 처리 로직만 유틸로 이동, 나머지(spinner, output format, resolveWiki, createWikiPage 호출)는 **그대로 유지**
- **post/* 4개 파일 건드리지 말 것** — Issue #12로 분리됨. 이 task에서는 wiki 쪽만
- **`null` 대 `undefined` 주의** — `opts.body != null` 은 `null`/`undefined` 둘 다 거르므로 commander의 미지정 옵션을 올바로 처리
- **에러 메시지는 한국어 유지** — 기존 스타일과 일관

## Blocked 조건

- `src/commands/wiki/page-create.ts`의 L12-37 구조가 달라서 `readBody`/`readStdin` 블록을 찾을 수 없음 → `PHASE_BLOCKED: page-create.ts 구조 변경 감지`
- `src/utils/errors.ts` 또는 `src/utils/exit-codes.ts`가 이동/삭제됨 → `PHASE_BLOCKED: utils 모듈 구조 변경 감지`
