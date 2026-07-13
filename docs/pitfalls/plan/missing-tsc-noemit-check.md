---
id: missing-tsc-noemit-check
category: plan
title: type 추가/삭제 phase 의 성공 기준에 `tsc --noEmit` 누락
triggers: [tsc --noEmit, type 회귀, tsup, vitest, type-check]
tool_catchable: true
source: [1-10]
related: [unverified-function-signature]
---

**증상**: phase 성공 기준이 `pnpm build && pnpm test` 만 명시.
신규 type 정의/import/시그니처 변경을 포함한 phase 가 빌드/테스트 통과해도 tsc 검증을 우회 → 머지 후 다음 PR 에서 회귀 발견.
**왜**: tsup (esbuild) 과 vitest 모두 type-check 를 스킵.
dooray-cli CI 도 historically `pnpm build && pnpm test` 만 돌림.
type 회귀가 생산 build 에서는 안 보이고 type 전용 step (`tsc --noEmit`) 에서만 보인다.

**Good** (type 변경을 포함한 phase 의 성공 기준):
```bash
# 새/수정된 type 의 회귀 검사
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l
# 기대: <baseline 수치>  (변경 전 기준선 또는 0)
```

**검출 (plan 작성 시 grep)**: phase 본문에 같은 키워드가 등장하는데 성공 기준에 `tsc --noEmit` 0건.
- `interface `
- `export type `
- `import type`
- `: Promise<`
- `: never`
- 새 시그니처 추가
- catch 블록 패턴 변경

→ 누락.
