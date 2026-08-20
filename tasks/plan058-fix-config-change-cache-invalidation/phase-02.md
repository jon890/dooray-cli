# Phase 02: config set·setup 연결과 cache clear 에러 처리

**Execution profile**: standard

---

## 목표

phase-01 이 만든 함수를 두 명령에 연결하고, 캐시를 비웠다는 사실을 사용자에게 알린다.
`dooray cache clear` 가 삭제 실패를 에러로 노출하게 한다.
사용자에게 보이는 변화가 이 phase 에서 생긴다.

phase-01 이 만든 표면을 전제한다. 아래가 없으면 phase-01 이 끝나지 않은 것이므로 멈추고 보고한다.

- `src/services/config.ts` 의 `updateConfigValue`, `replaceConfig`
- `src/cache/store.ts` 의 `clearCache` 가 실패를 던지고 반환형이 `Promise<boolean>` 인 상태

사용자 흐름은 `docs/flow.md` 의 "최초 설정" 절과 "캐시 흐름" 절에 이미 확정되어 있다.
`README.md` 의 설치와 설정 절에도 사용자가 볼 문장이 들어가 있다.
두 문서와 어긋나게 만들지 않는다. 설계 근거는 `docs/adr/042-cache-invalidation-on-mutation.md` 다.

**범위 외**:

- 캐시를 계정별 디렉터리로 나누는 것은 이 plan 의 범위가 아니다.
- `dooray cache refresh` 의 "API 클라이언트 연동 후 자동 갱신" 예정 동작은 손대지 않는다.
  이번에는 `clearCache` 실패가 그 명령에도 전파되는 것만 확인한다.

---

## 작업 항목 (4)

### 1. config set 연결 (`src/commands/config.ts`)

현재 `set` 하위 명령은 `setConfigValue` 를 직접 부른다 (22번째 줄 근처).

```typescript
await setConfigValue(key, await resolveConfigValue(value));
console.log(chalk.green(`✓ ${key} 설정 완료`));
```

`updateConfigValue` 로 바꾸고 반환값에 따라 안내를 덧붙인다.
`src/config/store.ts` 의 `setConfigValue` import 는 더 이상 필요하지 않으면 지운다.
`getConfig` 는 `get` 하위 명령이 쓰므로 남긴다.

기존 성공 메시지는 그대로 두고 그 아래에 한 줄을 더한다.
`cacheCleared` 가 `true` 일 때만 낸다.

문구는 무엇이 바뀌었는지에 따라 다르게 한다.

| 바뀐 키 | 안내 |
| --- | --- |
| `api-key` | 계정이 바뀌었을 수 있어 캐시를 비웠다는 것과, 다음 조회가 API 를 다시 호출한다는 것 |
| `base-url` | 접속 환경이 바뀌었을 수 있어 캐시를 비웠다는 것과, 같은 후속 안내 |

두 문구를 한 함수로 합치지 말고 키에 따라 갈라도 된다. 어느 쪽이든 한 줄로 끝낸다.

출력 경로는 기존 성공 메시지와 같게 `console.log` 를 쓴다.
`config set` 은 `--json` 과 `--quiet` 을 지원하지 않고 파이프 대상도 아니라, 기존 관행을 따르는 것이 일관적이다.

`updateConfigValue` 가 던지는 오류의 처리는 기존 `try/catch` 를 그대로 쓴다.
알 수 없는 키 검증은 `setConfigValue` 안에 이미 있고 `updateConfigValue` 가 그것을 그대로 통과시킨다.

### 2. setup 연결 (`src/commands/setup.ts`)

176번째 줄 근처의 `await saveConfig(config)` 를 `replaceConfig(config)` 로 바꾼다.
`saveConfig` import 를 `replaceConfig` 로 교체한다. `getConfig` 는 그 파일이 계속 쓴다.

기존 완료 메시지 아래에 안내를 더한다. `cacheCleared` 가 `true` 일 때만이다.

```
✓ 설정 완료. dooray doctor로 상태를 확인할 수 있습니다.
```

