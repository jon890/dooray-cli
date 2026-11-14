# Phase 02. 스킬 관리 코드를 주제별로 나눈다

**Execution profile**: standard

## 목표

설치 상태 조회와 파일 변경 절차를 따로 읽을 수 있게 하고 기존 진입 파일을 유지한다.

**범위 외**: 설치 동작·공개 API 구조 변경, 실제 사용자 스킬 변경.

## 컨텍스트

**요구사항**: REQ1, REQ3, REQ5, REQ6, REQ7, REQ8

**근거 문서**: `docs/features/code-structure/spec.md`, `docs/features/code-structure/design.md` 의 R5 절.

## 의도 메모

`src/skill/manager.ts` 는 기존 이름을 재내보낸다. 타입·상수는 `types.ts`, 경로 규칙은 `paths.ts`, 파일 항목 확인은 `entries.ts` 에 둔다.
상태 조회는 `inspect.ts`, 해시 검증·임시 저장소 생성·격리는 `store.ts`, 링크 교체·복원은 `install.ts` 에 둔다.
파일을 나누기만 하므로 새 정책과 추상화는 더하지 않는다. 기존 회귀 테스트를 유지한다.
REQ3 은 R1·R2 의 API 구조 유지 증거를 재확인하고, R5 재내보내기 구조와 함께 보고한다.

## 작업 항목

### 1. 선언과 주석을 주제별 파일로 옮긴다

명시한 역할별로 나누고 내부 파일은 기존 재내보내기 파일을 가져오지 않는다. 상태 조회와 설치 순서를 유지한다.

### 2. 기존 설치 테스트와 구조 검사를 실행한다

`src/skill/manager.test.ts` 의 변경·손상·미관리 항목 보호와 실패 시 복원을 확인한다.
`src/architecture.test.ts` 에 스킬 진입 파일의 재내보내기 검사를 더한다.

## 검증

```bash
pnpm test src/skill src/architecture.test.ts
pnpm tsc --noEmit
pnpm run build
pnpm test
pnpm api:inventory
node scripts/check-pii.mjs
node scripts/check-public-refs.mjs
node scripts/check-doc-paths.mjs --strict
pnpm verify:package
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/skill/manager.ts` | 수정 |
| `src/skill/types.ts` | 신규 |
| `src/skill/paths.ts` | 신규 |
| `src/skill/entries.ts` | 신규 |
| `src/skill/inspect.ts` | 신규 |
| `src/skill/store.ts` | 신규 |
| `src/skill/install.ts` | 신규 |
| `src/architecture.test.ts` | 수정 |
