# Phase 01. `getConfig` 가 세 실패 상황을 구분하게 한다

**Execution profile**: deep

## 목표

`getConfig` 의 반환형을 판별 가능한 결과 객체로 바꿔, 파일 부재와 손상과 읽기 실패를 구분한다.
호출부 일곱 곳이 각 상태를 명시적으로 다루게 한다.

**범위 외**: 오류 메시지에서 내부 ADR 번호를 빼는 것은 phase 02 다.
`~/.dooray/config.json` 의 스키마를 바꾸지 않는다. 마이그레이션이 없다.
`getConfigOrThrow` 의 시그니처를 바꾸지 않는다. 안내 문구만 상태별로 갈린다.

## 컨텍스트

**근거 문서**: `docs/adr/049-config-read-result-states.md`,
`docs/adr/042-cache-invalidation-on-mutation.md`,
`docs/pitfalls/code-review/json-parse-as-type-assertion.md`.

현재 `src/config/store.ts` 의 `getConfig` 는 이렇다.

```ts
export async function getConfig(): Promise<Config | null> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as Config;
  } catch {
    return null;
  }
}
```

`null` 이 되는 경우가 셋인데 호출부는 그것을 「설정이 없다」로만 읽는다.

`getConfig` 를 직접 부르는 자리는 다섯이다.
`src/index.ts:165`, `src/commands/setup.ts:21`, `src/commands/doctor.ts:41`,
`src/commands/config.ts:57`, `src/services/config.ts:59` 와 `61` 이다.
`src/config/store.ts` 안에서도 둘이 부른다. `getConfigOrThrow` 와 `setConfigValue` 와 `clearMailCredentials` 다.

실제 위치는 grep 으로 다시 확인한다.

```bash
# cwd: <repo root>
grep -rn "getConfig()" src --include="*.ts"
```

**이미 있는 부분 대응을 지우지 않는다.**
`src/services/config.ts:63` 부터 `72` 까지가 저장 **뒤** 되읽기 실패를 경고로 다룬다.
그 주석이 「`getConfig` 가 모든 오류를 `null` 로 삼키므로」라고 원인을 적고 있다.
이 phase 가 원인을 없애므로 그 분기의 판정을 새 상태로 바꾼다. 경고 자체는 유지한다.

이슈가 지적한 자리는 저장 **앞**의 `prev` 다.
손상된 파일이 `null` 이 되어 「이전 설정이 없다」로 읽히고,
`shouldInvalidateCache` 가 `false` 를 돌려줘 계정을 바꿔도 캐시가 남는다.
캐시 디렉터리가 계정별로 나뉘지 않으므로 (ADR-042) 다음 조회가 다른 계정의 데이터를 쓴다.

## 의도 메모

- 별도 함수를 두는 방식을 기각했다. 구분이 필요한 자리에서 새 함수를 부르는 것을 사람이 기억해야 한다.
  이번에 발견된 세 오판이 모두 그 종류이고 아무 검사도 잡지 못했다.
- 예외를 던지는 방식을 기각했다. 파일 부재가 정상 상태인데 예외로 만들면 모든 호출부가 감싸야 한다.
- 스키마 검증 라이브러리를 넣지 않는다. `Config` 는 평평한 객체이고 타입 가드 함수 하나로 충분하다.
- 읽기 실패에서 캐시를 지운다. 이전 계정을 알 수 없는 상태이고, 남기면 증상이 조용하다.
  지우면 다음 조회가 느려질 뿐이라 두 비용이 대칭이 아니다.
- 여러 줄 오류 메시지를 테스트할 때 정규식 하나로 두 패턴을 이어 검사하지 않는다.
  메시지에 줄바꿈이 있어 `.` 가 그것을 넘지 못해 테스트가 항상 실패한다.
  메시지에 각 문구가 들어 있는지를 따로 확인한다.
- 테스트 대상 파일 자체를 `vi.mock` 하지 않는다. 같은 파일 안의 함수 참조가 교체되지 않아 실제 구현이 불린다.

## 작업 항목

### 1. `src/config/store.ts` 에 결과 타입과 타입 가드를 둔다

`ConfigReadResult` 를 export 한다. 판별 필드는 `state` 다.

```ts
export type ConfigReadResult =
  | { state: "ok"; config: Config }
  | { state: "absent" }
  | { state: "invalid"; reason: string }
  | { state: "unreadable"; reason: string };
```

`reason` 은 사람에게 보여줄 짧은 설명이다. 원래 오류의 `message` 를 넣는다.

`isConfig(value: unknown): value is Config` 를 export 한다.
`Config` 의 필수 필드를 확인한다. `src/config/types.ts` 를 읽어 무엇이 필수인지 확정한다.
`version` 과 `apiKey` 와 `baseUrl` 이 필수로 보이지만 그 파일을 근거로 판정한다.
선택 필드는 있으면 타입만 본다.

### 2. `getConfig` 가 `ConfigReadResult` 를 돌려주게 한다

