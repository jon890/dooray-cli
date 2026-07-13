---
name: planning
description: 새 기능/변경사항 구현 전 8단계 설계 워크플로우. 구현 가능성·기술 스택·사용자 흐름·인터페이스·데이터 설계·docs 반영·task 생성까지 순차로 모호함을 제거하고 의사결정을 즉시 docs 에 기록한다. "/planning", "계획 세워보자", "설계해보자", "기능 설계", "MVP 계획", "구현 전 검토", "ADR 작성 전 정리" 같은 요청 시 반드시 이 스킬 사용.
---

# planning

새 기능/변경사항을 구현하기 전 8단계 설계 워크플로우. 모호한 부분을 모두 해소하고, 문서를 정비한 뒤 `/plan-and-build` 또는 `/build-with-teams`로 실행에 넘긴다.

## 핵심 원칙 (워크플로우 진행 룰)

- **속도와 안정성의 트레이드오프**: 빠르게 MVP 를 출시하되 안정적인 서비스를 만든다
- **모호함 제로**: 각 단계에서 조금이라도 모호하면 반드시 사용자와 논의.
  넘어가지 않는다
- **review 반복 지적 사전 해소**: task 파일 작성 시 `docs/pitfalls/` 의 패턴을 모두 self-check
  - `docs/pitfalls/plan/` + `docs/pitfalls/team/` (critic 회피)
  - `docs/pitfalls/code-review/` (코드 작성 회피)
  - 매번 같은 지적이 반복되지 않도록 plan 단계에서 미리 해결
- **선택지 제시는 AskUserQuestion 으로**:
  - 옵션 분기 / 결정 묻기 시 `AskUserQuestion` 사용
  - 1~4개 질문, 옵션 2~4개, 추천안 첫 번째 + label 끝 `(추천)` 표기
  - 글로 나열한 long-form 옵션 비교는 사용자 답변 부담 ↑ — 1클릭 인터랙티브화
  - 예외: 결정이 이미 명확하거나 자유 답변 (카피 문구 등) 필요 시 일반 질문

docs 작성 형식 원칙 (간결성·단일 소스·의사결정 의도 보존·6가지 패턴) 은
하단 **8단계 B. 문서 작성 원칙** 단일 소스 참조.

## Review 패턴 사전 해소 (필수)

task 파일을 **사용자에게 제출하기 전**에 `docs/pitfalls/` 전체를 self-check 한다. 이 체크리스트를 거치지 않으면 `/build-with-teams` 실행 시 critic 이 REVISE / code-reviewer 가 FIX_NEEDED 를 내놓고 재평가 / 재검사 사이클이 돈다.

| docs | 회피 대상 | 호출 시점 |
|---|---|---|
| [`docs/pitfalls/plan/`](../../../docs/pitfalls/INDEX.md) | critic 의 plan 평가 지적 | task 파일 작성 직후 self-check |
| [`docs/pitfalls/code-review/`](../../../docs/pitfalls/INDEX.md) | code-reviewer 의 코드 검사 지적 | phase 본문에 회피 항목 1줄 인용 + executor 코드 작성 시작 직전 self-check |

**축적 규칙**: critic / code-reviewer 가 **새로운 타입** 의 지적을 하면 build-with-teams 9단계 회고에서 해당 카테고리 디렉터리에 새 패턴 파일을 추가한다 (build-with-teams SKILL 9-7항 참조).
디렉터리는 시간이 지날수록 파일이 늘어나고, review 사이클에서 할 말은 줄어든다.

**docs-verifier 사전 해소은 별도 회고 docs 를 두지 않는다** — 아래 "거울 구조 원칙" 섹션 참조. docs-verifier 의 반복 지적은 본 SKILL 8단계 A항 docs 영향 표에 행 추가 / 보강 형태로 흡수된다.

## 거울 구조 원칙 (단일 소스 + docs-verifier 흡수)

build-with-teams 의 docs-verifier 검증 항목과 본 SKILL 의 docs 영향 표가 **같은 정의 두 곳에 두지 않는다** 는 원칙. 같은 체크리스트를 두 곳에 유지하면 시간이 지나며 한쪽만 갱신되는 사고가 반드시 발생한다.

**규칙**:

