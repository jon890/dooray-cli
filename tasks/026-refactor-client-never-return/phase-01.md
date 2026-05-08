# Phase 01 — client.ts catch 절 패턴 통일 (`return` → `await`)

## 컨텍스트

GitHub Issue #42 — PR #40 claude bot 리뷰에서 제기된 cross-cutting 기술부채.

`src/api/client.ts:104` 의 `toDoorayCliError(error: unknown): Promise<never>` 는 이미 `never` 타입. 호출 패턴은 모두 `return toDoorayCliError(e)` 인데, `return` 이 있으면 메서드 반환값처럼 보여 future 메서드 추가 시 catch 절을 잘못 작성해도 컴파일러가 실수를 못 잡을 위험.

코드 현황:
- `src/api/client.ts:104-...` — `async function toDoorayCliError(error: unknown): Promise<never>` 정의
- 호출 위치: `grep -c "return toDoorayCliError" src/api/client.ts` 결과 **34건** (실측)

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- src/api/client.ts tasks/026-refactor-client-never-return/
```

기대 결과 (총 2 파일):
```
src/api/client.ts
tasks/026-refactor-client-never-return/index.json
```

## 작업 항목

### 1. `src/api/client.ts` — 34곳 mechanical 치환

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 변경 전 카운트
BEFORE=$(grep -c "return toDoorayCliError" src/api/client.ts)
echo "before: $BEFORE"
# 기대: 34
```

치환 패턴:
- `return toDoorayCliError(e);` → `await toDoorayCliError(e);`
- `return toDoorayCliError(error);` 같은 변형도 동일 (인자명 무관)

**구현 방법** (executor): Edit 도구의 `replace_all=true` 사용. macOS BSD `sed` 의 `\b` 함정은 본 케이스에서 사용 안 함 (단순 문자열 치환).

```ts
// AS-IS
} catch (e) {
  return toDoorayCliError(e);
}

// TO-BE
} catch (e) {
  await toDoorayCliError(e);
}
```

**왜 `await`** (`throw` 가 아닌 이유):
- `toDoorayCliError` 가 `async function ...: Promise<never>` 라서 throw 를 직접 호출자에서 쓰려면 함수 시그니처를 `function ...: never` (sync) 로 바꿔야 함 — 본 task scope 외
- `await` 만으로도 control flow 가 unwind 됨 — `Promise<never>` 가 reject 되어 자동으로 throw 효과
- 호출자에서 `return` 키워드 제거로 "메서드 반환값" 오해 방지가 본 task 의 핵심

### 2. `toDoorayCliError` 시그니처 점검

현재 시그니처:
```ts
async function toDoorayCliError(error: unknown): Promise<never>
```

이미 `Promise<never>` 라 추가 변경 불필요. 본 task 는 호출자 패턴만 정리.

### 3. 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 변경 후 카운트
AFTER_RETURN=$(grep -c "return toDoorayCliError" src/api/client.ts)
AFTER_AWAIT=$(grep -c "await toDoorayCliError" src/api/client.ts)
echo "after return: $AFTER_RETURN, after await: $AFTER_AWAIT"
# 기대: return 0, await 34

# 빌드 + 테스트
pnpm build && pnpm test
# 기대: exit 0
```

### 4. 마지막 phase — index.json 완료 마킹

```bash
# cwd: /Users/nhn/personal/dooray-cli
sed -i '' 's/"status": "pending"/"status": "completed"/g' tasks/026-refactor-client-never-return/index.json
grep -c '"status": "completed"' tasks/026-refactor-client-never-return/index.json
# 기대: 2 (root + phase 1)
```

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. 빌드 + 테스트 통과 (단순 키워드 치환이므로 회귀 가능성 매우 낮음 — 컴파일러가 잡아줌)
pnpm build && pnpm test

# 2. return 패턴 0
grep -c "return toDoorayCliError" src/api/client.ts
# 기대: 0

# 3. await 패턴 34
grep -c "await toDoorayCliError" src/api/client.ts
# 기대: 34

# 4. index.json 완료
grep -c '"status": "completed"' tasks/026-refactor-client-never-return/index.json
# 기대: 2
```

## 작업 외 금지

- `toDoorayCliError` 를 sync `function ...(): never` 로 바꾸기 금지 (await 패턴이 더 안전 — promise rejection 까지 unwind)
- 다른 파일 (`src/utils/errors.ts`, resolvers, commands) 변경 금지 — client.ts 만
- catch 절의 다른 로직 변경 금지 (예: 추가 컨텍스트 로깅) — 본 task 는 mechanical 치환만
- ADR 추가 금지 (자명성 게이트 — TypeScript 일반 패턴)

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/026-refactor-client-never-return
git add src/api/client.ts tasks/026-refactor-client-never-return/index.json
git commit -m "refactor(api): use await toDoorayCliError instead of return

Issue #42: toDoorayCliError returns Promise<never> — using 'return' on
it makes the catch block look like a value-returning path, which can
mask future bugs when methods are added. Switch all 34 call sites to
'await' for clear control-flow termination."
```
