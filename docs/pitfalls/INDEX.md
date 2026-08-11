# Pitfalls INDEX

이 디렉터리는 모놀리식 문서가 아니다.
패턴 1개 = 파일 1개 구조다.
전부 읽지 말고 아래 라우터로 필요한 파일만 찾아서 읽는다.

## 소비 방식

1. 아래 라우터 표에서 지금 하는 작업 유형(plan 작성 / team 운영 / code-review)에 해당하는 행을 찾는다.
2. 그 행이 가리키는 디렉터리만 살펴본다 — 전체 `docs/pitfalls/` 를 다 읽지 않는다.
3. 구체적으로 어떤 패턴인지 짐작 가면 해당 파일 하나만 읽는다.
4. 애매하면 그 카테고리 디렉터리 전체(`ls docs/pitfalls/<category>/*.md`)를 훑는다.

## 라우터 표

| 카테고리 | 디렉터리 | 호출 시점 | 사용 스킬 |
| --- | --- | --- | --- |
| plan 작성 | `plan/` | task 파일 작성 직후 self-check | `planning`, `build-with-teams` |
| team 운영 | `team/` | 팀원 스폰·메시지 작성 시 | `build-with-teams` |
| code-review | `code-review/` | 코드 작성·리뷰 시 | `build-with-teams`, `review-fix` |

## 축적 규칙

새 패턴을 추가할 때는 아래 4조건 점검을 통과해야 한다.

- **재발성**: 같은 사고가 다른 plan·PR 에서도 발생할 가능성이 있다 (1회성 오타·특정 plan 컨텍스트 종속 코멘트는 제외).
- **심각도**: critic REVISE·code-reviewer FIX_NEEDED 급 이상이다.
- **도구로 못 잡음**: tsc·lint·test 가 이미 잡는 패턴이면 새 파일 대신 `tool_catchable: true` 로 표시하고 굳이 추가하지 않는다.
- **추상화 가능**: 특정 PR 하나에만 해당하지 않고 일반 규칙으로 서술 가능하다.

4조건을 모두 만족하면 해당 카테고리 디렉터리에 새 패턴 파일 1개를 추가한다.

- 1회성 지적은 PR reply 로 끝내고 파일을 만들지 않는다.
- 주기적으로 prune·automate 패스를 돈다 — 도구(tsc/lint/test)로 자동 검출 가능하게 승격된 패턴은 해당 파일을 삭제하고 도구 설정으로 옮긴다.
- PR review 로 발견한 code-review 패턴의 누적은 `review-fix` 7단계 절차를 따른다 — 처리 후 재발 가능성이 있으면 `code-review/` 에 새 패턴 파일을 만든다.

## 호출 시점 (누가 언제 참조하는가)

같은 `code-review/` 디렉터리라도 참조하는 주체와 시점이 다르다.

| 시점 | 누가 | 어떻게 |
| --- | --- | --- |
| plan 작성 | team-lead | phase 본문에 "회피 항목"으로 1줄 인용 (executor 가 그 phase 만 보고도 알 수 있도록) |
| executor 코드 작성 시작 직전 | executor | 해당 카테고리 디렉터리를 grep 하여 self-check |
| code-reviewer 검사 | code-reviewer | build-with-teams 7단계 13 항목과 별도로 `code-review/` 전 항목 grep 점검 |

## 회고 절차 (build-with-teams 9단계)

PR 생성 후 team-lead 가 자문한다.

- code-reviewer 가 이번 plan 에서 FIX_NEEDED 또는 코멘트로 지적한 항목이 있는가?
- 있으면, 그 패턴이 **다른 plan 에서도 발생할 가능성**이 있는가? (1회성 typo 는 제외)
- 가능성이 있으면 위 축적 규칙 4조건 점검을 통과시켜 해당 카테고리 디렉터리에 새 패턴 파일을 추가한다 (또는 새 카테고리 디렉터리 신설).

회고에서 발견된 패턴은 **다음 plan 의 phase 작성 시 critic 평가 전에 소진**된다 (`planning` 스킬 8단계 self-check와 `build-with-teams` critic 평가 7번 통과 조건이 본 INDEX 도 참조).

## 파일 형식

각 패턴은 파일 1개다.
frontmatter와 본문 구조를 따른다.

```yaml
---
id: <kebab-slug>              # 영어 kebab-case, 번호 아님 (예: adr-number-collision)
category: plan | team | code-review
title: <원본 패턴 제목 그대로>
triggers: [<키워드>, ...]     # 한/영 키워드 (원본 제목·본문에서 추출)
tool_catchable: true | false  # ruff/tsc/test 가 이미 잡으면 true
source: [<출처>]              # 원본 번호(1-3 / 2-5 / CLI7 / code-review 5-2) + PR#/ADR# 있으면 함께
related: [<다른 id>, ...]     # 관련 패턴 id (없으면 빈 배열)
---

**증상**: ...
**Good**: ...
**검출**: (grep/find 명령 있으면 코드블록)
**Self-check**: ...
**Why**: ...
```

- 원본 텍스트를 요약·재작성하지 않고 그대로 옮긴다.
- 원본에 없는 항목(예: Self-check 없음)은 억지로 만들지 않고 생략한다.
- 중복 의심 패턴(예: 이중 단언 계열)은 병합하지 않고 각 파일로 보존한 뒤 `related` 로 상호 링크한다.