1. **단일 소스**: 본 SKILL 8단계 A항 "변경 유형별 docs 영향 표" 가 docs 갱신의 **유일한 정의**. 모든 변경 유형 (새 resolver, 새 명령, ADR 추가 등) 은 이 표에 행으로 등록되어 있어야 한다.

2. **거울**: `build-with-teams/SKILL.md` 의 docs-verifier 검증 항목 7~10 (planning docs 영향 표 100% 적용 / 역참조 / 갱신 시점 분리 / 공개 스킬 dogfooding) 은 위 표를 거울처럼 참조한다 — 별도 체크리스트 보유 금지. docs-verifier 가 *"별도 체크 항목 X 도 보겠다"* 며 자체 항목을 늘리면 거울이 깨진다.

3. **별도 회고 docs 신설 금지**: docs-verifier 의 UPDATE_NEEDED / VIOLATION 회고는 별도 파일 (`_shared/docs-verifier-pitfalls.md` 등) 신설이 아니라 **본 SKILL 8단계 A항 표 갱신**으로 흡수한다.
   - 흡수 방법: 표에 행 추가 또는 기존 행 보강 (build-with-teams 9-7 회고 단계 참조)
   - critic / code-reviewer 와 처리 방식이 비대칭인 이유: 두 검증자는 *코드/계획 패턴* 회피라 별도 docs 가 자연스러움
   - 반면 docs-verifier 는 *docs 갱신 누락* 만 잡으므로 표 자체가 곧 회피 docs

4. **표 수정 시 두 곳 동기 검토**: 본 표를 수정하면 즉시 `build-with-teams/SKILL.md` 의 docs-verifier 검증 항목 (7~10) 이 새 행을 자연스럽게 커버하는지 확인. 새 검증 카테고리가 필요하면 거기 추가 — 표에는 추가 안 함.

5. **새 변경 유형 추가**: 새 외부 통합 모듈 / 새 CLI 도메인 영역 등이 등장하면 본 표에 행 1줄 추가하면 docs-verifier 가 자동으로 그 변경 유형을 검증하기 시작한다 (별도 코드 변경 불요).

**Why**: 이전엔 docs-verifier 가 매번 같은 항목 (`code-architecture.md` 디렉터리 트리, README 사용법, "N개 명령" 카운트) 을 반복 지적했고, 그때마다 별도 docs-sync-checklist 를 만드는 유혹이 있었다. 한 번 두 곳에 둔 정의는 항상 한쪽만 갱신되어 다른 쪽이 낡는다 (실제 사고 사례). 거울 구조로 단일 소스를 강제하면 갱신 누락 자체가 불가능해진다.

도입 출처: 2026-05-07 ~ 05-08 plan024/025 회고 (사용자 제안). 자세한 도입 맥락은 사용자 로컬 project memory `feedback_planning_docs_impact_table.md` 에 동일 내용 기록 (skill 본문이 단일 소스, memory 는 출처 기록용).

## 실행 절차

사용자가 `/planning {기능 설명}`을 호출하면, 아래 8단계를 **순차적으로** 진행. 각 단계는 사용자의 확인/논의를 거친 후 다음 단계로. 규모가 작은 기능은 1+2를 합치거나 5를 생략할 수 있다.

### 1단계: 구현 가능성 검증

**역할**: CTO

- 기술적으로 구현 가능한지 검증
- 기존 코드베이스에서 재사용 가능한 부분 식별
- 리스크/제약사항 도출
- 모호한 부분이 있으면 즉시 사용자와 논의

**확인할 것**:
- 기존 DB 스키마로 충분한가, 변경이 필요한가?
- 기존 API/서비스로 충분한가?
- 도메인 핵심 로직 변경이 필요한가?
- 외부 의존성 추가가 필요한가?

### 2단계: 기술 스택 검증

- 기존 스택으로 충분한지 확인
- 새 라이브러리 도입이 필요하면 대안 비교 + 사용자와 논의
- MVP에 불필요한 복잡도를 추가하지 않는지 검증

### 3단계: 사용자 흐름 검증 (UI가 있는 레포)

**역할**: 시니어 UX 리서처

