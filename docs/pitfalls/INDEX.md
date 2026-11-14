# Pitfalls INDEX

이 디렉터리는 읽기 전용 목록이다. 새 함정은 여기에 쌓지 않고 규칙 자리(검사기·테스트·지침)로 옮긴다.
넣을 곳을 고르는 기준은 `plan` 스킬의 `references/rule-placement.md` 가 소유한다.
이미 있는 항목도 이번 변경에 걸리면 같은 자리로 옮기고 원래 항목을 지운다. 같은 규칙이 두 곳에 있으면 한쪽만 고쳐진다.

모놀리식 문서가 아니다. 패턴 1개 = 파일 1개 구조다.
전부 읽지 말고 아래 라우터로 필요한 파일만 찾아서 읽는다.

## 소비 방식

1. 아래 라우터 표에서 지금 하는 작업 유형(plan 작성 / team 운영 / code-review)에 해당하는 행을 찾는다.
2. 그 행이 가리키는 디렉터리만 살펴본다 — 전체 `docs/pitfalls/` 를 다 읽지 않는다.
3. 구체적으로 어떤 패턴인지 짐작 가면 해당 파일 하나만 읽는다.
4. 애매하면 그 카테고리 디렉터리 전체(`ls docs/pitfalls/<category>/*.md`)를 훑는다.

## 라우터 표

| 카테고리 | 디렉터리 | 호출 시점 | 사용 스킬 |
| --- | --- | --- | --- |
| plan 작성 | `plan/` | task 파일 작성 직후 self-check | `plan` |
| team 운영 | `team/` | 팀원 스폰·메시지 작성 시 | `implementation` |
| code-review | `code-review/` | 코드 작성·리뷰 시 | `implementation`, `review-fix` |

## 호출 시점 (누가 언제 참조하는가)

같은 `code-review/` 디렉터리라도 참조하는 주체와 시점이 다르다.

| 시점 | 누가 | 어떻게 |
| --- | --- | --- |
| plan 작성 | plan 을 쓰는 쪽 | phase 본문에 "회피 항목"으로 1줄 인용 (executor 가 그 phase 만 보고도 알 수 있도록) |
| 코드 작성 시작 직전 | executor | 해당 카테고리 디렉터리를 grep 하여 self-check |
| 코드 검토 | code-reviewer | `code-review/` 전 항목을 grep 으로 점검 |

## 파일 형식

각 패턴은 파일 1개다.
frontmatter와 본문 구조를 따른다.

```yaml
---
id: <kebab-slug>              # 영어 kebab-case, 번호 아님 (예: adr-number-collision)
category: plan | team | code-review
title: <원본 패턴 제목 그대로>
triggers: [<키워드>, ...]     # 한/영 키워드 (원본 제목·본문에서 추출)
tool_catchable: true | false  # tsc·test·검사기가 이미 잡으면 true
source: [<출처>]              # 원본 번호(1-3 / 2-5 / CLI7 / code-review 5-2) + PR#/ADR# 있으면 함께
related: [<다른 id>, ...]     # 관련 패턴 id (없으면 빈 배열)
---

**증상**: ...
**Good**: ...
**검출**: (grep/find 명령 있으면 코드블록)
**Self-check**: ...
**Why**: ...
```

`tool_catchable` 은 판단하지 않고 돌려서 정한다. 그 패턴을 담은 코드를 만들어 `pnpm tsc --noEmit`, `pnpm test`, 검사기를 실제로 돌린다.
잡히면 그 파일을 지우고 도구에 맡긴다. 잡히지 않으면 `false` 로 둔다.
