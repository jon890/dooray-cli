# Phase 01: services/config.ts 신설과 clearCache 실패 노출

**Execution profile**: standard

---

## 목표

config 가 바뀌어 캐시 전체가 무효해지는 경우를 판정하고 지우는 계층을 만든다.
`clearCache` 가 삭제 실패를 조용히 삼키는 것도 함께 고친다.

명령 계층 연결은 phase-02 가 한다. 이 phase 만으로는 사용자에게 보이는 변화가 없다.

배경은 다음과 같다.
캐시 디렉터리는 `~/.dooray/cache` 하나이고 계정·환경별로 나뉘지 않는다 (`src/cache/store.ts:17`).
그래서 `apiKey` 가 바뀌면 계정이 바뀐 것이고 `baseUrl` 이 바뀌면 접속 환경이 바뀐 것이라,
남아 있는 모든 파일이 다른 곳의 데이터가 된다.

증상이 조용하다. 낡은 데이터가 아니라 다른 계정의 데이터를 쓰기 때문에
`resolveProject` 가 이전 환경의 projectId 를 돌려주고 그 id 로 새 환경에 요청을 보낸다.
`me` 캐시는 TTL 24시간이라 가장 오래 남고 `orgId` 를 담아 멤버 검색에 쓰인다.

설계 근거는 `docs/adr/042-cache-invalidation-on-mutation.md` 다. 작업 전에 읽는다.
`src/services/tag.ts` 가 같은 계층의 선례이므로 그 형태를 따른다.

**범위 외**:

- `src/commands/config.ts`, `src/commands/setup.ts`, `src/commands/cache.ts` 수정은 phase-02 다.
- 캐시를 계정별 디렉터리로 나누는 것은 이 plan 의 범위가 아니다.
  `docs/prd.md` 의 제외 범위에 "멀티 계정·프로파일" 이 있어 단일 계정을 전제한다.

---

## 작업 항목 (4)

### 1. 무효화 판정 순수 함수 (`src/services/config.ts`)

```typescript
export function shouldInvalidateCache(prev: Config | null, next: Config): boolean
```

판정 규칙은 다음과 같다.

| 상황 | 반환 |
| --- | --- |
| `prev` 가 `null` (최초 설정) | `false` |
| `prev.apiKey !== next.apiKey` | `true` |
| `prev.baseUrl !== next.baseUrl` | `true` |
| 위 둘이 같고 다른 값만 달라짐 | `false` |

`tenantName`, `imapHost`, `imapPort`, `imapUsername`, `imapPassword`, `smtpHost`, `smtpPort`,
`trackLastRun` 은 캐시가 무엇을 담는지에 영향을 주지 않아 판정에 넣지 않는다.
`Config` 타입은 `src/config/types.ts` 에 있다.

최초 설정에서 `false` 인 이유는 지울 것도 알릴 것도 없기 때문이다.
`prev` 가 `null` 인데 캐시 파일이 남아 있는 상태는 config 를 지우고 캐시만 남긴 경우인데,
그 상황은 `dooray cache clear` 로 사용자가 직접 해결한다.

phase-02 가 이 함수를 직접 테스트하지 않는다. 아래 4번 항목에서 이 phase 가 테스트한다.

### 2. config 변경 함수 두 개 (`src/services/config.ts`)

```typescript
export async function updateConfigValue(
  key: string,
  value: string,
): Promise<{ cacheCleared: boolean }>

export async function replaceConfig(next: Config): Promise<{ cacheCleared: boolean }>
```

`updateConfigValue` 의 동작 순서다.

1. `getConfig()` 로 이전 config 를 읽어 둔다.
2. `setConfigValue(key, value)` 를 부른다. 알 수 없는 키 검증과 저장은 그 함수가 이미 한다.
3. `getConfig()` 로 저장된 결과를 읽는다.
4. `shouldInvalidateCache(prev, next)` 가 `true` 면 캐시를 지운다.
5. 지웠으면 `{ cacheCleared: true }`, 아니면 `{ cacheCleared: false }` 를 반환한다.

`replaceConfig` 는 같은 구조인데 2번이 `saveConfig(next)` 이고 3번이 필요 없다.
인자로 받은 `next` 를 그대로 판정에 쓴다.

두 함수 모두 `src/config/store.ts` 의 기존 함수를 그대로 부른다.
저장 로직을 다시 구현하지 않는다.

**캐시 삭제 실패는 삼킨다.** `clearCache()` 가 던지면 잡아서 stderr 로 경고를 내고
`{ cacheCleared: false }` 를 반환한다. 예외를 밖으로 던지지 않는다.
이 시점에 config 저장은 이미 끝났고, 실패로 만들면 `dooray config set` 을 쓰는 자동화가 깨진다.

경고 문구에 다음 둘을 담는다.

- 캐시를 지우지 못했다는 사실과 원래 오류 메시지
- `dooray cache clear` 로 직접 지울 수 있다는 안내

`src/services/tag.ts` 의 `invalidateTags` 가 같은 형태의 선례다. 그 문구 구조를 따른다.

회피 항목은 `docs/pitfalls/code-review/mutation-without-cache-invalidation.md` 다.

### 3. clearCache 가 실패를 던지게 한다 (`src/cache/store.ts`)

현재 구현은 다음과 같다 (183번째 줄 근처).

```typescript
export async function clearCache(): Promise<void> {
  try {
    await rm(CACHE_DIR, { recursive: true, force: true });
  } catch {
    // directory doesn't exist
  }
}
```

