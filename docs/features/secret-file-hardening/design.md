# 비밀값·캐시 파일 보호 강화 기술 설계

스펙: [spec.md](spec.md)

## 요구사항 연결

| ID | 해결 방법 |
| --- | --- |
| REQ1 | `getConfigOrThrow` 와 `config get` 이 `config.json` 의 보안 판정에서 `fail` 등급을 stderr 로 한 번 낸다 |
| REQ2 | 같은 판정이 macOS·Linux 에서 파일 권한의 그룹·기타 비트를 보고, 비밀값이 있을 때만 `fail` 로 낸다 |
| REQ3 | 판정은 `stat` 과 읽기만 한다. 경고 경로는 쓰기 함수를 부르지 않는다 |
| REQ4 | `doctor` 가 같은 판정을 「보안」 절과 `--json` 의 `checks` 목록으로 보인다 |
| REQ5 | 저장소가 없는 OS 의 평문은 판정의 `warn` 등급이다. 명령 경고는 `fail` 등급만 낸다 |
| REQ6 | `src/cache/store.ts` 의 `writeJson` 이 폴더를 0700 으로 맞추고, 파일을 0600 tmp 파일에 쓴 뒤 rename 한다 |
| REQ7 | 캐시 권한 맞추기의 `chmod` 실패는 삼키고 기록하지 않는다 |
| REQ8 | `src/cache/last-run.ts` 의 `writeLastRun` 이 `~/.dooray` 를 0700 으로 만들고, tmp 이름에 pid 와 UUID 를 넣는다 |
| REQ9 | 판정이 평문 값마다 키체인에 넣을 수 있는지(`isStorableSecret`)를 본다. 넣을 수 없으면 `warn` 등급의 별도 발견으로 내고 명령 경고에서 뺀다 |
| REQ10 | `doctor` 가 `checks` 에 `fail` 이 하나라도 있으면 `process.exitCode = 1` 로 끝난다 |

## 책임과 경계

| 자리 | 책임 |
| --- | --- |
| `src/config/file-security.ts` (새 파일) | 순수 함수 `assessConfigFileSecurity`. 입력 타입도 이 파일이 정의한다. 파일 시스템, `process.platform`, 출력에 닿지 않는다 |
| `src/config/store.ts` | `readConfigFileSecurity()` 를 내보낸다. `stat` 과 기존 `readConfigFile` 로 입력을 모아 위 함수를 부른다. `warnConfigFileSecurity()` 가 결과의 `fail` 을 프로세스마다 한 번 stderr 로 낸다. `getConfigOrThrow` 가 이것을 부른다 |
| `src/commands/config.ts` | `config get` 이 설정을 읽은 뒤 `warnConfigFileSecurity()` 를 부른다 |
| `src/commands/doctor.ts` | 같은 판정을 표시하고 `checks` 와 종료 코드를 정한다 |
| `src/cache/store.ts`, `src/cache/last-run.ts` | 각자의 파일 쓰기 권한을 맞춘다 |

`file-security.ts` 는 `secret-store.ts` 의 `SECRET_FIELDS`·`SecretField`·`isStorableSecret` 만 가져온다. `store.ts` 를 가져오지 않으므로 순환 의존이 없다.
계층과 의존 방향은 바뀌지 않는다(`docs/code-architecture.md` 「모듈 의존 관계」).
`store.ts` 가 stderr 에 쓰는 선례는 이미 있다(`writeConfig` 의 키체인 이전 실패 경고).
판정을 순수 함수로 떼는 이유는 OS 와 권한의 조합을 실제 파일 없이 테스트하기 위해서다.

## 인터페이스와 데이터

판정 함수의 입력은 아래 값이다.

| 입력 | 뜻 |
| --- | --- |
| `platform` | `NodeJS.Platform`. 부르는 쪽이 `process.platform` 을 넘긴다 |
| `mode` | `config.json` 의 `stat().mode`. `stat` 이 실패하면 `undefined` 다 |
| `stored` | 파일에 적힌 비밀 필드 값과 `trackLastRun`. `Partial<Record<SecretField, string>> & { trackLastRun?: boolean }` 로 이 파일에 정의한다 |
| `hasSecretStore` | `getSecretStore(CONFIG_PATH) !== null` |

판정 결과는 발견의 배열이다.

