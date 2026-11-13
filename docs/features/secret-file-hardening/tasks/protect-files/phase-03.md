# Phase 03. private-cache

**Execution profile**: standard

## 목표

writeJson 과 writeLastRun 은 0700 디렉터리 생성·chmod 시도 후 pid 와 UUID 를 담은 wx tmp 를 0600 으로 쓰고 rename 한다. 실패 시 자기 tmp 를 지우고 오류를 전파한다. chmod 실패만 조용히 무시한다. 캐시 스키마와 TTL 은 그대로다.

**범위 외**: 새 인증 방식과 외부 API 호출.

## 컨텍스트

**요구사항**: REQ6, REQ7, REQ8

**근거 문서**: `docs/features/secret-file-hardening/spec.md`, `docs/features/secret-file-hardening/design.md`, `docs/adr/079-secret-file-exposure-warning.md`

기존 `src/config/store.ts` 의 ensureDir 와 writeConfigFile 을 따른다. getConfig 는 키체인을 읽을 수 있으므로 테스트는 가짜 저장소를 주입한다. 실제 키체인은 별도 macOS CLI 검증에서 임시 HOME 의 경로 해시 account 만 사용한다.

## 의도 메모

읽기 자동 수리와 일괄 chmod 는 하지 않는다. 저장 때만 바꾸고 원래 오류 전파를 유지한다.

## 작업 항목

### 1. 구현과 문서

writeJson 과 writeLastRun 은 0700 디렉터리 생성·chmod 시도 후 pid 와 UUID 를 담은 wx tmp 를 0600 으로 쓰고 rename 한다. 실패 시 자기 tmp 를 지우고 오류를 전파한다. chmod 실패만 조용히 무시한다. 캐시 스키마와 TTL 은 그대로다.

### 2. 개발 테스트

`src/cache/store.test.ts`, `src/cache/store.permissions.test.ts`, `src/cache/last-run.test.ts` 를 작성하거나 수정한다.

store.test.ts 는 매번 resetModules 하고 임시 HOME 에서 신설/기존 0755·0644 캐시를 쓰고 0700·0600 을 본다. store.permissions.test.ts 는 chmod 만 실패시켜 쓰기 성공과 출력 불변을 본다. last-run.test.ts 는 신설 HOME, 동시 쓰기, 유효한 JSON 과 tmp 잔여 없음, 기존 넓은 권한 교체를 본다.

## 검증

```bash
pnpm exec vitest run src/cache/store.test.ts src/cache/store.permissions.test.ts src/cache/last-run.test.ts
pnpm tsc --noEmit
pnpm run build
node scripts/check-pii.mjs
node scripts/check-public-refs.mjs
```

모두 종료 코드 0 이어야 한다. 전체 pnpm test 와 pnpm verify:package 는 마지막 phase 뒤 누적 개발 검증에서 실행한다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/cache/store.ts` | 수정 |
| `src/cache/store.test.ts` | 수정 |
| `src/cache/store.permissions.test.ts` | 신규 |
| `src/cache/last-run.ts` | 수정 |
| `src/cache/last-run.test.ts` | 신규 |
| `docs/data-schema.md` | 수정 |
