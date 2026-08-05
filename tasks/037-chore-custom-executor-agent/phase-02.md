# Phase 02 — .claude/agents/dooray-cli-executor.md 신설

## 목적

dooray-cli 전용 custom executor 에이전트 신설. 기존 OMC `oh-my-claudecode:executor` 의 코드 변경·테스트 능력은 그대로 유지하되, **dooray-cli 도메인 self-check** 를 사전에 임베드해 code-reviewer FIX_NEEDED 사이클을 줄인다.
하이브리드 임베드 — 재발 빈도 2건 이상 TOP 패턴 (약 8~10건) 만 self-check 항목으로 임베드, 나머지는 `_shared/*.md` 경로 참조.

## 회피 대상 (사전 점검 1줄 인용)

- agent frontmatter `description` 작성 시 dooray-cli docs-verifier (기존 agent) 의 형식 답습 — `name` / `description` / `model` / `disallowedTools` 만 사용
- 임베드 항목은 **단일 소스 (`_shared/*.md`) 의 요약 + 경로 참조**. 본문 복사 금지 (거울 깨짐)
- 한국어 표현 정책 (CLAUDE.md) — "매트릭스 / 트리아지 / 베이스라인" 등 금지

## 변경 파일 (정확)

- `.claude/agents/dooray-cli-executor.md` — 신규 (단일 파일)

## 작업 항목

1. **frontmatter 작성**
   ```yaml
   ---
   name: dooray-cli-executor
   description: dooray-cli 도메인 전용 executor — phase 순차 코드 작성 + 사전 self-check (spinner 순서 / resolver 검증 / path-traversal / Map.get()! / 이중 단언 / interactive 경고 mismatch / redirect status 분기 등 TOP 패턴 임베드). code-review-pitfalls.md + common-pitfalls.md 단일 소스 참조. build-with-teams 의 executor spawn 대상.
   model: sonnet
   ---
   ```
   - `disallowedTools` 명시 안 함 — executor 는 풀 권한 (Write/Edit/Bash 포함)

2. **Role + 책임 / 비책임 섹션**
   - 책임: phase 파일 순차 실행 / 코드 작성·수정 / 빌드·테스트 검증 / phase 완료 SendMessage 보고
   - 비책임: commit (team-lead 가 수행) / docs 검증 (docs-verifier) / 계획 평가 (critic)
   - dooray-cli 전용 명시 — 다른 repo 호환 불요

3. **도메인 핵심 규칙 (CLAUDE.md 요약)**
   - 표 형식 — 코드 컨벤션 (ky / DoorayCliError / pnpm / stdout vs stderr / 캐시 디렉토리) + 빌드 명령 (`pnpm run build && pnpm test`)
   - 상황별 ADR 참조 표 인용 (CLAUDE.md 단일 소스) — 본문 복사 금지, 경로만 명시

4. **Self-check 항목 (TOP 패턴 임베드 — 재발 빈도 2건 이상)**
   - 카테고리: spinner 순서 (1-1·1-2·1-3) / 에러 처리 (2-1·2-2·2-3) / 타입 안전성 (5-1·5-2) / API/HTTP (6-1) / interactive mismatch (4-1) / path-traversal 재발 (common CLI7) / 인접 명령 일관성 (common CLI17) / exit code · stdout-stderr (common CLI1·CLI8·CLI10)
   - 각 항목: **회피 1줄 + 검출 명령 1줄** (전체 본문 복사 금지)
   - 끝에 "전체 목록: `.claude/skills/_shared/code-review-pitfalls.md` + `common-pitfalls.md` 의 dooray-cli 섹션. 새 카테고리 도입 시 두 파일 다시 read." 명시

5. **검증 + 보고 protocol**
   - phase 완료 직전 self-check 체크리스트 (위 4항 grep 명령 일괄 실행)
   - 통합 검증: `pnpm tsc --noEmit && pnpm run build && pnpm test`
   - SendMessage 보고 — 변경 파일 목록 + 통합 검증 결과 + self-check grep 결과 0건 확인
   - commit 절대 하지 않음 — team-lead 가 수행

## 작업 외 금지

- `.claude/skills/build-with-teams/SKILL.md` 수정 (phase-03 의 일)
- `_shared/*.md` 본문 복사 (단일 소스 원칙 위반)
- OMC `oh-my-claudecode:executor` 수정 (전역 OMC 영향)
- 다른 agent 파일 수정

## 성공 기준

```bash
# 1. 파일 신설 확인
test -f .claude/agents/dooray-cli-executor.md && echo OK

# 2. frontmatter 4 필드 (name/description/model + ---) 확인
head -10 .claude/agents/dooray-cli-executor.md | grep -cE "^name:|^description:|^model:|^---"
# 기대: 4 (--- 2개 + name + description + model)

# 3. self-check 항목 TOP 패턴 카테고리 8개 이상 포함
grep -cE "1-1|1-2|1-3|2-1|2-2|2-3|4-1|5-1|5-2|6-1|CLI1|CLI7|CLI8|CLI10|CLI17" .claude/agents/dooray-cli-executor.md
# 기대: 8 이상

# 4. _shared 참조 경로 명시
grep -cE "code-review-pitfalls\.md|common-pitfalls\.md" .claude/agents/dooray-cli-executor.md
# 기대: 2 이상

# 5. 본문 길이 200~400줄 사이 (너무 짧으면 정보 부족, 너무 길면 본문 복사 의심)
wc -l .claude/agents/dooray-cli-executor.md
# 기대: 200 <= L <= 400

# 6. 빌드 / 테스트 (코드 변경 없음 — 회귀 없음 재확인)
pnpm tsc --noEmit 2>&1 | grep -c "^src/"
# 기대: 0
pnpm test 2>&1 | tail -3
# 기대: PASS

# 7. 개인 식별 정보 사전 점검
grep -rnE "<사내 식별자 패턴 — CLAUDE.md 참조>" .claude/agents/dooray-cli-executor.md
# 기대: 0건

# 8. 한국어 표현 정책 위반 grep
grep -nE "매트릭스|트리아지|베이스라인|스파이크" .claude/agents/dooray-cli-executor.md
# 기대: 0건
```

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
git add .claude/agents/dooray-cli-executor.md
git commit -m "$(cat <<'EOF'
feat(agent): add dooray-cli-executor custom agent (task 037 phase 2/3)

- .claude/agents/dooray-cli-executor.md 신설 — dooray-cli 도메인 전용 executor
- 하이브리드 임베드: TOP self-check (재발 2건 이상 패턴 ~10건) + _shared/*.md 참조
- frontmatter: model sonnet, executor 풀 권한 (disallowedTools 미명시)
- docs-verifier (기존 agent) 와 동일 형식 답습
EOF
)"
```
