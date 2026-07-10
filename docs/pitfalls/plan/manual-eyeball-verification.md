---
id: manual-eyeball-verification
category: plan
title: "\"눈으로 확인\" 검증"
triggers: [눈으로 확인, 수동 검토, 성공 기준]
tool_catchable: false
source: [1-5]
related: []
---

**증상**: 성공 기준에 "수동 검토", "눈으로 확인" 같은 인간 의존 문구.
**왜**: executor (LLM) 가 "확인했다" 단정 가능 → 사실상 검증 없음.

**규칙**: 성공 기준의 각 항목은 grep / test / diff + 기대값 (건수 / exit / 문자열 포함) 명시. dooray-cli 는 `pnpm build && pnpm test` 가 기본 게이트.

**Self-check**: "확인" / "검토" 문구 0건? 각 명령에 기대값 명시?
