---
id: mock-reject-value-not-mirroring-production
category: code-review
title: 테스트 mock 의 reject value 가 production path 를 mirror 안 함
triggers: [mockRejectedValue, DoorayCliError, production path, 테스트 mock]
tool_catchable: false
source: [code-review 2-3, PR #63, plan029]
related: [exitcode-mapping-mismatch]
---

**증상**: `vi.fn().mockRejectedValue(new DoorayCliError("...", EXIT_PARAM_ERROR))` 같이 mock 을 만들 때, 실제 production path 의 에러 객체 (`toDoorayCliError` 가 부여하는 exitCode / 메시지 prefix) 와 다른 값을 사용.
테스트는 통과 (mock 이 그 값을 reject 하니까) 하지만 실제 코드 경로는 다른 exitCode 를 받음 → 분기/메시지 변환 코드가 실제로는 동작 안 함.
테스트가 자기 자신만 검증하고 production 검증 못함.

**Good**: API client 함수의 throw path 가 `toDoorayCliError` 를 통과한다면 mock 도 같은 함수가 만들 객체를 흉내내야 함:
- HTTP 4xx (404 포함) → `new DoorayCliError("API 호출 실패: <메시지>", EXIT_API_ERROR)`
- HTTP 401/403 → `new DoorayCliError(..., EXIT_AUTH_ERROR)`
- 네트워크 / timeout → `new Error("ECONNREFUSED")` 등 raw Error (DoorayCliError 아님 — toDoorayCliError 가 unwrap 안 함)

**검출**:
```bash
grep -rnE "mockRejectedValue\(new DoorayCliError" src/ test/
# 결과의 EXIT_* 값이 toDoorayCliError 매핑 (EXIT_API_ERROR / EXIT_AUTH_ERROR) 인지 확인
```

**Self-check**: mock 의 reject value 를 작성할 때, "이 mock 이 흉내내려는 production 호출 경로에서 실제로 어떤 형태의 Error 가 던져지는가?" 를 코드로 직접 확인했는가 — 아니면 "에러면 그냥 Error 든 DoorayCliError 든 통과하니까" 로 임시값 넣었는가?

**Why**: PR #63 (plan029) — 7/7 테스트 PASS 였지만 mock 이 production 동작 mirror 안 함. mock 만 보면 분기 코드 검증된 것처럼 보이지만 실제 path 는 dead. code-reviewer 가 production path (`toDoorayCliError`) 와 mock 의 exitCode 대조로 잡음. 2-2 와 짝 — 같은 사고가 코드와 테스트 양쪽에서 동시 발생.