| 종류 | 조건 | 등급 | 안내 |
| --- | --- | --- | --- |
| `plaintext-secret` | `hasSecretStore`. 파일에 비어 있지 않고 `isStorableSecret` 인 비밀 필드가 있다 | `fail` | `dooray config set track-last-run <현재 값>` |
| `plaintext-unstorable` | `hasSecretStore`. 파일에 비어 있지 않고 `isStorableSecret` 이 아닌 비밀 필드가 있다 | `warn` | 키체인에 옮길 수 없어 평문으로 남는다. 값을 바꾸면 옮겨진다 |
| `wide-permission` | `platform` 이 `win32` 가 아니다. `mode` 가 있다. 파일에 비어 있지 않은 비밀 필드가 있다. `mode & 0o077` 이 0 이 아니다 | `fail` | `plaintext-secret` 과 같은 `config set` 한 번. 저장이 tmp 파일과 rename 으로 0600 을 만든다(`writeConfigFile`) |
| `plaintext-no-store` | `hasSecretStore` 가 아니다. 파일에 비어 있지 않은 비밀 필드가 있다 | `warn` | 이 OS 는 암호화 저장소를 아직 지원하지 않는다 |

- 발견에는 필드 이름만 담고 값은 담지 않는다. 판정은 `SECRET_FIELDS` 를 그대로 돌므로 비밀 필드가 늘면 따라간다.
- 안내 문구에는 필드와 `config set` 키의 대응표가 필요 없다. 고치는 명령이 비밀값과 무관한 키 하나이기 때문이다.
- `<현재 값>` 은 `stored.trackLastRun === true` 면 `true`, 아니면 `false` 다. 지금 동작은 없음과 `false` 가 같다(`src/index.ts` 의 `trackLastRun &&`). 그래서 이 명령은 동작을 바꾸지 않는다.
- `stat` 이 실패하면 `wide-permission` 만 판정하지 않는다. 평문 판정은 파일 내용만으로 한다.

`getConfigOrThrow(options?: { securityWarning?: boolean })` 로 바꾼다. 기본값은 `true` 다.

- `getConfig` 가 `ok` 일 때만 판정한다. `absent`·`invalid`·`unreadable` 이면 이미 다른 오류로 끝난다.
- 판정은 설정이 「미완료」 여도 한다. 평문이 있으면 미완료 오류보다 먼저 경고가 나간다.
- 경고는 모듈 변수로 프로세스마다 한 번만 낸다. 테스트는 모듈을 다시 불러 초기화한다.
- `doctor` 는 `getConfigOrThrow` 를 부르는 두 자리(`probeApiConnection`, 텍스트 모드의 연결 성공 뒤 `me` 읽기) 모두 `securityWarning: false` 로 부른다. 같은 내용을 「보안」 절에 보이므로 stderr 에 다시 내지 않는다.

`doctor --json` 의 기존 평면 키(`configState`, `apiKeyOk`, `baseUrlOk`, `apiConnection`, `skill`, `reason`, `source`)는 그대로 둔다.
`checks` 배열을 더한다. 원소는 `{ id, status: "pass" | "warn" | "fail", message, fix? }` 다. 설정 상태마다 넣는 항목은 아래와 같다.

| `configState` | `config` | `api-key`·`base-url` | `api-connection` | `config-file-security` |
| --- | --- | --- | --- | --- |
| `ok` | `pass` | 값이 있으면 `pass`, 없으면 `fail` | 둘 다 있으면 시도해서 `pass`·`fail`. 아니면 넣지 않는다 | 판정에 `fail` 이 있으면 `fail`, `warn` 만 있으면 `warn`, 없으면 `pass` |
| `absent` | `fail`(설정 없음, `dooray setup` 안내) | 넣지 않는다 | 넣지 않는다 | 넣지 않는다 |
| `invalid` | `fail` | 넣지 않는다 | 넣지 않는다 | 넣지 않는다 |
| `unreadable` | `fail`(`source` 가 `keychain` 이면 키체인 실패) | 넣지 않는다 | 넣지 않는다 | `source` 가 `keychain` 이면 판정해서 넣는다. 파일은 읽혔기 때문이다. 파일 읽기 실패면 넣지 않는다 |

- `api-key`·`base-url` 은 설정이 `ok` 일 때만 넣는다. 손상과 미설정이 겹쳐 보이지 않게 하기 위해서다.
- 스킬 상태는 `checks` 에 넣지 않는다(스펙 REQ10). 텍스트의 빨간 「미설치」 표시는 그대로 둔다.
- 텍스트 모드는 「보안」 절을 설정 절 아래에 둔다. `fail` 은 ❌ 와 고치는 명령, `warn` 은 ⚠️ 로 보인다.

캐시 쓰기(`writeJson`)는 `docs/pitfalls/code-review/sensitive-file-mode-missing.md` 의 Good 형태를 따른다.

