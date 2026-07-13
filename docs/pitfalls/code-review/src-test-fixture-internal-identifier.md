---
id: src-test-fixture-internal-identifier
category: code-review
title: src/ 테스트 fixture·에러 메시지의 사내 식별자
triggers: [PII, 사내 식별자, 테스트 fixture, placeholder]
tool_catchable: false
source: [code-review 8-1, PR #84, plan041]
related: []
---

**증상**: 테스트 fixture / 에러 메시지 예시에 실제 사내 프로젝트 코드 (`tc-ocr`), 사내 도메인 (`*.nhnent.dooray.com`), 실제일 수 있는 19자리 ID 사용.
code-reviewer 가 "PII 정책은 README/docs 대상, src 는 범위 밖" 으로 PASS 하기 쉬움 — 하지만 public OSS 라 src 도 노출 대상이다.

**Good**: 테스트/예시 식별자는 placeholder 또는 CLAUDE.md 승인 dummy 사용.
- 프로젝트 코드 → `my-project`
- 도메인 → `x.dooray.com` / `example.dooray.com`
- 19자리 ID → `1234567890123456789` / `9876543210987654321`

**검출**:
```bash
grep -rnE "tc-ocr|nhnent|nhn-comico" src/        # config 기본값 등 기능 코드는 사람이 판단
grep -rnE "[0-9]{15,}" src/ | grep -vE "1234567890123456789|9876543210987654321"
# 결과가 실제 사내 값이면 placeholder/dummy 로 교체
```

**Self-check**: 새 테스트/에러 메시지에 식별자를 넣을 때 실제 사내 값 대신 placeholder/dummy 를 썼는가? src 도 PII 대상임을 인지했는가?

**Why**: PR #84 (plan041) — claude bot 이 🔴 로 지적. 우리 code-reviewer 는 src 를 PII 범위 밖으로 PASS. CLAUDE.md PII 정책 대상에 src 가 빠져 있던 게 원인 (이후 정책에 src 테스트 fixture 추가).