setup 은 `api-key` 와 `base-url` 을 함께 물으므로 어느 쪽이 바뀌었는지 나누지 않는다.
계정이나 접속 환경이 바뀌어 캐시를 비웠다는 것과, 다음 조회가 API 를 다시 호출한다는 것을 한 줄로 알린다.

setup 은 이미 `existing` 변수로 이전 config 를 들고 있다.
그것으로 직접 비교하지 말고 `replaceConfig` 가 판정하게 둔다.
판정 규칙이 두 곳에 생기면 갈라진다.

최초 설정에서는 `cacheCleared` 가 `false` 라 안내가 나오지 않는다.
phase-01 의 판정이 `prev` 가 `null` 일 때 `false` 이기 때문이다.
처음 설정하는 사용자에게 캐시 이야기를 꺼내지 않는 것이 의도다.

`config set` 으로 값을 하나씩 넣는 경로에서는 판정이 아니라 캐시 존재 여부가 안내를 막는다.
`setConfigValue` 가 config 부재 시 `apiKey: ""` 뼈대를 만들어 `prev` 가 `null` 이 아니게 되기 때문이다.
그 경우에도 지울 캐시가 없으면 `clearCache` 가 `false` 를 돌려주므로 안내가 나오지 않는다.
근거는 phase-01 의 항목 2 와 3 이다.

### 3. 종료 코드 신설 (`src/utils/exit-codes.ts`)

파일 시스템 오류에 해당하는 코드가 없다. 현재는 다섯뿐이다.

```typescript
export const EXIT_SUCCESS = 0;
export const EXIT_API_ERROR = 1;
export const EXIT_AUTH_ERROR = 2;
export const EXIT_PARAM_ERROR = 3;
export const EXIT_CONFIG_ERROR = 4;
```

`EXIT_IO_ERROR = 5` 를 더한다.

`EXIT_API_ERROR` 를 캐시 삭제 실패에 쓰면 이름이 사실과 어긋나고,
`EXIT_CONFIG_ERROR` 는 설정 부재와 캐시 삭제 실패를 자동화가 구분하지 못하게 만든다.
종료 코드 추가는 기존 값의 의미를 바꾸지 않으므로 하위 호환이다.

`docs/code-architecture.md` 의 종료 코드 한 줄(250번째 줄 근처)에
"파일 시스템 오류: exitCode 5" 를 더한다. `README.md` 에는 종료 코드 표가 없어 손대지 않는다.

### 4. cache clear 의 실패 노출과 빈 캐시 구분 (`src/commands/cache.ts`)

현재 두 하위 명령이 `clearCache()` 를 부른 뒤 무조건 성공 메시지를 낸다.

```typescript
await clearCache();
console.log(chalk.green("✓ 캐시가 삭제되었습니다."));
```

phase-01 에서 `clearCache` 가 실패를 던지고 지운 것이 있었는지를 돌려주게 되었다.
`clear` 와 `refresh` 양쪽 모두 세 결과를 구분해 처리한다.

| `clearCache()` 결과 | 출력 |
| --- | --- |
| `true` | 기존 성공 메시지 |
| `false` | 지울 캐시가 없었다는 안내. 종료 코드는 0 이다 |
| throw | `DoorayCliError` 로 감싸 실패를 노출한다 |

`false` 를 실패로 만들지 않는다. 사용자가 원한 상태(캐시 없음)가 이미 이뤄져 있다.

던질 때는 `DoorayCliError(message, EXIT_IO_ERROR)` 로 감싸
무엇이 실패했는지와 캐시 디렉터리 경로를 알린다.
성공 메시지는 삭제가 실제로 끝난 뒤에만 낸다.
회피 항목은 `docs/pitfalls/code-review/exit-code-missing.md` 다. 던질 때 종료 코드를 반드시 붙인다.

---

## Critical Files

