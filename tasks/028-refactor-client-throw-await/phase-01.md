# Phase 01 — `return await toDoorayCliError(e)` → `throw await toDoorayCliError(e)` (34곳)

## 컨텍스트

GitHub Issue #49 — `toDoorayCliError` 호출 패턴 통일. PR #48 (task 026) 머지로 `return await toDoorayCliError(e)` 패턴이 도입됐지만, `Promise<never>` 시그니처의 본문 의도 ("이 함수는 throw 한다") 는 `throw` 키워드로 표현하는 게 더 명시적. `return` 은 미래에 메서드 시그니처가 변경될 때 silent 회귀를 가릴 수 있다 (Issue #49 motivation).

코드 현황:
- `src/api/client.ts:105-127` — `async function toDoorayCliError(error: unknown): Promise<never>` 정의. 본문 110 행에 `await error.response.json()` 으로 **응답 body parsing** — 진짜 async I/O 라 sync (`: never`) 시그니처 변환 불가 (옵션 C 기각). async 시그니처 유지.
- `src/api/client.ts` 34개 catch 블록이 `return await toDoorayCliError(e);` (혹은 `(err)`) 호출
- 본문 line 110 자체 catch 블록 (line 118-124) 의 throw 들은 본 변경 대상 아님 (toDoorayCliError 내부)

직전 plan 과의 관계: 026 (PR #48) 가 `return await` 패턴 일괄 적용. 본 plan 은 그 후속 정리 (Issue #49 는 PR #48 봇 리뷰에서 제기된 follow-up).

```bash
# cwd: /Users/nhn/personal/dooray-cli
git log origin/main --oneline -10 -- src/api/client.ts
# 기대: PR #48 commit (b37f9fe / a7b18d7 등) + 최근 plan 028 무관 변경
```

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- src/api/client.ts tasks/028-refactor-client-throw-await/
```

기대 결과 (총 2 파일):
```
src/api/client.ts
tasks/028-refactor-client-throw-await/index.json
```

## 작업 항목

### 1. 치환 전 baseline 측정

```bash
# cwd: /Users/nhn/personal/dooray-cli

BEFORE_RETURN=$(grep -c "return await toDoorayCliError" src/api/client.ts)
echo "before: $BEFORE_RETURN"
# 기대: 34
```

### 2. `src/api/client.ts` — 34곳 mechanical 치환

각 catch 블록에서 `return await toDoorayCliError(` → `throw await toDoorayCliError(` 치환. 인자 이름 (`e` / `err` / `error`) 다양해도 패턴 동일.

**구현 방법** (executor):
- Edit 도구의 `replace_all=true` 사용 — 단일 키워드 치환이라 macOS BSD `sed` `\b` 함정 (common-pitfalls 1-9) 무관
- 또는 sed: `sed -i '' 's/return await toDoorayCliError/throw await toDoorayCliError/g' src/api/client.ts`

```ts
// AS-IS (34곳)
} catch (e) {
  return await toDoorayCliError(e);
}

// TO-BE
} catch (e) {
  throw await toDoorayCliError(e);
}
```

**왜 시그니처 변경 없는가**:
- 본문 line 110 의 `await error.response.json()` 이 진짜 async I/O — sync 변환 불가
- 옵션 C (인자 pre-parse 로 sync 화) 는 호출자 34곳 코드량 분산 + body parsing 중복 → 부적합
- 시그니처 그대로 두고 호출자 키워드만 교체가 최소 변경 + 최대 의미 명확성

### 3. 치환 후 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli

AFTER_RETURN=$(grep -c "return await toDoorayCliError" src/api/client.ts)
AFTER_THROW=$(grep -c "throw await toDoorayCliError" src/api/client.ts)
echo "after return: $AFTER_RETURN, after throw: $AFTER_THROW"
# 기대: return 0, throw 34

# tsc + build + test (CI 게이트와 동일)
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
# 기대: 0
pnpm build && pnpm test
# 기대: exit 0 (100 pass)
```

### 4. 마지막 phase — index.json 완료 마킹

```bash
# cwd: /Users/nhn/personal/dooray-cli
sed -i '' 's/"status": "pending"/"status": "completed"/g' tasks/028-refactor-client-throw-await/index.json
grep -c '"status": "completed"' tasks/028-refactor-client-throw-await/index.json
# 기대: 2 (root + phase 1)
```

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. return 패턴 0
grep -c "return await toDoorayCliError" src/api/client.ts
# 기대: 0

# 2. throw 패턴 34
grep -c "throw await toDoorayCliError" src/api/client.ts
# 기대: 34

# 3. 시그니처 변경 없음 — async function ...: Promise<never> 그대로
grep -nE "async function toDoorayCliError\(error: unknown\): Promise<never>" src/api/client.ts
# 기대: 1 (line 105)

# 4. 빌드/테스트/tsc 통과
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
# 기대: 0
pnpm build && pnpm test
# 기대: exit 0

# 5. index.json 완료
grep -c '"status": "completed"' tasks/028-refactor-client-throw-await/index.json
# 기대: 2
```

## 작업 외 금지

- `toDoorayCliError` 본문 (line 105-127) 변경 금지 — async 시그니처 유지 (body parsing 의존)
- 시그니처 sync 변환 금지 (옵션 C — 호출자 분산 + 중복)
- 다른 파일 (`src/utils/errors.ts`, resolvers, commands) 변경 금지
- catch 블록 내 다른 로직 (로깅 등) 추가 금지 — 본 task 는 mechanical 치환만
- ADR / docs 변경 금지 (자명성 게이트 — TypeScript 일반 패턴, 사용자 가시 동작 0)

## 커밋

phase 작업 완료 후 단일 commit (코드 + index.json 함께):

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/028-refactor-client-throw-await
git add src/api/client.ts tasks/028-refactor-client-throw-await/index.json
git commit -m "refactor(api): throw await instead of return await on toDoorayCliError

Issue #49: 'return' 은 메서드 반환값처럼 보여 future 메서드 추가 시
오류 분기를 잘못 작성해도 컴파일러가 못 잡을 위험. 'throw' 키워드는
본문의 Promise<never> 의도를 호출자 측에 명시적으로 노출.

시그니처는 그대로 유지 (line 110 의 await error.response.json() 가
진짜 async I/O — sync 변환 시 호출자 34곳 분산 + body parsing 중복).
mechanical 치환 34곳. 사용자 가시 동작 0 변경."
```
