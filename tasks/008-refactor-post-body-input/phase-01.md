# Phase 1: readBodyInputOrNull 유틸 추가 + post 4 파일 migration

## 컨텍스트

Issue #4(task 006) 해결 과정에서 `src/utils/body-input.ts`에 `readBodyInput()` 공용 유틸이 도입됐지만 scope를 wiki 쪽으로 좁혔던 탓에 post 쪽 4파일(post/create, post/edit, post/comment/add, post/comment/edit)에는 여전히 로컬 `readBody`/`resolveBody`/`readStdin` 구현이 남아 중복 상태다.

이 phase는 다음 2가지를 원자적으로 처리:
1. `readBodyInput`과 시맨틱이 살짝 다른 3 파일(post/edit, comment/add, comment/edit)을 위해 **null-friendly variant**(`readBodyInputOrNull`)를 body-input.ts에 추가
2. 4 post 파일을 모두 공용 유틸 기반으로 migration

### 먼저 읽을 파일

- `src/utils/body-input.ts` — 기존 `readBodyInput` (`string` 반환) + `BodyInputOptions` + `readStdin` 내부 헬퍼
- `src/commands/post/create.ts` — 로컬 `readBody` (`string` 반환, "" 기본) + `readStdin`
- `src/commands/post/edit.ts` — 로컬 `resolveBody` (`string | null`, null = "본문 유지") + `readStdin`
- `src/commands/post/comment/add.ts` — 로컬 `resolveBody` (`string | null`, null = "$EDITOR 폴백") + `readStdin`
- `src/commands/post/comment/edit.ts` — 로컬 `resolveBody` (`string | null`, null = "$EDITOR 폴백") + `readStdin`
- `src/commands/wiki/page-create.ts` — 참조용 (이미 `readBodyInput`으로 migration 완료, 패턴 예시)

### 이전 커밋 상호작용

```bash
# cwd: /Users/nhn/personal/dooray-cli
git log --oneline -10
```

최근 main (작성 시점):
```
3ed29cd Merge pull request #14 from jon890/feat/007-refactor-unify-title-option
faf21ae feat(commands): unify post title option to --title with --subject alias
26f8ac5 docs(task): revise 007 phase-02/03 per critic feedback
6ee8cdd docs(task): add 007-refactor-unify-title-option for issue #8
3f7b16e docs: unify post/wiki title option to --title for issue #8
ebc37c6 docs(skill): document API limitations in dooray-cli SKILL.md
51735ac Merge pull request #13 from jon890/feat/006-feat-wiki-page-edit-non-interactive
0658193 feat(commands): add non-interactive flags to wiki page edit
```

