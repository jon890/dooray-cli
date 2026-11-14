# Phase 03. 소비자가 타입을 새 자리에서 가져온다

**Execution profile**: standard

## 목표

재내보내기에 기대는 소비자를 직접 경로로 고치고 사용자 동작이 같다는 증거를 남긴다.

**범위 외**: R2 공개 구현 분할과 후속 구조 정리.

## 컨텍스트

**요구사항**: REQ1, REQ3, REQ5, REQ6, REQ7, REQ8

**근거 문서**: `docs/features/code-structure/spec.md`, `docs/features/code-structure/design.md`

## 의도 메모

타입 분할은 파일 이동이 아니므로 옛 파일 이력을 남기고 새 파일 이력은 새로 시작한다.
독립 리뷰는 코디네이터의 Claude 리뷰 worker 가 맡는다. 자기 검토를 독립 리뷰 통과로 적지 않는다.

## 작업 항목

### 1. 타입 import 와 client.ts 의 타입 재내보내기를 새 영역으로 직접 바꾼다. 같은 폴더는 상대 경로, 나머지는 @ 별칭을 쓴다.
### 2. R1 의 선언 분할은 도구 대상이 아니므로 직접 수행하고 소비자 수정 뒤 diff stat 을 남긴다. 옛 types.ts 의 git log --follow 와 임시 git 저장소 테스트의 100% rename 탐지를 증거로 남긴다.
### 3. 타입 검사·전체 테스트·빌드·도움말 비교·패키지 검증·인벤토리·문서 경로 검사와 공개 정보 검사를 실행한다.
### 4. 실제 결과를 PR 본문에 보존하고 문서 대조와 공통화 후보 없음의 범위를 적는다. 계획은 독립 리뷰 때까지 보존한다.

### 5. `src/architecture.test.ts` 와 `src/api/dooray-client.test.ts` 를 포함한 기존 테스트로 직접 경로를 확인한다

## 검증

```bash
# cwd: 저장소 루트
pnpm tsc --noEmit
pnpm test
pnpm run build
pnpm verify:package
pnpm api:inventory
node scripts/check-pii.mjs
node scripts/check-public-refs.mjs
node scripts/check-doc-paths.mjs
node scripts/help-snapshot.mjs --check /tmp/dooray-code-structure-r1/baseline-help.txt
git log --follow --oneline -- src/api/types.ts
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/**/*.test.ts` | 수정 (기존 테스트 import 경로) |
| `src/**/*.ts` | 수정 (타입 import 경로만 갱신) |
| `docs/code-architecture.md` | 수정 (직접 타입 참조 경로) |
| `docs/features/code-structure/tasks/r1/**` | 수정 (실행 결과와 상태 기록) |