- 주요 사용 흐름이 머릿속에 생생히 재현될 정도로 명확화
- 화면 간 전환, 사용자 액션, 시스템 반응 구체화
- 엣지 케이스 (에러, 빈 상태, 권한 등) 점검
- 모호한 부분은 전부 사용자에게 질문

**CLI/백엔드 레포**: 이 단계는 "주요 호출 시나리오 검증"으로 변형. 명령 인자/플래그 조합 또는 API 호출 시퀀스를 구체화.

### 4단계: 화면/인터페이스 설계

- **UI 레포**: 각 화면의 정보·기능 체크리스트, 컴포넌트 구조 초안, 상태 관리 방식
- **CLI 레포**: 명령 시그니처, 옵션, 출력 포맷 (stdout/stderr 구분)
- **백엔드**: 엔드포인트별 요청/응답 스키마

### 5단계: API 설계

- 필요한 엔드포인트/함수 목록 (Server Action vs API Route vs gRPC vs CLI command 판단)
- 요청/응답 스키마 초안
- 스트리밍/실시간 필요 여부
- 기존 엔드포인트/함수 재사용 가능 여부

### 6단계: 데이터/아키텍처 설계

**역할**: CTO

- DB 스키마 변경 필요 시 마이그레이션 계획
- 코드 아키텍처 (디렉터리 구조, 레이어 분리)
- 기존 패턴과의 일관성 확인
- 모호한 설계 결정은 사용자와 논의

### 7단계: 기술 결정사항 점검

- 이번 기능에서 내린 기술적 결정 목록화
- 각 결정의 "왜"를 명확히 기록
- ADR 초안 작성 (필요한 경우 — **하단 ADR 작성 전 점검 통과 후**)

#### A. ADR 작성 전 점검 (필수 자문)

아래 3개 질문에 **모두 NO** 여야 ADR 로 기록한다. 하나라도 YES 면 대안 채널 (CLAUDE.md 규칙 / 코드 주석 / 커밋 메시지 / 다른 docs) 로 내려보낸다.

1. `package.json` · lockfile · `tsup.config` · `src/api/types.ts` · 디렉터리 트리 중 **어느 하나를 보면 같은 정보를 얻는가**?
2. "왜 X 를 선택했다"를 1~2 문장 이상으로 설명하기 어려운가? (결정 / 맥락 / 대안 중 하나라도 비면 ADR 적격 아님)
3. 다른 프로젝트에서도 일반적으로 하는 선택인가?

**유지 적격 유형** (위 3개가 모두 NO 일 때):
- 라이브러리 고유 함정 (문서에 없거나 직관에 반하는 API 특성 — 예: ky retry 정책, imapflow UID 처리)
- 실험 결과 (벤치마크 cold/warm 수치 등 A/B 비교)
- 대안 기각 근거 (미래 재논의 여지 — 예: axios vs ky)
- 정책 / 규칙 (팀 합의로 정한 규율 — 예: 개인 식별 정보 노출 금지)
- 비용 / 성능 트레이드오프 (수치 있는 결정)

#### B. ADR 구조 템플릿 (필수 포맷)

```markdown
## ADR-XXX: {제목 — 결정의 한 줄 요약}

- **결정**: {무엇을 — 1~3 문장}
- **맥락**: {왜 필요했는가 — 제약 / 데이터 / 관찰}
- **대안 기각**: {다른 옵션 각각 1~2 줄, 왜 아닌가}
- (선택) **트레이드오프**, **적용 범위**
```

**금지**:
- 코드 블록 10 줄 이상 (1~3 줄 식별자 예시만 허용)
- 파일 경로 3개 이상 나열
- "변경 항목 1/2/3/4" 작업 내역 / "레거시 삭제 목록" (task 기록이지 ADR 아님)
- CLAUDE.md 스택 규칙 반복

#### C. 문서 책임 표 (단일 소스 + 역참조)

신규 내용 작성 전 "이 정보의 단일 소스는 어디인가" 확인. 다른 문서에는 **링크 또는 한 줄 참조**만.

