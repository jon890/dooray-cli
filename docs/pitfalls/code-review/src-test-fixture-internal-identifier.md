---
id: src-test-fixture-internal-identifier
category: code-review
title: src/ 테스트 fixture·에러 메시지의 사내 식별자
triggers: [PII, 사내 식별자, 테스트 fixture, placeholder]
tool_catchable: false
source: [code-review 8-1, PR #84, plan041]
related: []
---

**증상**: 테스트 fixture / 에러 메시지 예시에 실제 사내 프로젝트 코드, 사내 도메인 (`*.<tenant>.dooray.com`), 실제일 수 있는 19자리 ID 사용.
code-reviewer 가 "PII 정책은 README/docs 대상, src 는 범위 밖" 으로 PASS 하기 쉬움 — 하지만 public OSS 라 src 도 노출 대상이다.

**Good**: 테스트/예시 식별자는 placeholder 또는 CLAUDE.md 승인 dummy 사용.
- 프로젝트 코드 → `my-project`
- 도메인 → `x.dooray.com` / `example.dooray.com`
- 19자리 ID → `1234567890123456789` / `9876543210987654321`

**검출** (구체 사내값을 나열하지 않고 공개 화이트리스트 밖을 잡는다):
```bash
# 공개 도메인 화이트리스트 밖의 URL/이메일 도메인 (사내 도메인 가능성)
grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" src/ \
  | grep -vE "dooray\.com|github\.com|npmjs\.com|example\.com"
grep -rnE "[0-9]{15,}" src/ | grep -vE "1234567890123456789|9876543210987654321"
# 결과가 실제 사내 값이면 placeholder/dummy 로 교체. 프로젝트 코드네임은 사람이 판단.
```

**Self-check**: 새 테스트/에러 메시지에 식별자를 넣을 때 실제 사내 값 대신 placeholder/dummy 를 썼는가? src 도 PII 대상임을 인지했는가?

**Why**: PR #84 (plan041) — claude bot 이 🔴 로 지적. 우리 code-reviewer 는 src 를 PII 범위 밖으로 PASS. CLAUDE.md PII 정책 대상에 src 가 빠져 있던 게 원인 (이후 정책에 src 테스트 fixture 추가).
