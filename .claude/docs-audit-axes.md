# dooray-cli 문서 감사 축

이 문서는 `docs-check` 의 dooray-cli 전용 6축 판정 기준을 소유한다.
`build-with-teams` 의 docs-verifier 는 공용 코어의 `references/role-docs-verifier.md` 를 쓴다.

## 준비

검증 전에 아래를 읽는다.

| 확인 대상 | 단일 소스 |
| --- | --- |
| ADR 번호와 주제 | [docs/adr/INDEX.md](../docs/adr/INDEX.md) |
| 캐시 파일 구조와 TTL | [docs/data-schema.md](../docs/data-schema.md) |
| 코드 컨벤션, 개인 식별 정보 금지 유형 | [CLAUDE.md](../CLAUDE.md) 와 `scripts/check-pii.mjs` |
| docs 갱신 범위 | [.claude/planning-overlay.md](planning-overlay.md)의 "변경 유형별 docs 영향 표" |
| 글의 구조 규칙 | 글로벌 `~/.claude/rules/writing-structure.md` |
| 마크다운 렌더링 규칙 | 글로벌 `~/.claude/rules/markdown-readability.md` |

## dooray-cli docs 역할

| 문서 | 담는 것 |
| --- | --- |
| [docs/prd.md](../docs/prd.md) | 제품 목적, MVP 범위, 우선순위 |
| [docs/flow.md](../docs/flow.md) | 사용자 흐름, 명령 사용 패턴 |
| [docs/adr/](../docs/adr/) | 기술 의사결정, 왜, 대안 기각 |
| [docs/data-schema.md](../docs/data-schema.md) | 캐시 구조, TTL, resolver 로직 |
| [docs/code-architecture.md](../docs/code-architecture.md) | 디렉터리 트리, 레이어, 의존 방향, API 전략 |
| [CLAUDE.md](../CLAUDE.md) | 코드 작업 지침 |
| [README.md](../README.md), [skills/dooray-cli/](../skills/dooray-cli/) | 사용자와 에이전트 대상 사용 가이드 |

## A. 부패

코드와 docs 가 맞는지, 제거된 엔티티가 docs 에 남아 있는지 본다.

```bash
# code-architecture.md 의 resolvers 트리 vs 실제
DOC=$(sed -n '/^  resolvers\/$/,/^  services\//p' docs/code-architecture.md | grep -E '^    [A-Za-z][A-Za-z0-9-]*\.ts' | awk '{print $1}' | sort -u)
SRC=$(find src/resolvers -maxdepth 1 -type f -name '*.ts' -exec basename {} \; | grep -v '\.test\.ts$' | sort -u)
diff <(printf '%s\n' "$DOC") <(printf '%s\n' "$SRC")

# data-schema.md 캐시 목록 vs src/cache/store.ts 의 상수
grep -nE "_(DIR|PATH)\s*=" src/cache/store.ts
# 모든 상수가 docs 에 등재됐는지 대조한다.

# PRD MVP 명령 vs 실제 CLI
grep -oE "^- \`dooray [a-z][a-z ]*\`" docs/prd.md | sort -u
node dist/index.js --help 2>/dev/null | grep -E "^  [a-z]+" | awk '{print "dooray "$1}' | sort -u

# ADR 본문 번호 vs INDEX 등재 번호
BODY=$(grep -hoE '^## ADR-[0-9]+' docs/adr/*-*.md | grep -oE 'ADR-[0-9]+' | sort -u)
INDEX=$(grep -oE '\[ADR-[0-9]+\]\([0-9]+-[a-z0-9-]+\.md\)' docs/adr/INDEX.md | grep -oE 'ADR-[0-9]+' | sort -u)
diff <(printf '%s\n' "$BODY") <(printf '%s\n' "$INDEX")

# INDEX 링크가 가리키는 파일이 실재하는지
grep -oE '\([0-9]+-[a-z0-9-]+\.md\)' docs/adr/INDEX.md | tr -d '()' | while read -r f; do
  test -f "docs/adr/$f" || echo "MISSING FILE: $f"
done
```

A축의 resolver 대조 명령은 `docs/code-architecture.md` 의 `resolvers/` 절만 검사한다.
`postRef.ts` 처럼 대문자가 들어간 파일은 걸리고, `services/` 절 이후 파일은 제외되어야 한다.

## B. 과대화

ADR 이 기능 명세서처럼 변했는지 본다.
줄 수는 후보를 좁히는 보조 신호로만 쓰고, 줄 수만으로 과대화를 판정하지 않는다.