| 내용 유형 | 단일 소스 | 역참조 / 링크해야 할 곳 |
|---|---|---|
| 명령 동작 / 옵션 / 주의사항 | `CLAUDE.md` 주의사항 표 | `README.md` (사용 예만), `skills/dooray-cli/SKILL.md` (AI 자동화 시나리오) |
| 디렉터리 구조 / 레이어 | `docs/code-architecture.md` 디렉터리 구조 | `CLAUDE.md` (요약 한 블록) |
| 기술 결정 근거 (왜) | `docs/adr.md` (해당 ADR) | `CLAUDE.md` ADR 참조 표, `docs/code-architecture.md` 해당 영역에 ADR-NNN 한 줄 |
| 캐시 / 파일 레이아웃 | `docs/adr.md` (해당 ADR) | `CLAUDE.md` 캐시 규약 행 |
| API 호출 패턴 / 엔드포인트 함정 | `docs/adr.md` (해당 ADR — 예: ADR-015 파일 307, ADR-026 wiki 함정) | `docs/code-architecture.md` api/ 섹션 |
| DB / 데이터 스키마 | `docs/data-schema.md` | `docs/adr.md` (스키마 결정 ADR) |
| 사용자 흐름 / 시나리오 | `docs/flow.md` | `docs/prd.md` (기능 → 흐름 매핑) |

**역참조 규칙 (필수)**: 새 ADR 추가 시, ADR이 기술하는 영역의 코드 디렉터리 / 명령에 대해 `docs/code-architecture.md` 또는 `CLAUDE.md` ADR 참조 표 **둘 중 한 곳에 ADR-NNN 한 줄 추가**. 단방향 정의 + 양방향 발견 가능성.

#### D. 문서 연결 그래프

```
docs/adr.md  ←──── (ADR-NNN 역참조) ────  docs/code-architecture.md
   ↑                                            ↑
   └────── CLAUDE.md (주의사항 + 표) ──────────┘
                       ↓
               README.md (사용 예만)
                       ↓
        skills/dooray-cli/SKILL.md (공개, 자동화 시나리오)

docs/data-schema.md           ←  docs/adr.md (스키마 결정 ADR)
docs/flow.md                  ←  docs/prd.md
```

핵심: **단일 소스 1개 + 역참조 N개**. 같은 정보가 두 문서에 "본문"으로 들어가면 부패.

### 8단계: 최종 문서 생성

#### A. 변경 유형별 docs 영향 표 (필수 — 누락 0 화)

신규 작업 시 아래 표에서 해당 행을 찾아 **표시된 모든 docs 를 손댄다**. "(해당 시)" 같은 모호한 어휘 금지 — 표시되어 있으면 변경, 표시 없으면 미손.

| 변경 유형 | CLAUDE.md | adr.md | code-architecture.md | prd.md | flow.md | data-schema.md | README.md | skills/dooray-cli/SKILL.md |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 신규 CLI 명령 (소) | 주의사항 1줄 + "N개 명령" 카운트 | — | 디렉터리 트리 + 필요 시 utils 추가 | MVP 범위 한 줄 (`- \`dooray X\` — 한 줄 설명`) | 사용자 흐름 섹션 (대화 / 입출력 예시) | (캐시 도입 시) | 사용 예 섹션 | 빠른 참조 표 + 자동화 시나리오 |
| 신규 ADR 동반 변경 | 주의사항 + ADR 참조 표 행 | ADR 본문 | 해당 영역에 ADR-NNN 역참조 한 줄 | (사용자 facing 변경 시) | (사용자 흐름 변경 시) | (스키마 결정 시) | 사용 예 (해당 명령 있을 때) | 시나리오 (해당 명령 있을 때) |
| 캐시 schema / TTL 변경 | 캐시 규약 행 | ADR 갱신 (ADR-004/010) | utils/cache 섹션 | — | — | 캐시 디렉터리 + 스키마 본문 | — | — |
| 새 API 호출 패턴 (재시도/redirect 등) | — | 정책 결정 ADR (예: ADR-015, ADR-026) | api/ 섹션 + ADR-NNN 역참조 | — | — | — | — | — |
| DB 스키마 변경 | — | 결정 ADR | api/ 섹션 (해당 시) | — | — | 스키마 본문 | — | — |
| 사용자 흐름 변경 (옵션 추가/UX) | — | — | — | (MVP 범위 변경 시) | 흐름 추가/수정 | — | 사용 예 (해당 시) | 시나리오 (해당 시) |
| 기존 resolver 입력 형식 확대 (이메일/ID 분기 등) | 주의사항의 resolver 설명 1줄 갱신 | — | resolver 주석 1줄 갱신 | — | 사용 예 (자동 분기 시나리오) | — | 사용 예 (해당 명령) | 빠른 참조 표 + 동명이인 우회 같은 시나리오 |
| 기존 type 의 필드 시그니처 변경 (optional 완화 / 필드 추가·제거) | 주의사항의 관련 동작 1줄 (영향 있을 때) | (ADR 가치 있을 때 — 함정 묶음) | resolver/cache 줄에 동작 변경 1줄 | — | — | **interface 정의 정정 (필수)** + TTL/예시 동기화 | 사용 예 (영향 명령 있을 때) | 시나리오 (영향 시) |
| 의존성 추가 / 빌드 설정 | 빌드 명령 (해당 시) | ADR 작성 전 점검 후 ADR | 기술 스택 표 | — | — | — | — | — |

