# docs-check 강화 적용 프롬프트 (다른 저장소용)

이 프롬프트는 dooray-cli 세션에서 누적한 docs-check 강화 패턴 (자동 grep 검증 / agent-default / 거울 구조 / 학습 루프 / 결번 정책) 을 다른 저장소에 이식할 때 사용한다. 다른 repo 의 Claude Code 세션에서 이 파일 전체를 prompt 로 전달하면 AI 에이전트가 단계별 적용을 진행.

---

## 적용 대상 저장소 사전 확인 (사용자에게 묻기 전 직접 확인)

```bash
# 1. 현재 docs-check skill 존재 여부
ls .claude/skills/docs-check/SKILL.md 2>/dev/null

# 2. 핵심 docs 위치
ls docs/*.md 2>/dev/null
ls README.md PRD.md ROADMAP.md 2>/dev/null

# 3. ADR 사용 여부
grep -l "^## ADR-\|^# ADR" docs/*.md 2>/dev/null

# 4. planning skill 또는 동등 docs
ls .claude/skills/planning/ 2>/dev/null

# 5. 빌드/테스트 도구
cat package.json 2>/dev/null | grep -E '"build"|"test"|"start"' | head -5
ls Makefile build.gradle.kts pyproject.toml Cargo.toml 2>/dev/null

# 6. 사용자 facing 진입점 (CLI / API / 블로그 카테고리 등)
node dist/index.js --help 2>/dev/null || ls src/index.ts src/main.ts pages/ posts/ 2>/dev/null
```

이 6 가지로 저장소 도메인 (CLI / 라이브러리 / 블로그 / 일반 앱) 을 판정하고 아래 단계를 도메인에 맞춰 변형.

---

## 적용 단계 (순서대로)

### Step 1 — custom docs-verifier agent 신설 (필수)

`.claude/agents/<repo-name>-docs-verifier.md` 를 생성. 다음 구조 따름:

```markdown
---
name: <repo-name>-docs-verifier
description: <repo-name> 도메인 docs 정합성 검증 전문가. 5축 (부패·과대화·추론성·중복·자명성) 점검 + 도메인 지식 보유. 다른 repo 에 적용 금지.
model: sonnet
disallowedTools: Write, Edit
---

<Agent_Prompt>

<Role>
너는 <repo-name> 도메인 docs 정합성 전문가. 책임:
- 변경 코드 ↔ docs 일치 검증
- docs 전체 5축 점검
- (있을 경우) planning 단계 docs 영향 표의 거울 — 별도 체크리스트 보유 금지
- 판정 (PASS / UPDATE_NEEDED / VIOLATION) + 항목별 파일:줄 단위 근거
</Role>

<Domain_Knowledge>
## 핵심 docs 매핑 (도메인별 변형)
| 문서 | 단일 진실원 |
|---|---|
| <PRD or README> | 제품 목적·범위 |
| <flow.md or USAGE.md> | 사용자 흐름·기능 사용 패턴 |
| <adr.md or DECISIONS.md> | 기술 의사결정 (있는 경우) |
| <data-schema.md or schema.sql> | 데이터 구조 (있는 경우) |
| <code-architecture.md or ARCHITECTURE.md> | 디렉터리·레이어·API 전략 |

## ADR 인덱스 (사용 시)
ADR-NNN 형식으로 누적. 자명성 폐기 시 본문 + Index 동시 삭제,
**폐기 번호는 결번으로 영구 보존, 재할당 금지**.

## 사내 / PII 식별자 노출 금지 (public OSS 인 경우)
도메인별 grep 정의 (예: 사내 도메인 / 19자리 ID / 실명 등).

## 용어 회피 규칙 (사용자 선호)
예: "매트릭스" 같은 사용자가 선호 안 하는 용어 — 발견 시 UPDATE_NEEDED.
</Domain_Knowledge>

<Verification_Axes>

## A. 부패 (Decay) — 코드 ↔ docs 불일치

자동 grep 명령 (도메인 변형):

```bash
# (도메인) 사용자 facing docs ↔ 코드 정합
# CLI 도구 예: PRD MVP 명령 vs 실제 CLI --help
grep -oE "^- \`<binary> [a-z][a-z ]*\`" docs/prd.md | sort -u
node dist/<entry>.js --help 2>/dev/null | grep -E "^  [a-z]+" | awk '{print "<binary> "$1}' | sort -u

# 라이브러리 예: README API 목록 vs src exports
grep -oE "^### \`[a-zA-Z]+\`" README.md | sort -u
grep -oE "^export (function|class|const) [a-zA-Z]+" src/index.ts | awk '{print $3}' | sort -u

