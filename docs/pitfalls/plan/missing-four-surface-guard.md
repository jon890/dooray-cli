---
id: missing-four-surface-guard
category: plan
title: 새 불변식 도입 시 4면 가드 누락
triggers: [불변식, cache writer, resolver, formatter, schema]
tool_catchable: false
source: [1-7]
related: []
---

**증상**: 캐시 스키마에 신규 필드 추가 + 일부 read 경로에만 가드 + writer 누락.
**왜**: 같은 불변식이 다른 표면에서 깨짐 (cache writer 드랍 / resolver 통과 / formatter 미반영 / config schema 미반영 등).

**4면 검사 체크리스트** (load-bearing 불변식인 경우 필수):
1. **Schema / Type**: `src/api/types.ts` / `src/cache/types.ts` 에 정의
2. **Cache writer & reader**: `src/cache/store.ts` 양쪽 모두 신 필드 처리 + atomic write
3. **Resolver / Mapper**: 입력 매퍼가 새 필드를 드랍하지 않는지 (`grep` 확인)
4. **Command / Formatter**: 사용자 가시 출력에서 일관 처리

**Self-check**: load-bearing 불변식 도입 시 4면 가드 모두 phase 작업 목록에 명시?
