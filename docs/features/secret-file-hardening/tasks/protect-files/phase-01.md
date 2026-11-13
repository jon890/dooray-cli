# Phase 01. config-warning

**Execution profile**: standard

## 목표

assessConfigFileSecurity 순수 함수가 SECRET_FIELDS 와 isStorableSecret 로 등급·필드 이름·안내만 반환한다. readConfigFileSecurity 는 stat 실패만 건너뛰고 파일의 평문을 읽는다. getConfigOrThrow 와 config get 은 ok 상태에서만 warnConfigFileSecurity 를 호출하며 프로세스당 한 번만 fail 발견을 stderr 로 쓴다. config set 은 경고 경로를 호출하지 않는다.

**범위 외**: 새 인증 방식과 외부 API 호출.

## 컨텍스트

**요구사항**: REQ1, REQ9, REQ2, REQ3

**근거 문서**: `docs/features/secret-file-hardening/spec.md`, `docs/features/secret-file-hardening/design.md`, `docs/adr/079-secret-file-exposure-warning.md`

기존 `src/config/store.ts` 의 ensureDir 와 writeConfigFile 을 따른다. getConfig 는 키체인을 읽을 수 있으므로 테스트는 가짜 저장소를 주입한다. 실제 키체인은 별도 macOS CLI 검증에서 임시 HOME 의 경로 해시 account 만 사용한다.

## 의도 메모

읽기 자동 수리와 일괄 chmod 는 하지 않는다. 저장 때만 바꾸고 원래 오류 전파를 유지한다.

## 작업 항목

### 1. 구현과 문서

assessConfigFileSecurity 순수 함수가 SECRET_FIELDS 와 isStorableSecret 로 등급·필드 이름·안내만 반환한다. readConfigFileSecurity 는 stat 실패만 건너뛰고 파일의 평문을 읽는다. getConfigOrThrow 와 config get 은 ok 상태에서만 warnConfigFileSecurity 를 호출하며 프로세스당 한 번만 fail 발견을 stderr 로 쓴다. config set 은 경고 경로를 호출하지 않는다.

getConfigOrThrow(options?: { securityWarning?: boolean }) 의 기본값은 true 이고 resetConfigFileSecurityWarningForTest 를 내보낸다.

### 2. 개발 테스트

`src/config/file-security.test.ts`, `src/config/store.security.test.ts`, `src/commands/config.test.ts` 를 작성하거나 수정한다.

file-security.test.ts 에 OS·mode·비밀값·저장소 조합과 값 비노출을 검증한다. store.security.test.ts 는 hoisted homedir 와 가짜 SecretStore 로 한 번 경고·억제·미완료 경고·읽기 전후 내용/권한/mtime 불변·저장 뒤 fail 없음·config get 경고를 확인한다. config.test.ts 의 mock 에 경고 함수를 추가한다.

가짜 저장소가 null 이고 0600 평문인 경우, 저장소가 있고 0600 파일에 비ASCII imapPassword 만 있는 경우 stderr 가 비어 있어야 한다(REQ5, REQ9). 저장소가 null 이고 0644 비밀값이 있는 파일은 권한 경고만, 0644 비밀값 없는 파일은 경고 없음, 경고 뒤 저장소 set·delete 미호출, stdout·반환값 불변을 확인한다. `src/config/store.test.ts` 와 `src/config/store.keychain.test.ts` 의 fs mock 에 stat 을 추가한다.

## 검증

```bash
pnpm exec vitest run src/config
pnpm exec vitest run src/config/file-security.test.ts src/config/store.security.test.ts src/config/store.test.ts src/config/store.keychain.test.ts src/commands/config.test.ts
pnpm tsc --noEmit
pnpm run build
node scripts/check-pii.mjs
node scripts/check-public-refs.mjs
```

모두 종료 코드 0 이어야 한다. 전체 pnpm test 와 pnpm verify:package 는 마지막 phase 뒤 누적 개발 검증에서 실행한다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/config/file-security.ts` | 신규 |
| `src/config/file-security.test.ts` | 신규 |
| `src/config/store.security.test.ts` | 신규 |
| `src/config/store.ts` | 수정 |
| `src/commands/config.ts` | 수정 |
| `src/commands/config.test.ts` | 수정 |
| `src/config/store.test.ts` | 수정 |
| `src/config/store.keychain.test.ts` | 수정 |
