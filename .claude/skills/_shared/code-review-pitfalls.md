# Code Review Pitfalls

build-with-teams 의 code-reviewer 가 반복 지적한 코드 패턴. **plan 작성 시점이 아니라 executor 의 코드 작성 시점에 사전 소진** 한다 (common-pitfalls 는 plan 작성 회피, 본 docs 는 코드 작성 회피 — 호출 시점이 다름).

## 호출 시점

| 시점 | 누가 | 어떻게 |
|---|---|---|
| plan 작성 | team-lead | phase 본문에 "회피 항목" 으로 1줄 인용 (executor 가 그 phase 만 보고도 알 수 있도록) |
| executor 코드 작성 시작 직전 | executor | 이 docs 의 해당 카테고리 grep → self-check |
| code-reviewer 검사 | code-reviewer | build-with-teams 7단계 13 항목과 별도로 본 docs 의 모든 항목 grep 게이트 |

## 축적 규칙

- 새 항목 추가 = code-reviewer 가 같은 패턴을 **plan 종료 후 회고 단계에서 발견** 했을 때만. 1회성 단일 사고는 제외 (반복성 확보 후 추가).
- 항목 형식: **증상 / 왜 / 검출 명령 / Self-check**. common-pitfalls 와 동일.
- "왜 이 가드가 필요한지" 1줄 단서 필수 — 미래 AI 가 의도 모르고 우회하지 않도록.
- plan### 사고 사례는 1개로 충분, 복수 나열 금지.
- 카테고리는 4개로 시작, 새 패턴이 어느 카테고리에도 안 들어가면 5번 카테고리 추가.

---

# 1. spinner·UX 순서 회귀 (예약 — plan### 회고에서 채움)

executor 가 헬퍼 추출·재배치 리팩토링 시 spinner / 로깅 / validation 순서를 의도치 않게 바꾸는 사고가 들어갈 자리.

# 2. 에러 처리 일관성 (예약)

# 3. 매직 넘버·문자열 (예약)

# 4. CLI 도메인 규칙 회귀 (예약 — exitCode / stdout vs stderr / ky 강제)

---

## 회고 절차 (build-with-teams 9단계)

PR 생성 후 team-lead 자문:
- code-reviewer 가 이번 plan 에서 FIX_NEEDED 또는 코멘트로 지적한 항목이 있는가?
- 있으면, 그 패턴이 **다른 plan 에서도 발생할 가능성** 이 있는가? (1회성 typo 제외)
- 가능성 있으면, 본 docs 의 해당 카테고리에 항목 추가 (또는 새 카테고리 신설). 1줄 단서 + 검출 명령 + Self-check 까지 채워야 추가.

회고에서 발견된 패턴은 **다음 plan 의 phase 작성 시 critic 평가 전에 소진** 됨 (planning SKILL 8단계 self-check + build-with-teams critic 평가 7번 게이트가 본 docs 도 참조).