아래 패턴이 ADR 본문에 있으면 과대화로 본다.

- 긴 코드 블록
- 파일 경로 3개 이상 나열
- 옵션, 인자, 동작을 줄 단위로 나열한 표
- "각 명령의 동작:" 식 명세
- 정규식이나 합성 동작 정의

코드 블록 10줄 이상이면 우선 확인한다.
이 임계값은 이 문서가 후보 검출 기준으로 소유한다.
단일 결정을 구분하는 데 필요한 최소한의 식별자는 허용한다.

## C. 의사결정 추론성

ADR 이 "왜" 를 담고 있는지, "결정 / 맥락 / 대안 기각" 구조가 있는지 본다.

```bash
for f in docs/adr/*-*.md; do
  grep -qE "이유|맥락|왜|근거" "$f" || echo "$f: 이유 누락"
  grep -qE "대안|기각|반려" "$f" || echo "$f: 대안 기각 누락 (선택)"
done
```

## D. 중복

같은 정의가 여러 docs 에 본문으로 반복되는지 본다.

- ADR 본문의 코드 블록과 `data-schema.md` 의 같은 인터페이스
- ADR 본문의 명령 예시와 `flow.md` 의 같은 예시
- `CLAUDE.md` 의 지침과 `code-architecture.md` 의 같은 서술

정의는 한 곳에 두고 다른 문서는 링크나 짧은 참조만 둔다.

## E. ADR 자명성

코드, 설정 파일, git log 로 같은 정보를 얻을 수 있으면 폐기 후보다.

- 라이브러리 단순 선택
- 폴더 구조 결정
- 단순 마이그레이션 기록
- 일반 프로그래밍 원칙
- 환경 설정

반대로 아래는 유지한다.

1. 라이브러리 고유 함정
2. 실험 결과
3. 대안 기각 근거
4. 정책과 규칙
5. 비용과 성능 trade-off 근거

## F. 문서 구조 무결성

문체가 아니라 문서가 실제로 열리고 구조가 깨지지 않는지 점검한다.
한국어 표현과 서식 취향은 `korean-check` 검사기에 맡긴다.

대상은 `docs/*.md`, `CLAUDE.md`, `README.md`, `skills/` 다.
완료된 plan 은 교정 대상이 아니라 제거 대상이므로 `tasks/` 는 검사하지 않는다.
제거 판정은 `harness-cleanup` 이 소유한다.

검출 대상은 아래와 같다.

- 깨진 로컬 링크
- 표의 열 수 불일치
- 닫히지 않은 코드 펜스
- 헤딩 레벨 건너뛰기
- ADR 본문과 `docs/adr/INDEX.md` 의 파일, 번호 불일치

`Edit`, `Write`, `MultiEdit` 가 Markdown 파일을 바꿀 때만 훅이 돈다.
Bash 로 만든 `.md` 는 훅을 거치지 않는다.
그래서 만든 방법과 무관하게 파일 경로로 검사기를 직접 실행한다.

```bash
~/.claude/skills/korean-check/scripts/check.sh <파일>
```

검사기가 잡지 못하는 항목만 수동으로 본다.

- 한 줄에 여러 문장을 과하게 이어 쓴 곳
- 한 단락에서 `=` 또는 `→` 를 반복해 관계를 압축한 곳
- 한 bullet 안에 여러 절을 쉼표로 이어 독자가 구조를 다시 나눠야 하는 곳

## 출력 형식

```text
판정: PASS | UPDATE_NEEDED | VIOLATION

[UPDATE_NEEDED 시] docs 갱신 필요 항목:
1. <파일:줄> — 한 줄 사유와 제안 수정

[VIOLATION 시] 코드 수정 필요 항목:
1. <파일:줄> — 위반 ADR·규약과 수정 방향

[PASS 시] 6축별 통과 요약 1줄씩
```

docs-check 호출 시에는 위 형식에 Critical, Warning, Safe 분류를 더한다.

## 자기 점검

- 검증 기준을 새로 만들지 않는다.
  `.claude/planning-overlay.md` 의 docs 영향 표를 기준으로 쓴다.
- 자기 면제 회신을 하지 않는다.
  검증을 생략할 수 있다고 판단하지 않는다.
- dooray-cli repo 만 검증한다.
- `README.md` 와 `skills/dooray-cli/` 는 사용자 가이드 갱신 phase 에서만 변경한다.
- 개인 식별 정보 노출은 즉시 `VIOLATION` 이다.
  `node scripts/check-pii.mjs` 를 실행해 판정한다.