1. `mkdir(dir, { recursive: true, mode: 0o700 })` 뒤에 `CACHE_DIR` 과 `dir` 을 `chmod 0o700` 한다.
2. `<path>.<pid>.<UUID>.tmp` 에 `writeFile(…, { mode: 0o600, flag: "wx" })` 로 쓰고 `rename` 한다. 실패하면 tmp 를 지우고 원래 오류를 던진다. 지금 `writeJson` 의 실패 동작(호출부로 전파)과 같다.
3. `chmod` 의 실패는 모두 삼킨다. POSIX 권한이 없는 파일 시스템이 여기에 든다.

직전 실행 기록(`writeLastRun`)도 같은 방식으로 바꾼다. `~/.dooray` 를 `mode: 0o700` 으로 만들고 `chmod` 를 시도하며, tmp 이름에 pid 와 UUID 를 넣고 `wx` 로 연다.
캐시의 스키마와 TTL 은 바뀌지 않는다.

## 실패와 일관성

- 판정과 `getConfig` 가 파일을 따로 읽으므로 그 사이에 파일이 바뀔 수 있다. 그 경우 경고가 한 번 틀릴 뿐 데이터에는 영향이 없다.
- 동시에 도는 CLI 들은 각자 경고한다. 파일을 고치지 않으므로 경쟁이 없다.
- 캐시와 실행 기록은 tmp 이름이 프로세스마다 달라 동시 쓰기가 서로의 tmp 를 덮지 않는다. rename 은 원자적이라 읽는 쪽은 이전 파일이나 새 파일 중 하나를 본다.
- 호환: 저장 형식이 바뀌지 않는다. 구버전 CLI 와 `dooray-persona` 스크립트는 같은 파일을 그대로 읽는다.
- `doctor` 종료 코드가 0 에서 1 로 바뀌는 환경이 생긴다. 지금 API 키가 막힌 사용자는 연결 실패로 1 이 된다(스펙 DECISION10).
- macOS 와 Linux 가 같은 `config.json` 을 동기화하면, 경고대로 `config set` 을 돌린 순간 파일에서 평문이 빠져 Linux 쪽이 「설정 미완료」 가 된다. [ADR-069](../../adr/069-macos-keychain-secret-store.md) 가 감수한 동작이다. 새 ADR 의 「감당할 것」 에 적는다.
- POSIX 권한이 늘 넓게 보이는 파일 시스템에 비밀값이 든 `config.json` 이 있으면, `config set` 으로도 `wide-permission` 이 풀리지 않는다. 드문 환경이라 감수하고 ADR 에 적는다.

## 검증 전략

| ID | 경계 | 방법 |
| --- | --- | --- |
| REQ1, REQ9, REQ2, REQ5 | `assessConfigFileSecurity` | 새 `src/config/file-security.test.ts`. 순수 함수라 mock 이 없다. OS(`darwin`·`linux`·`win32`), `mode`(0600·0644·0640·없음), 비밀 필드(없음·`apiKey`·비ASCII `imapPassword`·빈 문자열), 저장소 유무의 조합 |
| REQ1, REQ3 | `getConfigOrThrow`, `config get` | 새 테스트 파일 하나. `store.fs.test.ts` 처럼 hoisted `homedir` mock 으로 실제 임시 HOME 을 쓰고, `secret-store.js` 를 mock 해 가짜 저장소를 넣는다. `store.keychain.test.ts` 는 `node:fs/promises` 를 통째로 mock 하고 `stat` 이 없어 이 판정을 관측하지 못하므로 쓰지 않는다. stderr 한 번, 두 번 불러도 한 번, `securityWarning: false` 면 없음, 호출 뒤 파일 내용·권한·mtime 이 같음 |
| REQ1 (고친 뒤 경고 없음) | `setConfigValue` → `readConfigFileSecurity` | 같은 파일에서 `config set track-last-run` 경로로 저장한 뒤 `readConfigFileSecurity()` 의 `fail` 이 빈 목록인지 본다. stderr 로 보지 않는다. 한 번만 내는 표시 때문에 증거가 되지 않기 때문이다 |
| REQ4, REQ10 | `doctor` | `doctor.test.ts` 의 store mock 에 `readConfigFileSecurity` 를 더한다. `fail` 발견, 미설정, 연결 실패면 `checks` 와 `process.exitCode === 1`, `warn` 만이면 0, 스킬 미설치만이면 0. `afterEach` 에서 `process.exitCode` 를 되돌린다(`src/commands/post/file/download-all.test.ts` 선례) |
| REQ6, REQ7 | `writeJson` | `src/cache/store.test.ts` 는 `CACHE_DIR` 이 모듈을 불러올 때 고정되는데 테스트마다 HOME 을 바꿔 다시 import 한다. 테스트마다 `vi.resetModules()` 를 하도록 고친다. 0755 폴더·0644 파일을 만들고 다시 써서 0700·0600 을 확인한다. REQ7 은 `node:fs/promises` 의 `chmod` 만 실패하게 하는 별도 테스트 파일에서 쓰기 성공과 stderr 없음을 확인한다 |
| REQ8 | `writeLastRun` | 임시 HOME 에 `~/.dooray` 가 없을 때 쓰면 0700 이고, 같은 프로세스에서 두 번 동시에 불러도 `last-run.json` 이 올바른 JSON 이다 |
| 전체 | 빌드한 CLI, macOS | 임시 HOME 에 0644 평문 `config.json` 을 만들고 `dooray project list` 를 돌려 경고를 확인한다. 안내 명령 뒤 경고가 사라지는지 본다. 이 경로는 실제 로그인 키체인에 경로 해시 account 항목을 만들므로 확인 뒤 지운다([ADR-069](../../adr/069-macos-keychain-secret-store.md) 「account 규칙」) |