**갱신 시점 분리** (executor 위임 vs 즉시 반영):

| docs | 갱신 시점 | 이유 |
|---|---|---|
| `adr.md`, `code-architecture.md`, `CLAUDE.md`, `data-schema.md`, `flow.md`, `prd.md` | **planning 단계에서 즉시 반영 + commit** | 기획 결정의 단일 소스. task 생성 후 변경 금지 (코드↔docs 결정 mismatch 회피) |
| `README.md`, `skills/dooray-cli/SKILL.md` | **task 마지막 phase (phase-N)** | 코드 산출물 (실제 명령 인자/옵션) 에 의존 — phase-1·2 후에야 정확히 작성 가능 |

이 분리를 phase 작성 시 명시적으로 따른다. planning 결정 docs 를 phase 안에서 변경하면 critic REVISE 또는 docs-verifier VIOLATION 사유.

#### B. 문서 작성 원칙

- AI 에이전트를 위한 문서 — 컨텍스트 낭비하지 않도록 간결하게
- 같은 내용을 두 문서에 "본문"으로 쓰지 않는다 (단일 소스 + 역참조)
- 의사결정 의도("왜 이렇게 했는가")는 반드시 보존
- 구현 세부사항은 코드에, docs에는 "무엇을·왜"만
- **가독성 + 토큰 효율**: `dooray-cli/CLAUDE.md` "docs / ADR 작성 형식" 6가지 패턴 따른다 (패턴 정의는 거기에 단일 소스)

---

## 중간 의사결정 시 즉시 docs 반영 (필수)

각 단계에서 사용자와 의사결정이 완료되면, 8단계를 기다리지 않고 **즉시 docs에 반영**한다.
이는 논의가 길어질 때 결정 사항이 유실되는 것을 방지하고, 다음 대화에서도 결정 맥락을 참조할 수 있게 한다.

### 반영 직후 가독성 self-check (필수, commit 직전)

`CLAUDE.md` "docs / ADR 작성 형식" 6가지 패턴 정책 단일 소스.
작성/수정한 docs 에 대해 commit 직전 다음 명령으로 자가 점검:

```bash
# 변경한 docs 파일들 (예: docs/adr.md CLAUDE.md docs/code-architecture.md docs/flow.md)
for f in <변경 파일>; do
  echo "=== $f ==="
  # 패턴 5 (200+ char) — 디렉터리 트리 / 코드 블록 / 표 / 헤더 제외 (정책 명시)
  awk '
    /^```/ { in_code = !in_code; next }
    in_code { next }
    /^\|/ { next }
    /^#/ { next }
    { if (length($0) > 200) print "  "NR": "length($0)" chars" }
  ' "$f"
  # 패턴 2 (enumerated inline)
  grep -nE "①|②|③|④|⑤|⑥|⑦|⑧|⑨" "$f"
  # CLAUDE.md 한국어 표현 정책 — 외래어 음차 합성 (매트릭스/게이트/트리아지/베이스라인/스파이크)
  # 정책 정의 자체 (금지 표 본문) 는 grep 결과에서 사람이 판단해 제외
  grep -nE "매트릭스|게이트|트리아지|베이스라인|스파이크" "$f"