Task 006(PR #13)에서 `body-input.ts` 가 추가됐고, task 007(PR #14) 에서 post 2파일의 `--title`/`--subject` 옵션이 정리됐지만 `readBody`/`resolveBody` 로컬 함수는 그대로 남음. 이 phase가 그 잔재를 제거.

### 설계 결정 (사용자 합의)

1. **`readBodyInputOrNull` 신규 추가** — 시맨틱 차이 해소. `readBodyInput`의 signature 변경 없이 wiki 콜러 무변경
2. **동작 변화 수용**: post 4 파일 모두 `--body` + `--body-file` **동시 지정 시 에러** (기존 silent ignore 제거). Issue #12 Acceptance에 명시됨
3. **post/create**: `readBodyInput` 그대로 사용 (미지정 시 `""`)
4. **post/edit, comment/add, comment/edit**: `readBodyInputOrNull` 사용 (미지정 시 `null` = 기존 "본문 유지" / "에디터 폴백" 시맨틱 유지)

## 목표

1. `src/utils/body-input.ts` 에 `readBodyInputOrNull` export 추가
2. 4 post 파일에서 로컬 `readBody` / `resolveBody` / `readStdin` 제거
3. 로컬 `fs` import 제거 (더 이상 직접 사용 없음)
4. `DoorayCliError`/`EXIT_PARAM_ERROR` import는 **다른 용도로 쓰이면 보존**, 아니면 제거
5. 빌드 통과 + 동일 동작(+ 새 에러 가드)

## 작업 목록

### 1) `src/utils/body-input.ts` 확장

기존 `readBodyInput` export **아래**, `readStdin` 내부 함수 **위**에 append:

```ts
/**
 * `readBodyInput`의 null-friendly variant.
 *
 * - body/bodyFile 둘 다 미지정 시 `null` 반환 (호출자가 "본문 유지" / "$EDITOR 폴백" 등으로 해석)
 * - 동시 지정 시 에러 (`readBodyInput`과 동일)
 * - 하나만 지정 시 해당 값 반환 (`readBodyInput`과 동일)
 */
export async function readBodyInputOrNull(
  opts: BodyInputOptions,
): Promise<string | null> {
  if (opts.body == null && opts.bodyFile == null) return null;
  return readBodyInput(opts);
}
```

**주의**: `readBodyInput` 내부의 `--body와 --body-file은 함께 사용할 수 없습니다.` 에러 가드가 자동 전파됨. 별도 구현 불필요.

### 2) `src/commands/post/create.ts` migration

**Before (L1-39 구조)**:
```ts
import fs from "node:fs/promises";
// ...
async function readBody(opts: { bodyFile?: string; body?: string }): Promise<string> { ... }
async function readStdin(): Promise<string> { ... }
```

**After**:
- `import fs from "node:fs/promises";` **제거**
- 로컬 `readBody`, `readStdin` 함수 **제거**
- top import 블록에 추가:
  ```ts
  import { readBodyInput } from "../../utils/body-input.js";
  ```
- action 내부 `readBody(opts)` 호출을 `readBodyInput(opts)` 로 교체:
  ```ts
  const bodyContent = await readBodyInput(opts);
  ```

**주의**: `DoorayCliError`, `EXIT_PARAM_ERROR` 는 post/create.ts에서 **`--title` 필수 체크에 계속 사용** → 유지.

### 3) `src/commands/post/edit.ts` migration

**Before (L31-58 구조)**:
```ts
import fs from "node:fs/promises";
// ...
async function readStdin(): Promise<string> { ... }
async function resolveBody(opts: {...}): Promise<string | null> { ... }
```

**After**:
- `import fs from "node:fs/promises";` **제거**
- 로컬 `readStdin`, `resolveBody` 함수 **제거**
- top import 블록에 추가:
  ```ts
  import { readBodyInputOrNull } from "../../utils/body-input.js";
  ```
- action 내부 `resolveBody(opts)` 호출을 `readBodyInputOrNull(opts)` 로 교체:
  ```ts
  const newBody = await readBodyInputOrNull(opts);
  ```

**주의**: `DoorayCliError` / `EXIT_PARAM_ERROR` 현 사용처 grep으로 확인:
```bash
grep -n "DoorayCliError\|EXIT_PARAM_ERROR" src/commands/post/edit.ts
```
→ 결과가 readStdin 내부 외에 없으면 두 import 모두 **제거**. 있으면 유지.

### 4) `src/commands/post/comment/add.ts` migration

**Before (L14-41 구조)**:
```ts
import fs from "node:fs/promises";
// ...
async function readStdin(): Promise<string> { ... }
async function resolveBody(opts: {...}): Promise<string | null> { ... }
```

**After**:
- `import fs from "node:fs/promises";` **제거**
- 로컬 `readStdin`, `resolveBody` **제거**
- top import에 추가:
  ```ts
  import { readBodyInputOrNull } from "../../../utils/body-input.js";
  ```
  (relative path: 3단계 상위)
- action 내부 `resolveBody(opts)` → `readBodyInputOrNull(opts)`:
  ```ts
  let bodyContent = await readBodyInputOrNull(opts);
  ```

**주의**: `DoorayCliError` / `EXIT_PARAM_ERROR` 사용 여부 grep 확인 후 선별 제거.

### 5) `src/commands/post/comment/edit.ts` migration

**Before (L12-39 구조)**:
```ts
import fs from "node:fs/promises";
// ...
async function readStdin(): Promise<string> { ... }
async function resolveBody(opts: {...}): Promise<string | null> { ... }
```

**After**:
- `import fs from "node:fs/promises";` **제거**
- 로컬 `readStdin`, `resolveBody` **제거**
- top import 추가:
  ```ts
  import { readBodyInputOrNull } from "../../../utils/body-input.js";
  ```
- action 내부 `resolveBody(opts)` → `readBodyInputOrNull(opts)`:
  ```ts
  let edited = await readBodyInputOrNull(opts);
  ```

**주의**: 마찬가지로 `DoorayCliError` / `EXIT_PARAM_ERROR` 사용 여부 grep 후 선별 제거.

### 6) 빌드 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm run build
```

### 7) 정적 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 유틸 신규 export 확인
grep -n "export async function readBodyInputOrNull" src/utils/body-input.ts

# 4 파일에서 로컬 함수 제거 확인
grep -n "^async function readBody\|^async function readStdin\|^async function resolveBody" src/commands/post/create.ts src/commands/post/edit.ts src/commands/post/comment/add.ts src/commands/post/comment/edit.ts || echo "OK_ALL_REMOVED"

# 4 파일에서 body-input import 확인
grep -n "body-input" src/commands/post/create.ts src/commands/post/edit.ts src/commands/post/comment/add.ts src/commands/post/comment/edit.ts

# 4 파일에서 fs import 제거 확인
grep -n 'from "node:fs/promises"' src/commands/post/create.ts src/commands/post/edit.ts src/commands/post/comment/add.ts src/commands/post/comment/edit.ts || echo "OK_FS_REMOVED"

# wiki 콜러 무변경 확인 (body-input.ts 내 readBodyInput signature 유지됨)
grep -n "readBodyInput\b" src/commands/wiki/page-create.ts src/commands/wiki/page-edit.ts

# 동시 지정 에러 메시지가 번들에 포함되는지 (기존 wiki 경로로도 포함됐을 것이므로 >= 1)
grep -c "함께 사용할 수 없습니다" dist/index.js
```

## 성공 기준

- [ ] `pnpm run build` 성공 (exit 0)
- [ ] `grep "export async function readBodyInputOrNull" src/utils/body-input.ts` → 1줄
- [ ] `grep "^async function readBody\|^async function readStdin\|^async function resolveBody" src/commands/post/**` → 매치 없음 (4 파일 모두 로컬 함수 제거)
- [ ] `grep "body-input" src/commands/post/create.ts` → 1줄
- [ ] `grep "body-input" src/commands/post/edit.ts` → 1줄
- [ ] `grep "body-input" src/commands/post/comment/add.ts` → 1줄
- [ ] `grep "body-input" src/commands/post/comment/edit.ts` → 1줄
- [ ] `grep 'from "node:fs/promises"' src/commands/post/create.ts src/commands/post/edit.ts src/commands/post/comment/add.ts src/commands/post/comment/edit.ts` → 매치 없음
- [ ] `grep "readBodyInput\b" src/commands/wiki/page-create.ts` → 1줄 이상 (무변경)
- [ ] `grep "readBodyInput\b" src/commands/wiki/page-edit.ts` → 1줄 이상 (무변경)
- [ ] `grep -c "함께 사용할 수 없습니다" dist/index.js` → 1 이상
- [ ] `git diff --stat` → 5 파일 수정 (body-input.ts + post/create/edit/comment-add/comment-edit)

## 주의사항

- **wiki 콜러는 건드리지 말 것** — body-input.ts의 `readBodyInput` signature 불변이라 자동 보존. Migration 과정에서 `readBodyInput` 기존 export를 실수로 삭제/수정하지 말 것
- **post/create 의 시맨틱은 `""`(빈 본문) 그대로** — `readBodyInput` (not OrNull) 사용
- **post/edit, comment/add, comment/edit 의 null 분기 로직 보존** — 기존 `if (newBody == null) ...` 같은 분기가 있으면 그대로 둠
- **`DoorayCliError`/`EXIT_PARAM_ERROR` import 제거는 신중히** — grep으로 다른 사용처 확인 후에만 제거. post/create는 `--title` 체크에 사용 중이라 보존 필수
- **새 에러 가드 동작 변화 허용**: 기존 post 파일들이 body+bodyFile 동시 지정 시 silent ignore 했던 것 → 이제 에러. Issue #12 Acceptance와 일치

## Blocked 조건

- 4 파일 중 하나라도 `readStdin` 블록을 찾을 수 없음 (이미 누군가 migration 했거나 구조 변경) → `PHASE_BLOCKED: {파일} 구조 변경 감지`
- `src/utils/body-input.ts`에서 기존 `readBodyInput`/`BodyInputOptions`/`readStdin` 구조를 못 찾음 → `PHASE_BLOCKED: body-input.ts 구조 변경 감지`
- 빌드 실패가 변경과 무관한 기존 에러 → `PHASE_BLOCKED: 사전 존재한 빌드 에러`
