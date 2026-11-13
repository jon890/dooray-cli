# Phase 02. doctor-checks

**Execution profile**: standard

## 목표

doctor 는 기존 평면 JSON 키를 유지하며 checks 를 추가한다. getConfigOrThrow 의 두 호출 모두 securityWarning: false 를 넘긴다. 설정 상태별 checks 포함 조건은 design 표를 따른다. fail 이 있으면 종료 코드 1, warn 과 스킬 미설치만이면 0 이다. 사용자 문서에 보안 진단·종료 코드·수정 방법을 맞춘다.

**범위 외**: 새 인증 방식과 외부 API 호출.

## 컨텍스트

**요구사항**: REQ4, REQ10, REQ5

**근거 문서**: `docs/features/secret-file-hardening/spec.md`, `docs/features/secret-file-hardening/design.md`, `docs/adr/079-secret-file-exposure-warning.md`

기존 `src/config/store.ts` 의 ensureDir 와 writeConfigFile 을 따른다. getConfig 는 키체인을 읽을 수 있으므로 테스트는 가짜 저장소를 주입한다. 실제 키체인은 별도 macOS CLI 검증에서 임시 HOME 의 경로 해시 account 만 사용한다.

## 의도 메모

읽기 자동 수리와 일괄 chmod 는 하지 않는다. 저장 때만 바꾸고 원래 오류 전파를 유지한다.

## 작업 항목

### 1. 구현과 문서

doctor 는 기존 평면 JSON 키를 유지하며 checks 를 추가한다. getConfigOrThrow 의 두 호출 모두 securityWarning: false 를 넘긴다. 설정 상태별 checks 포함 조건은 design 표를 따른다. fail 이 있으면 종료 코드 1, warn 과 스킬 미설치만이면 0 이다. 사용자 문서에 보안 진단·종료 코드·수정 방법을 맞춘다.

### 2. 개발 테스트

`src/commands/doctor.test.ts` 를 작성하거나 수정한다.

doctor.test.ts 에 설정 absent/invalid/unreadable/keychain, 필수 값 누락, API 연결 성공/실패, 보안 fail/warn/pass, 텍스트 표시, 중복 경고 억제, 스킬 미설치만 있는 경우와 종료 코드를 검증한다. 매 테스트 뒤 exitCode 를 복구한다.

docs/guide/setup.md 에 명령 경고와 현재 track-last-run 값을 유지하는 저장 안내, skills/dooray-cli/references/common.md 에 종료 코드와 checks, docs/flow.md 의 doctor JSON 설명을 갱신한다.

## 검증

```bash
pnpm exec vitest run src/commands/doctor.test.ts
pnpm tsc --noEmit
pnpm run build
node scripts/check-pii.mjs
node scripts/check-public-refs.mjs
```

모두 종료 코드 0 이어야 한다. 전체 pnpm test 와 pnpm verify:package 는 마지막 phase 뒤 누적 개발 검증에서 실행한다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/commands/doctor.ts` | 수정 |
| `src/commands/doctor.test.ts` | 수정 |
| `docs/guide/setup.md` | 수정 |
| `README.md` | 수정 |
| `skills/dooray-cli/references/common.md` | 수정 |
| `docs/flow.md` | 수정 |
