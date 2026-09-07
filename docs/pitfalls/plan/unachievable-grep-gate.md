---
id: unachievable-grep-gate
category: plan
title: 통과할 수 없는 grep 검증 기대값
triggers: [grep -c, grep -rl, 검증 기대값, wc -l, 사전 점검, critic REVISE]
tool_catchable: false
source: [plan059, Issue #154]
related: [numeric-guess-without-measurement]
---

**증상**: phase 「검증」 절의 grep 기대값이 구조적으로 달성 불가라 executor 가 코드를 비틀거나 불일치를 보고하고 끝난다.

plan059 에서 한 plan 안에 세 번 나왔다.

- `grep -c "fetchAllWikis" src/commands/wiki/list.ts # = 1` — named import 한 줄과 호출부 한 줄이 있어 항상 2 다.
`grep -c` 는 매칭된 **줄 수**를 센다. 등장 횟수가 아니다.
- `grep -rl 'd{15,}' src/resolvers/ | wc -l # = 1` — 이미 여섯 파일이 같은 패턴을 갖고 있어 1 이 될 수 없다.
새로 만드는 파일이 아니라 저장소 전체를 센 것이 원인이다.
- `grep -rln "argv: ..." src/commands | wc -l # = 16` — 대상 범위가 겹치는 다른 grep 과 합산되어 19 였다.
죽은 import 가 있는 파일이 호출부 수에 함께 셌다.

**Good**: 기대값을 적기 전에 그 명령을 **구현 후 상태로 가정해 실제로 돌려 본다.**
확정할 수 없으면 `= N` 대신 `>= 1` 로 둔다.
판정하려는 것이 「그 상수를 재사용했는가」이면 저장소 전체를 세지 말고 그 파일 하나를 본다.

```bash
# 나쁨: 저장소 전체를 세어 기존 파일까지 걸린다
grep -rl 'd{15,}' src/resolvers/ | wc -l   # = 1

# 좋음: 판정 대상 파일만 본다
grep -c "PROJECT_ID_RE" src/resolvers/wiki.ts   # >= 1
grep -c 'd{15,}' src/resolvers/wiki.ts          # = 0
```

**검출**:

```bash
# phase 의 grep 기대값을 뽑아 현재 상태로 먼저 돌려 본다
grep -nE '^grep .*# *[=><]' tasks/*/phase-*.md

# = N 형태 중 import 와 호출부가 함께 잡히는 이름인지 본다
grep -nE '# *= *1$' tasks/*/phase-*.md
```

**Self-check**:

- 기대값이 `= 1` 인 심볼이 import 와 호출부 양쪽에 나타나는가. 그러면 `>= 1` 이다.
- 대상 경로가 새로 만드는 파일인가 저장소 전체인가. 전체면 기존 건수를 먼저 실측한다.
- grep 둘 이상의 대상 경로가 겹치는가. 겹치면 합산 결과를 따로 적는다.
- 호출부 수를 셀 때 import 만 있고 호출이 없는 파일을 세지 않았는가.

**Why**: plan059 에서 critic 이 하나를 REVISE 사유로 잡았고, executor 둘이 나머지를 불일치로 보고했다.
기대값이 틀리면 executor 가 통과시키려고 자연스럽지 않은 코드를 쓰거나, 판정 근거 없이 phase 를 끝낸다.
