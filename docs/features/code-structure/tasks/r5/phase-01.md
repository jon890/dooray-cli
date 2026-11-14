# Phase 01. 설정 코드를 주제별로 나눈다

**Execution profile**: standard

## 목표

설정 파일 처리·값 검증·비밀값 저장·읽기·보안 경고·갱신을 따로 읽을 수 있게 한다.

**범위 외**: 동작 변경, 실제 사용자 설정·키체인 접근, Dooray 접속.

## 컨텍스트

**요구사항**: REQ1, REQ5, REQ6, REQ7, REQ8

**근거 문서**: `docs/features/code-structure/spec.md`, `docs/features/code-structure/design.md` 의 R5 절.

## 의도 메모

기존 `src/config/store.ts` 는 같은 이름을 재내보낸다. 선언을 나누는 작업이라 파일 이동 커밋은 만들지 않는다.
파일 읽기·원자적 쓰기는 `store-file.ts`, 값 검증은 `store-values.ts`, 키체인 쓰기·복원은 `store-secrets.ts` 에 둔다.
조회는 `store-read.ts`, 경고의 프로세스 상태는 `store-security.ts`, 갱신은 `store-write.ts`, 공유 결과 타입은 `store-types.ts` 에 둔다.
읽기·쓰기 함수의 순서와 쿠키 생략 처리, 경고 횟수는 그대로 둔다. 기존 회귀 테스트가 이 동작을 이미 검증한다.
계획은 단독 수행 지시에 따라 자체 대조한다. 독립 계획 검토를 완료했다고 기록하지 않는다.

## 작업 항목

### 1. 선언과 주석을 주제별 파일로 옮기고 import 를 별칭으로 쓴다

기존 파일의 내보내는 이름과 문서 경로를 유지한다. 외부 호출부를 바꾸지 않는다.

### 2. 기존 테스트로 저장·복원·보안 경고·쿠키 보존을 확인한다

`store.test.ts`, `store.fs.test.ts`, `store.keychain.test.ts`, `store.security.test.ts` 를 그대로 실행한다.
`src/architecture.test.ts` 에 기존 진입 파일이 재내보내기만 하는지 확인하는 검사를 더한다.

## 검증

```bash
pnpm test src/config src/architecture.test.ts
pnpm tsc --noEmit
pnpm run build
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/config/store.ts` | 수정 |
| `src/config/store-types.ts` | 신규 |
| `src/config/store-values.ts` | 신규 |
| `src/config/store-file.ts` | 신규 |
| `src/config/store-secrets.ts` | 신규 |
| `src/config/store-read.ts` | 신규 |
| `src/config/store-security.ts` | 신규 |
| `src/config/store-write.ts` | 신규 |
| `src/architecture.test.ts` | 수정 |