done
```

위반 검출 시:
- 패턴 5 (200+ char) — semantic line break 적용 또는 sub-bullet 분리
- 패턴 2 (enumerated inline) — bullet list 로 변환
- 외래어 음차 합성 — `CLAUDE.md` "한국어 표현 정책" 표의 권장 대체 적용 (예: "매트릭스" → "표 / 분담 표 / 영향 표", "게이트" → "사전 점검 / 통과 조건")

이 self-check 를 거치지 않고 commit 하면 docs-check (주기적 종합 검토) 가 다음 cycle 에서 후속 검출 — 한 cycle 지연 + commit history 에 위반 commit 누적.
**검사 대상은 본 변경 파일만** (전체 docs 가독성 점검은 `docs-check` skill).

거울 구조 — 패턴 정의는 `CLAUDE.md` 단일 소스. 본 섹션은 *검증 시점 + 실행 명령*만 명시.

## 완료 후

8단계가 끝나면 사용자에게 안내:

> 설계가 완료되었습니다. `/plan-and-build` 또는 `/build-with-teams`로 구현을 시작할까요?

---

## 단계 건너뛰기 가이드

| 기능 규모 | 권장 단계 |
|---|---|
| 소 (버그 수정, UI 미세 조정) | 1 → 8 (나머지 생략) |
| 중 (기존 기능 확장, 프롬프트 개선) | 1 → 3 → 6 → 7 → 8 |
| 대 (신규 기능, 파이프라인 추가) | 전체 8단계 |
| **CLI 레포 (dooray-cli) — 전 규모** | **4단계 압축: (1+2) → (3+4) → (5+6) → (7+8)** |

CLI 레포에서는 8단계를 4단계(1+2 합침, 3+4 합침, 5+6 합침, 7+8 합침)로 압축 가능 — 단 각 합쳐진 단계 내부에서 모호함 제거는 동일하게 수행. UI가 없으므로 3단계는 "주요 호출 시나리오 검증(명령 인자/플래그 조합, API 호출 시퀀스)"으로, 4단계는 "명령 시그니처·옵션·출력 포맷(stdout/stderr)"으로 해석한다.

## task 네이밍 규칙

### 형식: `{NNN}-{task-name}`

모든 새 task 폴더는 `tasks/{NNN}-{task-name}/` 형식으로 만든다.

- `NNN` = 3자리 zero-padded 순차 번호 (001, 002, ...)
- `task-name` = 케밥 케이스 간결 요약. Issue 연결은 `index.json`의 `description` 필드에 남긴다 (폴더명에 issue 번호 넣지 않음 — 폴더명 중복 회피 + 범용성)

예시:
```
tasks/004-fix-dooray-error-decode/           # Issue #6
tasks/005-fix-wiki-page-create-parent-fallback/  # Issue #5
tasks/006-feat-wiki-page-edit-non-interactive/   # Issue #4
```

`index.json`의 `name` 필드도 폴더명과 **동일**하게 설정 (`"name": "006-feat-wiki-page-edit-non-interactive"`).

### 번호 충돌 방지 (필수)

**번호를 부여하기 전에 반드시 기존 번호를 확인한다.** 다른 세션이나 parallel 작업으로 번호가 추가되어 있을 수 있다.

```bash
# cwd: <repo root>
# 현재 사용된 task 번호 전체 확인
ls tasks/ | grep -E "^[0-9]{3}-" | sort

# ADR 번호 확인 (별개)
grep "^## ADR-{후보번호}" docs/adr.md
```

다음 가용 번호(가장 큰 번호 + 1)를 사용. 번호 없는 레거시 폴더는 count에 포함하지 않는다 (소급 rename 금지 원칙).

### 서브넘버 규칙

비슷한 성격의 후속 작업은 같은 번호에 서브넘버를 붙여 묶는다:

```
006-feat-wiki-page-edit-non-interactive      # 원본
006-2-feat-wiki-page-bulk-edit               # 동일 도메인 후속 확장
```

묶기 기준: 동일 도메인 확장 / 동일 패턴 복제
별도 번호 부여 기준: 서로 다른 도메인 / 독립 실행 가능 + 의존 관계 없음

### ADR 번호는 별개

ADR(`docs/adr.md`)의 `ADR-{N}`과 task 번호는 **독립적**. ADR은 기술 결정 단위, task는 구현 단위.
