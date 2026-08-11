---
id: redirect-manual-status-branch-missing
category: code-review
title: redirect manual과 status code 분기 누락
triggers: [redirect manual, throwHttpErrors, 307, status 분기]
tool_catchable: false
source: [code-review 6-1, PR #72, plan035]
related: []
---

**증상**: `redirect: "manual"` 과 `throwHttpErrors: false` 패턴에서 `location` 헤더만 체크하고 `if (response.status === 307)` 분기가 없음.
200 OK 직접 응답 시 에러 경로로 진입.

**Good**: `if (response.status === 307)` 분기 명시.
redirect 응답과 직접 응답을 status code 로 구분.

**검출**:
```bash
grep -nE "redirect.*manual|throwHttpErrors.*false" src/api/client.ts
# 그 위치에서 status === 307 분기 존재 확인
```

**Why**: PR #72 (plan035) ADR-029 / ADR-015 연관.

**Self-check**: `redirect: "manual"` 패턴이 있으면 status 분기도 함께 있는가?
