---
id: unverified-function-signature
category: plan
title: plan 본문이 기존 함수 시그니처 미검증 → executor 빌드 실패
triggers: [함수 시그니처, TS2554, validateMandatoryTags, grep 시그니처]
tool_catchable: true
source: [1-11, PR #64, plan031]
related: [missing-tsc-noemit-check]
---

**증상**: phase 본문에 `await someExistingHelper(a, b, c)` 같은 코드 스니펫이 들어가는데 실제 `someExistingHelper` 가 `(a, b)` 2 인자만 받음.
  또는 반환 타입이 `Promise<void>` 인데 plan 본문이 결과를 변수에 받는 코드 작성.
  executor 가 plan 본문 그대로 작성 → 즉시 `TS2554: Expected N arguments, but got M` 또는 type 불일치.

**왜**: plan 작성자가 "이 함수가 이렇게 동작하면 좋겠다" 의도로 호출 시그니처를 쓰면서 실제 src 의 시그니처를 grep 으로 확인 안 함.
  critic 도 시그니처까지 grep 안 하면 놓침.
  executor 가 발견, 자체 수정하는 경우도 있지만 (PR #64 사례) 시그니처가 직관에 반하는 경우 (예: `validateMandatoryTags` 가 입력 검증 아니라 mandatory 그룹 존재만 검사) 잘못된 분기 작성 가능.

**Good**: phase 본문에 외부 함수 호출 코드 스니펫을 쓸 때 (1) `grep -nE "^export (async )?function {함수명}" src/` 로 정확한 시그니처 확인, (2) 반환 타입까지 인용. 두 줄 검증이 plan 본문에 들어가야 critic 도 함께 검증 가능.

```bash
# plan 작성 시 (또는 critic 재평가 시) 검증:
grep -nE "^\s*(export )?async function (validateMandatoryTags|resolveTags|toDoorayCliError)\b" src/
# 인자 수 + 반환 타입 + 동작 (검증만 / 변환만 / 둘 다) 까지 plan 본문에 인용
```

**Why**: PR #64 (plan031) critic 재평가 — 1차 REVISE 반영 후 신규 Critical 1건 발견.
  plan 본문이 `validateMandatoryTags(client, projectId, effectiveTags)` 로 3인자 호출 작성.
  실제 시그니처는 `(client, projectId)` 2인자, 입력 검증 안 함 (mandatory 그룹 존재 여부만).
  executor 가 알아서 `resolveTags` vs `validateMandatoryTags` 분기로 회피했지만 plan 본문 그대로 실행됐으면 tsc 실패, 의도와 다른 검증.

**Self-check**: type 추가·변경·삭제를 포함한 phase 의 성공 기준 점검:
- `pnpm tsc --noEmit` 의 baseline 비교 명령이 있는가?
- CI 가 tsc 게이트를 돌리는 경우라도 phase 가드는 별도로 명시
- CI 는 PR scope 외 회귀까지 잡아주지만, phase 자체 검증은 plan-local

**Why**: PR #46 (post comment get) 가 `PostCommentDetailResponse` 를 사용했지만 import 누락.
  plan026 (PR #48) `await Promise<never>` 패턴이 TS2366 발생.
  둘 다 build/test PASS 로 머지 → 다음 PR 의 review-fix 단계에서야 발견.
  tsup 의 type-check 우회 특성은 dooray-cli 모든 type-touching phase 의 공통 함정.
