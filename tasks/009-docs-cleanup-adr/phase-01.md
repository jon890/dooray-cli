# Phase 1: ADR-016 압축 + ADR-001 형식 통일

## 컨텍스트

`/docs-check` 결과 (커밋 `1949836` 직후 시점) 발견된 잔여 docs 정리 항목 2건을 처리. 이 plan은 **docs만 수정**, 코드 변경 없음.

### 발견 배경

- **ADR-016 setup 마법사**의 7단계 플로우(L222-229)가 `flow.md` L30-38과 중복 — 한쪽만 수정될 때 불일치 위험. ADR은 "왜 이 결정인가"에만 집중하고 단계 서술은 flow.md에 위임.
- **ADR-001 TypeScript 선택**의 마지막 줄이 `**트레이드오프**:` 형식 — 다른 모든 ADR은 `**대안 기각**:` 또는 명시적 "대안 X는 Y 이유로 기각" 패턴 사용. 형식 일관성 미세 issue.

### 먼저 읽을 파일

- `docs/adr.md` ADR-001 (L3-15) — 형식 통일 대상
- `docs/adr.md` ADR-016 (L212-237) — 압축 대상
- `docs/flow.md` (L1-46) — setup 플로우 7단계 위치
- `CLAUDE.md` (L57-61) — `--title`/`--subject` 정책 등 후속 plan(007/008) 결과 반영 확인용

### 이전 커밋 상호작용

```bash
git log --oneline -5
```

최근 main 예상:
```
1949836 docs: resolve ADR placeholders in CLAUDE.md + slim ADR-010
2ed06be chore: bump version to v0.5.2
1883dea Merge pull request #15 from jon890/feat/008-refactor-post-body-input
```

`1949836`에서 ADR placeholder 해소 + ADR-010 압축 완료. 이 plan은 그 후속.

### 설계 결정 (사용자 합의)

1. **ADR-016**: "플로우" 6단계 블록을 한 줄로 압축 — *"세부 플로우는 `docs/flow.md` setup 섹션 참조"*. 결정/이유/라이브러리/안전성/config 안내 절은 그대로 유지 (모두 ADR 가치 있음).
2. **ADR-001**: `**트레이드오프**:` → `**대안 기각**:` 형식으로 변경. 내용은 그대로 (Kotlin 재사용 포기 + types.ts 포팅 1일 상쇄).
3. **신규 ADR 신설은 이 plan에서 제외** — exitCode 정책 등 "ADR 가치 있음" 후보는 별도 의사결정 필요. CLAUDE.md 표의 "(ADR 없음 — 코드 위치)" 행은 그대로 둠.

## 작업 목록 (3개)

### 1) ADR-001 형식 통일

`docs/adr.md` L13의 단일 줄 교체.

**Before**:
```
**트레이드오프**: Kotlin API 클라이언트 재사용 포기 → types.ts로 포팅 필요 (1일 내 완료 가능)
```

**After**:
```
**대안 기각**: Kotlin MCP 서버 코드 재사용 포기 → 다른 ADR과 형식 일관성 확보. types.ts 포팅 비용은 1일 내라 상쇄 가능.
```

다른 줄 변경 없음.

### 2) ADR-016 플로우 6단계 압축

`docs/adr.md` L222-229의 "**플로우**:" 블록을 한 줄로 교체.

**Before** (L222-229, 9줄):
```
**플로우**:

1. 테넌트명 입력 (기본값: `<tenant>`) — API Key 발급 링크·메일 설정 링크 생성에 사용
2. API Endpoint 선택 (4개 환경: 민간·공공·공공업무망·금융, 기본: 민간)
3. API Key 입력 (마스킹, 발급 링크 안내)
4. API 연결 테스트 → 실패 시 재입력 유도
5. 메일 사용 여부 → Y: IMAP 계정·비밀번호 입력 / n: 건너뛰기
6. 전체 입력 완료 후 config.json에 한 번에 저장 (all-or-nothing)
```

**After** (1줄):
```
**플로우**: 세부 단계는 `docs/flow.md` "최초 설정 — `dooray setup`" 섹션 참조.
```

### 3) 정합성 grep

```bash
# cwd: /Users/nhn/personal/dooray-cli

# ADR-001에서 "트레이드오프" 제거 확인 (다른 ADR엔 남아있을 수 있어 ADR-001 범위만 grep)
sed -n '/^## ADR-001:/,/^## ADR-002:/p' docs/adr.md | grep -c "트레이드오프" || echo "OK_001_NO_TRADEOFF"

# ADR-001에 "대안 기각" 등장 확인
sed -n '/^## ADR-001:/,/^## ADR-002:/p' docs/adr.md | grep -c "대안 기각"

# ADR-016에서 6단계 번호 목록 제거 확인 (1. ~ 6. 패턴 부재)
sed -n '/^## ADR-016:/,/^## ADR-017:/p' docs/adr.md | grep -cE "^[1-6]\. " || echo "OK_016_NO_NUMBERED_LIST"

# ADR-016에 flow.md 참조 등장 확인
sed -n '/^## ADR-016:/,/^## ADR-017:/p' docs/adr.md | grep -c "flow.md"

# flow.md setup 섹션은 무변경 (L1~46 영역에 7단계 그대로)
grep -c "^[1-7]\. " docs/flow.md
```

## 성공 기준

- [ ] `sed -n '/^## ADR-001:/,/^## ADR-002:/p' docs/adr.md | grep -c "트레이드오프"` → `0` 또는 매치 없음
- [ ] `sed -n '/^## ADR-001:/,/^## ADR-002:/p' docs/adr.md | grep -c "대안 기각"` → `1` 이상
- [ ] `sed -n '/^## ADR-016:/,/^## ADR-017:/p' docs/adr.md | grep -cE "^[1-6]\. "` → `0` (번호 목록 제거됨)
- [ ] `sed -n '/^## ADR-016:/,/^## ADR-017:/p' docs/adr.md | grep -c "flow.md"` → `1` 이상
- [ ] `flow.md`는 무변경 (`git diff docs/flow.md` → 빈 출력)
- [ ] `git diff --stat` → 1 파일 수정 (`docs/adr.md`)
- [ ] ADR-016의 "결정/이유/라이브러리/안전성/config 미설정 시 안내" 절은 모두 보존

## 주의사항

- **ADR-016의 다른 절(결정/이유/라이브러리/안전성/config 안내)은 절대 건드리지 말 것** — "플로우" 절만 한 줄로 교체
- **ADR-001 본문(결정/이유)은 무변경** — L13 한 줄만 교체
- **flow.md 무변경** — 이 plan에서 flow.md를 건드릴 이유 없음
- **CLAUDE.md 무변경** — 표는 직전 plan(`1949836`)에서 정리 완료, 이번 plan 범위 외
- **`docs/data-schema.md` 무변경** — ADR-010 압축은 `1949836`에서 완료
- **신규 ADR 신설 금지** — exitCode 정책 등은 별도 plan에서 의사결정

## Blocked 조건

- `docs/adr.md` ADR-001 또는 ADR-016 헤딩이 사라지거나 구조가 크게 달라 위치 식별 실패 → `PHASE_BLOCKED: adr.md 구조 변경 감지`
- `docs/flow.md` 의 "최초 설정" 섹션이 사라짐 (참조 대상 부재) → `PHASE_BLOCKED: flow.md 참조 대상 부재`