`try/catch` 를 제거해 오류가 그대로 올라가게 한다.
주석이 가리키는 "디렉터리 없음" 은 `force: true` 가 이미 실패로 보지 않으므로
이 `catch` 가 실제로 가리는 것은 권한 오류와 입출력 오류뿐이다.
지우지 못한 캐시를 지웠다고 보고하면 이 plan 이 막으려는 상황이 그대로 남는다.

`DoorayCliError` 로 감싸지 않고 원래 오류를 그대로 던진다.
부르는 쪽이 문맥에 맞게 처리한다. `dooray cache clear` 는 실패를 노출하고,
`services/config.ts` 는 경고만 낸다. 그 분기가 호출자마다 다르므로 여기서 정하지 않는다.

기존 호출부가 둘뿐임을 확인한 뒤 바꾼다.

```bash
# cwd: <repo root>
grep -rn "clearCache" src --include="*.ts" | grep -v "\.test\.ts"
```

`src/cache/store.ts` 정의와 `src/commands/cache.ts` 호출 둘만 나와야 한다.
셋 이상 나오면 그 호출부도 실패 처리를 확인해야 하므로 멈추고 보고한다.

---

### 4. 판정 함수와 무효화 동작 테스트 (`src/services/config.test.ts`)

`shouldInvalidateCache` 는 순수 함수라 위 표의 네 경우를 그대로 덮는다.
`prev` 가 `null` 인 경우, `apiKey` 만 다른 경우, `baseUrl` 만 다른 경우,
둘 다 같고 `tenantName` 이나 `trackLastRun` 만 다른 경우다.

`updateConfigValue` 와 `replaceConfig` 는 아래 셋을 고정한다.

1. 판정이 `true` 면 저장 후 `clearCache` 를 부르고 `cacheCleared: true` 를 반환한다.
   저장이 먼저이고 삭제가 나중인 순서까지 본다.
2. 판정이 `false` 면 `clearCache` 를 부르지 않고 `cacheCleared: false` 를 반환한다.
3. `clearCache` 가 던져도 정상 반환하고 `cacheCleared: false` 다. 예외가 밖으로 나가지 않는다.

3번을 빠뜨리지 마라. `src/services/tag.ts` 에서 같은 성질을 고정한 이유와 같다.
`try/catch` 를 정리하다 없애면 사용자가 캐시를 지운 줄 알고 잘못된 데이터로 계속 쓴다.

mock 은 `src/services/tag.test.ts` 의 방식을 그대로 쓴다. 새 방식을 만들지 않는다.
`clearCache` 의 reject 값이 실제 `rm` 이 던지는 것과 같은 형태여야 한다.
회피 항목은 `docs/pitfalls/code-review/mock-reject-value-not-mirroring-production.md` 와
`docs/pitfalls/plan/test-self-mock.md` 다.

테스트 fixture 에 실제 사내 식별자를 쓰지 않는다.
API key 는 자리수만 맞춘 가상 문자열, base URL 은 `https://api.dooray.com` 같은 공개 값을 쓴다.
회피 항목은 `docs/pitfalls/code-review/src-test-fixture-internal-identifier.md` 다.

---

## Critical Files

| 파일 | 변경 |
| --- | --- |
| `src/services/config.ts` | 신규 |
| `src/services/config.test.ts` | 신규 |
| `src/cache/store.ts` | 수정 |

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm run build
pnpm test
```

셋 모두 통과해야 한다.
`pnpm tsc --noEmit` 은 번들에 쓰이지 않는 타입 전용 검사라 빌드와 별개로 반드시 돌린다.

새 함수가 있는지 확인한다. 세 grep 이 모두 결과를 내야 한다.

```bash
# cwd: <repo root>
grep -n "shouldInvalidateCache" src/services/config.ts
grep -n "updateConfigValue\|replaceConfig" src/services/config.ts
grep -n "clearCache" src/services/config.ts
```

`clearCache` 에서 `try/catch` 가 없어졌는지 확인한다. 아래 출력이 없어야 한다.

```bash
# cwd: <repo root>
sed -n '/export async function clearCache/,/^}/p' src/cache/store.ts | grep -n "catch"
```

새 테스트가 실행됐는지 확인한다.

```bash
# cwd: <repo root>
pnpm test 2>&1 | grep "services/config"
```

## 의도 메모

- 판정을 순수 함수로 분리한 이유는 "어떤 키가 캐시를 무효로 만드는가" 가 이 변경의 핵심 정책이기 때문이다.
  config 스키마에 키가 추가될 때마다 이 함수를 다시 봐야 하고, 테스트가 그 기준을 문서 대신 고정한다.
- `config/store.ts` 에 무효화를 넣지 않은 이유는 그 파일이 순수 저장 계층이기 때문이다.
  `api/client` 가 순수 HTTP 래퍼로 남아 있는 것과 같은 이유다.
- 값이 실제로 달라졌을 때만 지우는 이유는 같은 값을 다시 설정하는 것이 변경이 아니기 때문이다.
  무의미하게 지우면 다음 조회가 API 를 다시 불러 느려진다.
- `clearCache` 의 `catch` 를 제거하는 것은 기능 추가가 아니라 죽은 코드 제거다.
  `force: true` 가 부재를 처리하므로 그 주석이 설명하는 상황은 애초에 도달하지 않는다.
