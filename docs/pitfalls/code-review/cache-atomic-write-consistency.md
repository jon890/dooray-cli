---
id: cache-atomic-write-consistency
category: code-review
title: 캐시 일관성
triggers: [캐시, atomic write, writeFile, 스키마 검증]
tool_catchable: false
source: [CLI3]
related: []
---

**증상**: `~/.dooray/cache/` 쓰기 후 읽기 시 부분 쓰기 / 스키마 불일치 노출.
**Good**: write 는 atomic (`writeFile` to temp, rename), read 는 schema 검증 (타입 가드). ADR-004 / ADR-010 참조.
**검출**: `grep -nE 'fs\.writeFile.*cache' src/cache/` 결과 중 atomic 패턴 미적용 라인.
