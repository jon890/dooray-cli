---
id: RETRO-0014
plan: plan057-feat-project-tags-write
date: 2026-08-20
phase: phase-02
status: 해결
category: 계획
promotion: 승격 안 함
---

# 전역 옵션과 이름이 같은 하위 명령 옵션이 값을 잃는다

## 관찰

계획 평가에서 `--color` 가 전역 `--no-color` 와 충돌한다는 지적이 나왔다.
worktree 에서 재현해 보니 `optsWithGlobals()` 가 사용자가 준 색상값을 버렸다.

| 입력 | `opts()` | `optsWithGlobals()` |
| --- | --- | --- |
| `--name a` | `{name:"a"}` | `{name:"a", color:true}` |
| `--name a --color c6eab3` | `{name:"a", color:"c6eab3"}` | `{name:"a", color:true}` |

## 원인

Commander 의 `optsWithGlobals()` 는 조상 command 를 `Object.assign` 으로 누적한다.
조상이 자식을 덮어쓰므로, 전역과 이름이 같은 하위 명령 옵션은 항상 전역 값을 받는다.
`src/index.ts` 의 `--no-color` 가 `color: true` 를 상시 채우고 있어 `--color` 가 그 값에 가려졌다.

## 영향

계획대로 `optsWithGlobals()` 를 따랐다면 `normalizeTagColor(true)` 가 boolean 에 `.trim()` 을 호출해 런타임 예외가 났다.
계획 평가에서 잡혀 구현 전에 해소했다.

## 대응

`--name` 과 `--color` 는 그 명령의 `opts()` 로 읽고, `--json` 과 `--quiet` 만 `optsWithGlobals()` 로 읽게 phase 본문에 명시했다.
옵션 이름을 `--tag-color` 로 바꾸는 대안은 기각했다. 공개 문서 셋이 이미 `--color` 로 적고 있다.

## 검증

`grep -nE "optsWithGlobals\(\)[^;]*\.(color|name)"` 와 그 역순 둘이 결과를 내지 않는 것을 확인했다.
한 줄 안에서 붙어 있는 형태만 잡히므로 등장 횟수도 함께 본다.
`optsWithGlobals` 의 실제 대입문은 출력 모드용 한 번뿐이다.

## 배운 점

전역 옵션과 이름이 겹치는 하위 명령 옵션을 새로 만들 때는 `optsWithGlobals()` 를 쓰지 않는다.
`--no-` 로 등록된 전역 옵션은 사용자가 지정하지 않아도 `true` 를 채우므로 충돌이 조용히 일어난다.

## 후속

같은 사고가 RETRO-0002 에도 있다. 두 번째라 규칙으로 승격할 자리를 찾을 만하지만,
지금 저장소에서 전역과 이름이 겹치는 하위 명령 옵션은 이것 하나다.
세 번째가 나오면 `docs/pitfalls/code-review/` 로 올린다.