Linux 의 권한 경고와 Windows 의 생략은 단위 테스트로만 본다. 실측 환경이 없다.

## 결정

| ID | 결정 | 답 | 누가 | 근거 |
| --- | --- | --- | --- | --- |
| DECISION1 | 경고를 거는 자리 | `getConfigOrThrow` 와 `config get` | 작성자 | 설정을 읽어 쓰는 명령은 `getConfigOrThrow` 를 거친다. `config get` 만 `getConfig` 를 직접 부른다(`src/commands/config.ts:49`). `config set`·`setup`·실행 기록은 저장 경로라 경고하지 않는다(스펙 DECISION11) |
| DECISION2 | 판정 함수의 형태 | OS·권한·비밀 필드·저장소 유무를 인자로 받는 순수 함수. 입력 타입은 그 파일이 정의한다 | 작성자 | OS 조합을 실제 파일 없이 테스트한다. `store.ts` 의 비공개 타입을 가져오면 순환 의존이 생긴다 |
| DECISION3 | 경고 횟수 | 프로세스마다 한 번 | 작성자 | `doctor` 처럼 설정을 여러 번 읽는 명령이 있다 |
| DECISION4 | `doctor --json` 의 모양 | 기존 평면 키를 두고 `checks` 배열을 더한다 | 작성자 | 기존 키를 읽는 자동화가 깨지지 않는다 |
| DECISION5 | 캐시·실행 기록 쓰기 | 0600 tmp 파일에 쓰고 rename 한다 | 작성자 | 함정 문서의 Good 형태다. 이미 있는 0644 파일을 덮어쓸 때 `mode` 만으로는 권한이 바뀌지 않는다 |
| DECISION6 | 고치는 명령 | `config set track-last-run <현재 값>` | 작성자 | 저장할 때 옮기는 [ADR-069](../../adr/069-macos-keychain-secret-store.md) 경로다. 현재 값을 다시 쓰므로 동작이 바뀌지 않는다 |
| DECISION7 | `doctor` 의 `checks` 를 넣는 조건 | 위 「설정 상태마다 넣는 항목」 표 | 작성자 | 손상과 미설정이 겹쳐 실패가 두 번 세지지 않게 한다 |

## 결정 기록 연결

| 결정 | 종류 | ADR 또는 필요 없음의 이유 | 현재 규칙의 원본 |
| --- | --- | --- | --- |
| 스펙 DECISION1, DECISION2, DECISION10, DECISION12 | architecture (areas: security) | 새 [ADR-079](../../adr/079-secret-file-exposure-warning.md) 를 둔다. 기각한 대안: 읽을 때 자동 수리, `doctor` 만 알림, 늘 0 | `src/config/file-security.ts`, `src/commands/doctor.ts`, `src/cache/store.ts` |
| 캐시 권한 | 같은 ADR | [ADR-004](../../adr/004-disk-cache.md)·[ADR-010](../../adr/010-cache-file-split.md) 은 캐시 구조의 결정이라 고치지 않는다. 권한은 `docs/data-schema.md` 의 캐시 절에 한 줄 더한다 | `docs/data-schema.md` |

[ADR-069](../../adr/069-macos-keychain-secret-store.md) 는 고치지 않는다. 그 ADR 의 「읽을 때 옮기기」 기각을 새 ADR 이 그대로 따른다.