| 파일 | 변경 |
| --- | --- |
| `src/commands/config.ts` | 수정 |
| `src/commands/setup.ts` | 수정 |
| `src/commands/cache.ts` | 수정 |
| `src/utils/exit-codes.ts` | 수정 — `EXIT_IO_ERROR = 5` 신설 |
| `docs/code-architecture.md` | 수정 — 종료 코드 한 줄 |
| `tasks/plan058-fix-config-change-cache-invalidation/index.json` | 수정 |

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm run build
pnpm test
```

셋 모두 통과해야 한다.

명령이 저장 계층을 직접 부르지 않는지 확인한다. 아래 출력이 없어야 한다.

```bash
# cwd: <repo root>
grep -n "setConfigValue\|saveConfig" src/commands/config.ts src/commands/setup.ts
```

services 를 거치는지 확인한다. 두 grep 이 각각 결과를 내야 한다.

```bash
# cwd: <repo root>
grep -n "updateConfigValue" src/commands/config.ts
grep -n "replaceConfig" src/commands/setup.ts
```

`cache clear` 가 성공 메시지를 무조건 내지 않는지 확인한다.
아래 출력에서 `clearCache` 호출이 `try` 안에 있거나 오류를 던지는 처리가 함께 보여야 한다.

```bash
# cwd: <repo root>
cat src/commands/cache.ts
```

실제 동작을 번들에서 확인한다. 읽기만 하므로 사용자 설정을 건드리지 않는다.

```bash
# cwd: <repo root>
node dist/index.js config --help
node dist/index.js cache --help
```

**같은 값 재설정을 실제 `config set` 으로 확인하지 않는다.**
사용자의 `~/.dooray/config.json` 을 수정하는 절차이고, 중간에 실패하면 복구가 사람 손에 간다.
같은 조건을 phase-01 의 `updateConfigValue` 테스트 4번 항목이 이미 덮는다.
판정이 `false` 면 `clearCache` 를 부르지 않는다는 것이 같은 명제다.

새 종료 코드가 있는지 확인한다.

```bash
# cwd: <repo root>
grep -n "EXIT_IO_ERROR" src/utils/exit-codes.ts src/commands/cache.ts
grep -n "exitCode 5" docs/code-architecture.md
```

공개 문서 검사를 통과해야 한다.

```bash
# cwd: <repo root>
bash scripts/check-public-refs.sh
bash scripts/check-pii.sh
```

## 완료 마킹

위 검증을 모두 통과시킨 뒤 `tasks/plan058-fix-config-change-cache-invalidation/index.json` 을 고친다.

- `status` 를 `"completed"` 로 바꾼다.
- `current_phase` 를 `2` 로 둔다.
- `phases` 배열 두 항목의 `status` 를 모두 `"completed"` 로 바꾼다.
- `updated_at` 을 실행한 날짜로 바꾼다.

## 의도 메모

- setup 이 이미 `existing` 을 들고 있어도 직접 비교하지 않는 이유는 판정 규칙이 한 곳에만 있어야 하기 때문이다.
  config 키가 늘어날 때 두 곳을 고치면 한쪽이 빠진다.
- 최초 설정에서 안내를 내지 않는 이유는 처음 쓰는 사용자에게 캐시 개념을 꺼낼 이유가 없기 때문이다.
  지울 것도 없다.
- `cache clear` 의 실패를 노출하는 이유는 사용자가 명시적으로 요청한 작업이기 때문이다.
  `services` 의 무효화는 부수 작업이라 경고만 내지만, 이쪽은 그 자체가 목적이다.
- 같은 값 재설정을 실측하지 않는 이유는 그 절차가 사용자의 실제 설정 파일을 수정하기 때문이다.
  이 조건이 코드 리뷰로 놓치기 쉽고 잘못 구현하면 사용자가 값을 확인할 때마다 캐시가 날아가는 것은 맞다.
  그래서 검증을 없애지 않고 phase-01 의 단위 테스트로 옮겼다.
- 종료 코드를 새로 만든 이유는 이름이 사실과 맞아야 하기 때문이다.
  캐시 삭제 실패를 `EXIT_API_ERROR` 로 보고하면 코드를 읽는 사람이 매번 왜 API 오류인지 되묻는다.
  추가는 기존 값의 의미를 바꾸지 않아 기존 자동화가 깨지지 않는다.
- 지울 캐시가 없는 경우를 실패로 만들지 않는 이유는 사용자가 원한 상태가 이미 이뤄져 있기 때문이다.
  `cache clear` 는 캐시를 없애는 것이 목적이고, 없는 것을 없애라고 한 것도 목적을 만족한다.
