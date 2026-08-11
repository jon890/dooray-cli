---
id: union-false-nullish-coalescing-misuse
category: code-review
title: "`T | false` union 반환 라이브러리에 `??` 사용 부적합"
triggers: [nullish coalescing, mailparser, T | false, ?? vs ||]
tool_catchable: false
source: [CLI20, PR #53]
related: []
---

**증상**: `mailparser.ParsedMail.html: string | false`. `parsed.text ?? parsed.html ?? "(default)"` 작성 시 `parsed.text === undefined` 이고 `parsed.html === false` 면 `??` 가 `false` 를 통과시켜 `body = false` 로 결과 —
타입 string 위반과 런타임 false 노출.
**Good**: 외부 라이브러리가 `T | false` / `T | 0` / `T | ""` 반환 가능하면 `||` 사용 (falsy 전체를 default 로 흘림). 단 의도된 빈 문자열 보존이 필요하면 명시적 `typeof` / `=== false` 가드와 한 줄 주석으로 의도 명시.
**검출**: `grep -rnE "\?\?.*(html|raw)\b" src/` 로 nullish coalescing 후보 리뷰. 타입 정의에 `| false` / `| 0` / `| ""` 이 있는 union 이면 `??` 부적합.
**Why**: PR #53 review — `parsed.text ?? parsed.html ?? "(본문 없음)"` 에서 `parsed.html: string | false` 의 `false` 통과 위험. `||` 로 교체하고 의도 주석 추가. 다른 라이브러리 (`yaml.load` 일부 형, `dotenv` 등) 도 유사 패턴 가능.