- `readFile` 이 `ENOENT` 로 실패하면 `{ state: "absent" }` 다.
  `err.code === "ENOENT"` 로 판정한다. 메시지 문자열로 판정하지 않는다.
- `readFile` 이 그 밖의 이유로 실패하면 `{ state: "unreadable", reason }` 이다.
  권한과 입출력 오류가 여기 온다.
- `JSON.parse` 가 던지면 `{ state: "invalid", reason }` 이다.
- 파싱은 됐지만 `isConfig` 가 거짓이면 `{ state: "invalid", reason }` 이다.
  `reason` 은 어느 필드가 문제인지 담는다.
- 모두 통과하면 `{ state: "ok", config }` 다.

`as Config` 단언을 쓰지 않는다.

### 3. `getConfigOrThrow` 가 상태별로 다르게 안내한다

`EXIT_CONFIG_ERROR` 는 그대로 쓴다. 문구만 갈린다.

- `absent` 이거나 `ok` 인데 `apiKey` 나 `baseUrl` 이 비었으면 지금 문구를 유지한다.
  「설정이 완료되지 않았습니다. 먼저 초기 설정을 진행하세요: `dooray setup`」 이다.
- `invalid` 이면 설정 파일이 손상됐다는 것과 파일 경로와 `reason` 을 담는다.
  `dooray setup` 으로 다시 만들 수 있다는 것도 적는다.
- `unreadable` 이면 설정 파일을 읽지 못했다는 것과 파일 경로와 `reason` 을 담는다.
  권한을 확인하라는 안내를 넣는다. `dooray setup` 을 안내하지 않는다.
  저장도 같은 이유로 실패할 것이기 때문이다.

파일 경로는 `CONFIG_PATH` 를 그대로 쓴다. 홈 디렉터리가 그 안에 들어가지만
사용자 자신의 경로이고 저장소에 남지 않는다.

### 4. `setConfigValue` 와 `clearMailCredentials` 를 고친다

`setConfigValue` 는 `absent` 일 때만 기본값으로 새 설정을 만든다.
`invalid` 나 `unreadable` 이면 던진다. 손상된 파일을 기본값으로 덮으면 남은 설정이 사라진다.
문구는 `getConfigOrThrow` 의 해당 상태 문구와 같은 뜻으로 쓴다.

`clearMailCredentials` 의 반환형을 바꾼다.
지금 `boolean` 이라 「읽지 못했다」와 「자격 증명이 없었다」를 구별하지 못한다.

```ts
export type ClearMailResult =
  | { state: "cleared"; hadCredentials: boolean }
  | { state: "absent" }
  | { state: "failed"; reason: string };
```

`absent` 이면 지울 것이 없으므로 `{ state: "absent" }` 다.
`invalid` 나 `unreadable` 이면 `{ state: "failed", reason }` 이다.
`ok` 이면 지금처럼 지우고 `hadCredentials` 를 담는다.

호출부를 찾아 함께 고친다.

```bash
# cwd: <repo root>
grep -rn "clearMailCredentials" src --include="*.ts"
```

### 5. `src/services/config.ts` 의 캐시 무효화 판정을 고친다

`prev` 를 읽는 자리가 이슈의 핵심이다.

- `prev.state` 가 `absent` 이면 지금처럼 무효화하지 않는다. 지울 근거가 없다.
- `prev.state` 가 `invalid` 나 `unreadable` 이면 **무효화한다.**
  이전 계정을 알 수 없으므로 보수적으로 지운다.
  그 사실을 stderr 로 알린다. 이전 설정을 읽지 못해 캐시를 비웠다는 뜻으로 쓴다.
- `prev.state` 가 `ok` 이면 `shouldInvalidateCache(prev.config, next.config)` 로 판정한다.

`next` 를 읽는 자리는 기존 경고를 유지하고 판정만 새 상태로 바꾼다.
`next.state` 가 `ok` 가 아니면 지금 있는 경고를 낸다.
그 경고의 주석에서 「`getConfig` 가 모든 오류를 `null` 로 삼키므로」 를 고친다.
이 phase 가 그 원인을 없앴으므로 사실과 달라진다.

`shouldInvalidateCache` 의 시그니처는 바꾸지 않는다.
`Config` 둘을 받고 이전 설정이 없는 경우의 처리는 부르는 쪽이 맡는다.
그 함수 주석의 「이전 설정이 없으면 판정 자체가 무의미하므로 `false` 다」 는 그대로 유효하다.

### 6. 나머지 호출부 넷을 고친다

`src/index.ts`, `src/commands/setup.ts`, `src/commands/doctor.ts`, `src/commands/config.ts` 다.

`src/commands/doctor.ts` 가 이 구분을 가장 잘 쓸 수 있는 자리다.
설정 진단이 목적인 명령이므로 네 상태를 각각 다르게 안내한다.
`absent` 는 미설정, `invalid` 는 손상, `unreadable` 은 읽기 실패, `ok` 는 지금 흐름이다.
`--json` 출력에 `configState` 를 담아 자동화가 판정할 수 있게 한다.

