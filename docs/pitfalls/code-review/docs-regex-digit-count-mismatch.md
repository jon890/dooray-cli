---
id: docs-regex-digit-count-mismatch
category: code-review
title: 문서 자리수/범위 표기와 코드 regex 불일치
triggers: [자리수, regex, 19자리, 15+자리]
tool_catchable: false
source: [code-review 7-1, plan039]
related: []
---

**패턴**: planning docs 선반영 시 "19자리 numeric" 같이 구체 자릿수를 적었는데 실제 코드 regex 는 `/^\d{15,}$/` (15+자리).
executor 가 docs 텍스트를 그대로 README / SKILL.md 에 복사하면서 불일치 전파.

**검출**:
```bash
# regex 의 자릿수 제한과 docs 표현이 일치하는지 확인
grep -rn "자리" README.md skills/ docs/ | grep -i numeric
# 코드의 regex 와 대조
grep -rn "_RE = " src/resolvers/
```

**Self-check**: 새 regex 상수 추가 시 docs 전체에서 해당 자릿수 표현을 grep 하여 일관성 확인.

**Why**: plan039 code-reviewer FIX_NEEDED, docs-verifier UPDATE_NEEDED — "19자리" 가 README, SKILL.md, flow.md 3곳에 전파. regex 는 15+자리.
