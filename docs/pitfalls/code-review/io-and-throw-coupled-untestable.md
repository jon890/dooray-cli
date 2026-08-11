---
id: io-and-throw-coupled-untestable
category: code-review
title: I/O와 throw 결정을 한 함수에 묶음 → 단위 테스트 불가
triggers: [readline, stdin mock, 책임 분리, 단위 테스트]
tool_catchable: false
source: [CLI12, PR #43]
related: []
---

**증상**: 한 helper 가
1. stderr 출력
2. readline 사용자 입력
3. DoorayCliError throw

를 동시에 담당.
vitest 에서 stdin/stdout mock 없이 단위 테스트 작성 불가 → 결국 테스트 누락.
**Good**: 책임 분리 — `printWarning(...)` (stderr 만) / `confirmPrompt(): Promise<boolean>` (입력만) / `orchestrator(...)` (throw 결정). 순수 helper 만이라도 단위 테스트로 보호.
**검출**: `async function ... Promise<void>` 안에 `process.stderr.write`, `readline.createInterface`, `throw` 셋이 동시에 있으면 분리 후보.
**Why**: PR #43 review — `guardDroppedAttachments` 가 세 책임을 묶어 테스트 작성 안 됨. 분리 후 sanitize / extract / findDropped 단위 테스트로 회귀 보호.