`src/commands/setup.ts` 는 기존 값을 기본값으로 보여주는 데 `getConfig` 를 쓴다.
`ok` 가 아니면 기본값 없이 진행한다. 손상된 파일의 값을 기본값으로 보여주지 않는다.
`unreadable` 이면 저장도 실패할 가능성이 높으므로 그 사실을 먼저 알린다.

`src/index.ts` 와 `src/commands/config.ts` 는 각자 하는 일에 맞춰 고친다.
그 자리에서 상태를 구별할 이유가 없으면 `ok` 만 통과시키고 나머지를 하나로 다룬다.
왜 구별하지 않는지 주석으로 한 줄 남긴다.

### 7. `src/config/store.test.ts` 로 네 상태를 검증하는 테스트를 만든다

임시 디렉터리를 만들어 실제 파일로 검증한다. `node:fs` 의 `mkdtemp` 를 쓴다.
`CONFIG_PATH` 가 모듈 상수이므로 그것을 바꿀 방법을 먼저 확인한다.
바꿀 수 없으면 `readFile` 을 주입 가능하게 리팩터링하거나
`vi.mock("node:fs/promises")` 로 그 모듈만 mock 한다.
테스트 대상 파일 자체는 mock 하지 않는다.

검증할 것은 이렇다.

- 파일이 없으면 `state` 가 `absent` 다.
- 깨진 JSON 이면 `state` 가 `invalid` 다.
- 유효한 JSON 이지만 `apiKey` 가 없으면 `state` 가 `invalid` 다.
- 권한 오류를 내면 `state` 가 `unreadable` 다.
- 온전한 파일이면 `state` 가 `ok` 이고 `config` 가 그 값이다.
- `isConfig` 가 필수 필드가 빠진 객체를 거짓으로 판정한다.
- `isConfig` 가 타입이 다른 필드를 거짓으로 판정한다.
- `getConfigOrThrow` 가 `invalid` 에서 `dooray setup` 을 안내하지 않는다.
  안내 문구에 손상됐다는 뜻이 들어간다.
- `getConfigOrThrow` 가 `unreadable` 에서 `dooray setup` 을 안내하지 않는다.
- `getConfigOrThrow` 가 `absent` 에서 `dooray setup` 을 안내한다.
- 세 경우 모두 종료 코드가 `EXIT_CONFIG_ERROR` 다.

### 8. `src/services/config.test.ts` 에 캐시 무효화 판정 테스트를 더한다

기존 파일에 더한다.

- 이전 설정이 `absent` 이면 캐시를 지우지 않는다.
- 이전 설정이 `invalid` 이면 캐시를 지운다.
- 이전 설정이 `unreadable` 이면 캐시를 지운다.
- 이전 설정이 `ok` 이고 `apiKey` 가 바뀌면 캐시를 지운다.
- 이전 설정이 `ok` 이고 같은 값을 다시 넣으면 지우지 않는다.
- `invalid` 로 지울 때 stderr 에 이유가 나온다.

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm run build
pnpm test
```

셋 다 통과해야 한다. 이 phase 의 테스트를 따로 돌린다.

```bash
# cwd: <repo root>
pnpm vitest run src/config/store.test.ts src/services/config.test.ts
```

단언과 낡은 반환형이 남지 않았는지 확인한다.

```bash
# cwd: <repo root>
grep -c "as Config" src/config/store.ts                    # = 0
grep -c "Config | null" src/config/store.ts                # = 0
grep -c "isConfig" src/config/store.ts                     # >= 1
grep -c "ConfigReadResult" src/config/store.ts             # >= 1
grep -rc "getConfig()" src --include="*.ts" | grep -c ":0" # 참고용
```

앞 넷이 기대값과 맞아야 한다.

호출부를 빠뜨리지 않았는지 타입 검사가 판정한다.
`pnpm tsc --noEmit` 이 통과하면 반환형이 바뀐 자리를 모두 고친 것이다.
`state` 를 보지 않고 `config` 에 접근하는 코드는 컴파일되지 않는다.

손상된 파일에서 실제 동작을 확인한다.

```bash
# cwd: <repo root>
cp ~/.dooray/config.json /tmp/dooray-config.bak
printf '{' > ~/.dooray/config.json
node dist/index.js doctor 2>&1 | grep -c "setup"      # = 0
node dist/index.js doctor 2>&1 | grep -c "손상"        # >= 1
cp /tmp/dooray-config.bak ~/.dooray/config.json
```

첫 grep 이 0 이고 둘째가 1 이상이어야 한다.
**백업과 복구를 반드시 함께 실행한다.** 이 명령이 사용자의 설정 파일을 덮어쓴다.

개인 식별 정보 검사를 통과시킨다.

```bash
# cwd: <repo root>
bash scripts/check-pii.sh
```

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/config/store.ts` | 수정 |
| `src/config/store.test.ts` | 신규 |
| `src/services/config.ts` | 수정 |
| `src/services/config.test.ts` | 수정 |
| `src/index.ts` | 수정 |
| `src/commands/setup.ts` | 수정 |
| `src/commands/doctor.ts` | 수정 |
| `src/commands/config.ts` | 수정 |
