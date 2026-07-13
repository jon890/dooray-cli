---
id: resolver-parser-boundary-empty-identifier
category: code-review
title: resolver/parser boundary 검증 (빈/공백 식별자가 API URL path 로 흘러감)
triggers: [assertNonEmpty, commentId, fileId, boundary 검증]
tool_catchable: false
source: [CLI15, PR #47]
related: []
---

**증상**: `commentId` / `fileId` 같은 식별자를 trim·non-empty 검증 없이 `parseXxxPositional` 이 통과시킴.
사용자가 빈 문자열 / 공백만 / 인용 부호 안 빈 값을 넘기면 그대로 `GET /posts/<postId>/comments//logs//files/` 같은 깨진 URL 로 합성.
서버 4xx 또는 더 나쁘게 path traversal 가까운 동작 발생.
`resolvePostInput` 의 numeric 검증 패턴과 비대칭.
**Good**: `parseXxxPositional` 진입부에서 모든 path 식별자에 `assertNonEmpty(value, "<label>")` (trim 후 빈 거부) 가드.
discriminated union + 오버로드와 함께 "필수 secondary" 도 같은 가드 적용. `resolveCommentFileInput` 의 `assertNonEmpty` 헬퍼가 reference 구현.
**검출**: 신규 resolver/parser 추가 시 `grep -nE "throw new DoorayCliError.*가 필요|EXIT_PARAM_ERROR" src/resolvers/<file>.ts` 결과의 가드 다음에 trim 검증이 있는지 확인. 없으면 boundary 미보호.
**Why**: PR #47 review #5 — `comment-file-input.ts` 가 `commentId` / `fileId` 를 trim 없이 그대로 `client.getPostComment` URL 에 합성.
resolver helper 가 향후 추가될 때마다 같은 boundary 가드 누락 위험 — 검증 책임을 caller (commands/) 가 아니라 resolver 가 단일 지점에서 진다.
