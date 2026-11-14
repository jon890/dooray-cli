# Phase 02. 타입 선언을 소유 영역으로 나눈다

**Execution profile**: standard

## 목표

DTO 와 파라미터를 영역 인터페이스 옆에 두고 원래 경로의 재내보내기를 지킨다.

**범위 외**: client.ts 메서드 본문 이동, 타입의 필드와 선택 여부 변경.

## 컨텍스트

**요구사항**: REQ3, REQ5, REQ6

**근거 문서**: `docs/features/code-structure/spec.md`, `docs/features/code-structure/design.md`

## 의도 메모

ProjectInfo·Tag·Milestone·Member 처럼 다른 영역도 쓰는 타입은 실제 소유 영역에 두고 types.ts 로 직접 가져온다.
응답 봉투만 common 에 둔다. 기존 선언은 그대로 옮긴다.

## 작업 항목

### 1. api/types.ts 를 영역별 types.ts 로 나누고 원래 파일은 재내보내기만 둔다. 영역 파일끼리 common 또는 다른 영역 types.ts 를 직접 가져온다.
### 2. api 영역에서 옛 types.ts 와 client.ts 를 가져오는 것을 architecture.test.ts 와 구조 문서에서 금지한다.
### 3. dooray-client.test.ts 의 영역 탐색에서 common 을 뺀다. 기존 테스트가 수정 전과 같은 DTO 와 메서드 계약을 확인하게 한다.

## 검증

```bash
# cwd: 저장소 루트
pnpm exec vitest run src/architecture.test.ts src/api
pnpm tsc --noEmit
pnpm run build
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/api/**` | 신규·수정 (타입 선언과 영역 안 import) |
| `src/architecture.test.ts` | 수정 (규칙과 사례 추가) |
| `docs/code-architecture.md` | 수정 (현재 타입 자리와 규칙) |