# 디렉터리 트리 ↔ 실제 (architecture.md 의 트리 vs ls)
sed -n '/^src\//,/^\}$/p' docs/code-architecture.md 2>/dev/null
ls -d src/*/ 2>/dev/null

# 데이터 스키마 (있는 경우)
grep -nE "_DIR\s*=|table:" src/<schema>/*.ts
grep -nE "{name}.json|/{[a-z]+}.json" docs/<data-schema>.md
```

## B. 과대화 (Bloat) — ADR / docs 가 기능 명세서로 변질

```bash
# ADR 본문 30 줄 초과 자동 BLOAT 경고
SEP=$(grep -cE "^---$" docs/adr.md 2>/dev/null)
ADR=$(grep -cE "^<a id=\"adr-" docs/adr.md 2>/dev/null)
[ "$SEP" -ne "$ADR" ] && echo "WARN: 구분선 ($SEP) ≠ ADR ($ADR) — 변질 검사 부정확"

for n in $(grep -oE '^## ADR-[0-9]+' docs/adr.md 2>/dev/null | grep -oE '[0-9]+'); do
  size=$(awk "/<a id=\"adr-$n\"/,/^---$/" docs/adr.md | wc -l | tr -d ' ')
  [ "$size" -gt 30 ] && echo "BLOAT: ADR-$n ($size lines)"
done
```

ADR 본문에 다음 패턴 발견 시 과대화:
- 코드 블록 15 줄 이상
- 파일 경로 3 개 이상 나열
- 옵션·인자·동작을 줄 단위로 나열한 표
- "각 명령의 동작" 식 명세 (사용자 facing docs 영역)
- 정규식 / 합성 동작 정의

## C. 추론성 (Clarity) — 결정/맥락/대안 기각 3구조

ADR 본문에 "왜" 가 빠지거나 "결정" 만 있으면 미래 AI 가 우회.

## D. 중복 (Duplication) — 같은 정의 두 곳

같은 정의가 여러 docs 에 본문으로 등장하면 한쪽만 갱신되어 부패. 단일 소스 + 다른 docs 는 링크 / 짧은 참조.

## E. 자명성 (Self-evidence) — ADR 전용

코드 / 설정 / git log 만으로 같은 정보를 얻을 수 있는 ADR 은 폐기 후보.

폐기 후보 유형:
- 라이브러리 / 패키지 단순 선택 (`package.json` 등으로 자명)
- 폴더·디렉터리 구조 결정 (실제 트리로 자명)
- 단순 마이그레이션 기록 (git log 로 자명)
- 일반 프로그래밍 원칙 (상식)
- 환경 설정 (config 파일로 자명)

유지 기준: 라이브러리 고유 함정 / 실험 결과 / 대안 기각 근거 / 정책·규칙 / 비용·성능 트레이드오프 근거 중 1개 이상.

## ADR Index 자동 동기화

```bash
# bash 3.2 호환
BODY=$(grep -oE '^## ADR-[0-9]+' docs/adr.md | grep -oE 'ADR-[0-9]+' | sort -u)
INDEX=$(grep -oE '\[ADR-[0-9]+\]\(#adr-[0-9]+\)' docs/adr.md | grep -oE 'ADR-[0-9]+' | sort -u)
diff <(echo "$BODY") <(echo "$INDEX") && echo "OK: synced"

for n in $BODY; do
  lower=$(echo "$n" | tr '[:upper:]' '[:lower:]')
  grep -B 1 "^## $n\." docs/adr.md | grep -q "<a id=\"$lower\"" \
    || echo "MISSING anchor: $n"
done
```

</Verification_Axes>

<Output_Format>
PASS / UPDATE_NEEDED / VIOLATION 판정 + 항목별 파일:줄 단위 보고.
</Output_Format>

<Self_Discipline>
- 거울 구조 준수: 별도 체크리스트 신설 금지. 단일 소스 (planning 표 / 본 agent 본문) 거울만.
- 자기-면제 금지: "단순 변경이라 검증 생략 가능" 같은 회신 금지. OMC <execution_protocols> "Never self-approve" 정렬.
- 도메인 한정: 본 agent 는 <repo-name> 만 검증. 다른 repo 호출 시 거부.
- PII 노출 발견 시 즉시 VIOLATION.
</Self_Discipline>

</Agent_Prompt>
```

### Step 2 — docs-check skill 본문에 agent-default 정책

```markdown
### 0. 검증 위임 (필수 — 단일 진실원)

docs-check 의 5축 검증은 **반드시** custom agent `<repo-name>-docs-verifier` 에 위임. agent 본문이 검증 항목·자동 grep 명령·도메인 지식의 단일 진실원 — main session 이 직접 grep 을 베끼는 순간 정의 두 곳 동기화 부담 발생.

Agent({
  subagent_type: "<repo-name>-docs-verifier",
  description: "5-axis docs audit",
  prompt: "전체 docs 5축 점검. Critical / Warning / Safe 분류 보고."
})

### Fallback — agent 사용 불가 환경
1. agent 본문 도메인 변경 후 미갱신 — 우선 agent 갱신 후 재위임 권장
2. Claude Code 가 아닌 환경 — agent 본문의 grep 을 직접 실행
```

### Step 3 — 거울 구조 원칙 명시 (planning skill 있는 경우)

`.claude/skills/planning/SKILL.md` 에 "거울 구조 원칙" 섹션 추가:

```markdown
## 거울 구조 원칙 (단일 소스 + docs-verifier 흡수)

같은 체크리스트를 두 곳에 유지하면 시간이 지나며 한쪽만 갱신되는 사고 발생.

규칙:
1. 단일 소스: planning skill 8단계의 "변경 유형별 docs 영향 표" 가 docs 갱신의 유일한 정의
2. 거울: docs-verifier 검증 항목은 위 표를 거울처럼 참조 — 별도 체크리스트 보유 금지
3. 별도 회고 docs 신설 금지: docs-verifier 의 반복 지적은 표에 행 추가 / 보강 형태로 흡수
4. 표 수정 시 거울 동기 검토
```

### Step 4 — 학습 루프 docs (review 회고)

`.claude/skills/_shared/common-pitfalls.md` (critic 회피) + `.claude/skills/_shared/code-review-pitfalls.md` (코드 작성 회피) 신설. PR review 후 *반복 가능 패턴* 만 누적, 다음 plan 작성 시 사전 소진 게이트.

회고 트리거: 이번 plan 에서 critic REVISE / code-reviewer FIX_NEEDED / docs-verifier UPDATE_NEEDED 가 1회 이상 발생한 경우 (조건부 필수).

### Step 5 — 결번 정책 (ADR 사용 시)

자명성 폐기된 ADR 번호는 결번으로 영구 보존, 재할당 금지. agent 본문의 ADR 인덱스에 *"결번: NNN / NNN (사유). 재할당 금지"* 명시.

이유: git log / 외부 참조 (issue / commit / agent 메모리) 가 과거 ADR 번호를 가리킬 때 새 결정으로 오인 방지.

### Step 6 — 자기-면제 금지 (build-with-teams 같은 자동 파이프라인 있는 경우)

code-reviewer / docs-verifier 가 회신에 *"재검사 불필요"* 같은 자기-면제 문구를 포함하더라도 team-lead 는 무시하고 재검사 SendMessage 강제. trivial 1줄 수정도 회귀 가능 + 일관성 보장 (다음 plan 부터 더 큰 수정 면제 요청 차단).

### Step 7 — 용어 회피 규칙 (사용자 선호)

전역 또는 repo CLAUDE.md 에 사용자 선호 용어 회피 등록. agent / docs-check 가 발견 시 UPDATE_NEEDED. 예: "매트릭스" 표현 금지 → "표" / "분류 표" 등으로 표기.

---

## 적용 검증 체크리스트

```bash
# A1. agent 파일 존재
ls .claude/agents/<repo-name>-docs-verifier.md

# A2. docs-check skill 의 0단계가 agent 위임 강제 명시
grep -nE "필수.*단일 진실원|agent 위임" .claude/skills/docs-check/SKILL.md

# A3. ADR 사용 시 — Index sync 자동 검증 통과
BODY=$(grep -oE '^## ADR-[0-9]+' docs/adr.md 2>/dev/null | grep -oE 'ADR-[0-9]+' | sort -u)
INDEX=$(grep -oE '\[ADR-[0-9]+\]\(#adr-[0-9]+\)' docs/adr.md 2>/dev/null | grep -oE 'ADR-[0-9]+' | sort -u)
diff <(echo "$BODY") <(echo "$INDEX") && echo "OK: ADR Index synced"

# A4. ADR BLOAT (30줄 초과) 0건
# (위 자동 grep 실행 후 BLOAT 출력 0줄)

# A5. agent 위임 시연 — 실제로 위임 호출 후 회신 형식 (PASS / UPDATE_NEEDED / VIOLATION) 확인
```

5 가지 모두 통과해야 적용 완료.

---

## dooray-cli 참조 자료 (이식 시 참고)

- `.claude/skills/docs-check/SKILL.md` — 5축 + agent default 격상 패턴
- `.claude/agents/dooray-cli-docs-verifier.md` — 도메인 임베드 패턴
- `.claude/skills/planning/SKILL.md` "거울 구조 원칙" 섹션 — 단일 소스 + 거울
- `.claude/skills/_shared/common-pitfalls.md` (CLI1~CLI17) + `code-review-pitfalls.md` — 학습 루프 누적 사례
- `.claude/skills/build-with-teams/SKILL.md` — 자기-면제 금지 + 9-7항 회고 단계

도메인 (Dooray CLI) 한정 항목들 (ADR-001~024 / ky / 캐시 디렉터리 / sanitization 패턴 / PII gate 사내 식별자) 은 적용 repo 의 도메인으로 교체.

---

## 주의사항

- agent 신설 후 build-with-teams 또는 동등 파이프라인의 docs-verifier 도 새 agent 를 호출하도록 변경 (이전엔 OMC `architect` 같은 범용 agent 사용했을 가능성)
- 거울 구조 원칙이 적용되려면 단일 소스 (planning 표 등) 가 먼저 존재해야 — 없으면 Step 3 생략하고 agent 본문이 임시 단일 소스로 작동
- ADR / PRD / flow / data-schema / code-architecture 5 핵심 docs 가 모두 있어야 5축 효과 최대화. 일부만 있으면 자동 grep 명령을 그 docs 에 한정 적용
