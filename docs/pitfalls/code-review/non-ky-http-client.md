---
id: non-ky-http-client
category: code-review
title: ky 외 HTTP 클라이언트 사용
triggers: [ky, axios, node-fetch, got, HTTP 클라이언트]
tool_catchable: false
source: [CLI2]
related: []
---

**증상**: `axios` / `node-fetch` / `got` import → 번들 크기 증가와 ADR-002 의 retry / timeout 정책 일관성 훼손.
**Good**: 모든 HTTP 호출은 `src/api/client.ts` 의 ky 인스턴스 통과. 신규 외부 API 도 동일 helper 확장.
**검출**: `grep -rnE "from ['\"](axios|node-fetch|got)['\"]" src/`.
