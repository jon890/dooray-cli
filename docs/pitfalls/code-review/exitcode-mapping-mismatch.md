---
id: exitcode-mapping-mismatch
category: code-review
title: "catch 의 `err.exitCode` 분기 시 `toDoorayCliError` 의 실제 매핑 미확인"
triggers: [EXIT_PARAM_ERROR, EXIT_API_ERROR, toDoorayCliError, exitCode 분기]
tool_catchable: false
source: [code-review 2-2, PR #63, plan029]
related: [mock-reject-value-not-mirroring-production]
---

**증상**: resolver / command 에서 `catch (err)` 후 `err instanceof DoorayCliError && err.exitCode === EXIT_PARAM_ERROR` 같은 분기로 "특정 에러만 변환 + 나머지 re-throw" 를 시도. 하지만 `toDoorayCliError` (src/api/client.ts) 는 HTTP 에러에 `EXIT_AUTH_ERROR` (401/403) 또는 `EXIT_API_ERROR` (그 외, 404 포함) 만 부여. `EXIT_PARAM_ERROR` (3) 는 CLI 자체 입력 검증 경로에서만 발생 — API 호출 경로의 catch 에서는 절대 매칭 안 됨. 결과: 분기 조건이 항상 false → "특정 에러 변환" 코드가 dead path 가 되고, 사용자는 의도된 친절 메시지 대신 raw 에러를 봄.

**Good**: catch 안에서 HTTP 에러를 분류하려면 `EXIT_API_ERROR` (404 포함 4xx/5xx) 와 `EXIT_AUTH_ERROR` (401/403) 중에서 선택. status code 까지 구분하려면 `err.message` 의 `(404)` 패턴이나 별도 metadata 가 필요 — 단순 exitCode 비교로는 404 / 5xx / timeout 을 구별 못함을 인지하고 설계.

```ts
// BAD — EXIT_PARAM_ERROR 는 API 경로에서 절대 발생 안 함 → 분기 항상 false
try { await client.getMemberDetail(input); } catch (err) {
  if (err instanceof DoorayCliError && err.exitCode === EXIT_PARAM_ERROR) {
    throw new DoorayCliError("찾을 수 없습니다", EXIT_PARAM_ERROR);
  }
  throw err;
}

// GOOD — toDoorayCliError 의 실제 매핑 (EXIT_API_ERROR for 404) 사용
try { await client.getMemberDetail(input); } catch (err) {
  if (err instanceof DoorayCliError && err.exitCode === EXIT_API_ERROR) {
    throw new DoorayCliError("찾을 수 없습니다", EXIT_PARAM_ERROR);
  }
  throw err;   // EXIT_AUTH_ERROR / 네트워크 에러는 분류 보존
}
```

**검출**: catch 안의 exitCode 검사 패턴 + `EXIT_PARAM_ERROR` 사용 여부.
```bash
grep -rnE "exitCode\s*===\s*EXIT_PARAM_ERROR" src/resolvers/ src/commands/ src/api/
# 결과 있으면 → API 경로의 catch 인지 확인. API 경로면 → EXIT_API_ERROR 로 교체
```

**Self-check**: catch 안에서 exitCode 분기를 쓰는 코드를 작성/리뷰할 때, `src/api/client.ts` 의 `toDoorayCliError` 가 그 에러 케이스에 어떤 exitCode 를 *실제로* 부여하는지 grep 으로 확인했는가? mock 으로 짠 테스트가 그 exitCode 를 mirror 하는가?

**Why**: PR #63 (plan029) — `resolveMember` 의 catch 가 `EXIT_PARAM_ERROR` 검사. 테스트도 같은 값으로 reject 해서 7/7 PASS 였지만 실제 production path 의 `toDoorayCliError` 는 `EXIT_API_ERROR` 부여 → 분기 dead. code-reviewer 가 catch 케이스 ↔ toDoorayCliError 매핑 대조해서 잡음. 다른 resolver/command 에서 같은 패턴 추가 시 또 발생 가능.
