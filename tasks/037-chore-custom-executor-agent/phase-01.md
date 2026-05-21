# Phase 01 — _shared/code-review-pitfalls.md + common-pitfalls.md 신규 5 패턴 시드 보강

## 목적

PR #36~#74 (15개) 의 claude bot 리뷰 코멘트 분석에서 추출한 **재발 가능 신규 5 패턴**을 `_shared` docs 에 시드로 추가.
agent 신설 (phase-02) 전에 단일 소스를 먼저 보강 — 거울 구조 원칙 (planning SKILL "거울 구조 원칙" 섹션).

## 회피 대상 (사전 점검 1줄 인용)

- `code-review-pitfalls.md` 카테고리 추가 시 **증상 / Good / 검출 / Why / Self-check** 5항목 모두 작성 (기존 1-2, 2-1 패턴 답습)
- 1회성 사고는 추가 금지 — 본 시드 5건은 모두 **2건 이상 반복** 확인됨

## 변경 파일 (정확)

- `.claude/skills/_shared/code-review-pitfalls.md` — 신규 항목 4건 (1-3 / 4-1 / 카테고리 5 신설 with 5-1·5-2 / 카테고리 6 신설 with 6-1)
- `.claude/skills/_shared/common-pitfalls.md` — CLI7 (path-traversal) 재발 강조 1줄 추가

## 작업 항목

1. **`code-review-pitfalls.md` 카테고리 1 에 1-3 신설 — resolver-before-editor**
   - 증상: `resolveXInput` 검증을 body 수집·editor open 보다 뒤에 호출 — resolver 실패 시 사용자가 이미 에디터에 입력한 내용 유실
   - Good: `resolveWikiPageInput` / `resolvePostInput` 호출을 `readBodyInputOrNull` / `openInEditor` 보다 항상 먼저 실행. `delete.ts` / `edit.ts` 패턴이 reference
   - 검출: `grep -B 5 "openInEditor\|readBodyInputOrNull" src/commands/ | grep -B 5 -A 1 "resolve[A-Z][A-Za-z]*Input"` 에서 resolver 호출이 뒤에 있으면 의심
   - Why: PR #74 (plan036) 와 PR #64 (plan031) 2회 반복. add 명령군에서 특히 발생

2. **`code-review-pitfalls.md` 카테고리 4 의 예약 placeholder 해제 + 4-1 본문 작성 — interactive 경고 vs 실제 동작 mismatch**
   - 현재 상태: `# 4. CLI 도메인 규칙 회귀 (예약 — exitCode / stdout vs stderr / ky 강제)` placeholder. 헤더의 `(예약 — ...)` 부기는 제거하여 `# 4. CLI 도메인 규칙 회귀` 로 정리 + 4-1 본문 채움
   - 증상: interactive 분기에서 "옵션 X 는 무시됩니다" 경고 추가했으나 실제로 옵션 resolve 로직이 interactive 경로에도 적용 — 경고 텍스트와 코드 경로가 정반대
   - Good: 경고 텍스트 추가 시 해당 옵션의 resolve/merge 로직이 `nonInteractive` 조건 안에만 있는지 grep 으로 확인
   - 검출: `grep -B 3 -A 10 "무시됩니다\|ignored" src/commands/` 후 같은 옵션 grep 으로 nonInteractive 조건 외에서 사용되는지 확인
   - Why: PR #55 (plan028) 🔴 — cc/to 옵션 경고와 실제 동작 불일치

3. **`code-review-pitfalls.md` 카테고리 5 신설 (타입 안전성)** — 항목 2개
   - **5-1 Map.has → get()! non-null assertion**: `map.has(k) ? map.get(k)!.use() : map.set(k, init)` 패턴에서 `!` 제거. `let v = map.get(k); if (!v) { v = init; map.set(k, v); } v.use()` 로. 출처: PR #68 (plan033). 검출: `grep -nE "\.get\([^)]+\)!" src/`
   - **5-2 `as unknown as T` 이중 단언**: 두 타입의 구조적 관계를 `src/api/types.ts` 에 `extends` / 타입 별칭으로 명시. 이중 단언 등장 시 타입 설계 재검토 신호. 출처: PR #64 (plan031). 검출: `grep -nE "as unknown as " src/`

4. **`code-review-pitfalls.md` 카테고리 6 신설 (API/HTTP 패턴)** — 항목 1개
   - **6-1 redirect manual + status code 분기 누락**: `redirect: "manual"` + `throwHttpErrors: false` 패턴에서 `location` 헤더만 체크하지 말고 `if (response.status === 307)` 분기 명시. 200 OK 직접 응답 시 에러 경로 진입 회피. 출처: PR #72 (plan035) ADR-029 / ADR-015 연관. 검출: `grep -nE "redirect.*manual|throwHttpErrors.*false" src/api/client.ts` 후 그 위치에서 `status === 30` 분기 존재 확인

5. **`common-pitfalls.md` CLI7 path-traversal 재발 강조 1줄 추가**
   - 기존 CLI7 본문 끝에 1줄 추가: `**재발 빈도 높음**: PR #40 (🔴) → PR #72 (🔴) 두 PR 에서 동일 버그가 반복됨. download 명령 신설 시 \`basename(decodeURIComponent(fileName))\` grep 강제.`
   - 본문은 그대로 유지 — 빈도 표시만 보강

## 작업 외 금지

- 기존 항목 본문 (1-1, 1-2, 2-1, 2-2, 2-3) 수정 금지
- 카테고리 3 (매직 넘버), 카테고리 4 (CLI 도메인 규칙 — 4-1 추가 외) 본문 수정 금지
- agent 파일 신설 / build-with-teams skill 수정 (phase-02 / phase-03 의 일)

## 성공 기준

```bash
# 1. 새 항목 5개 모두 추가 확인
grep -c "## 1-3\|## 4-1\|## 5-1\|## 5-2\|## 6-1" .claude/skills/_shared/code-review-pitfalls.md
# 기대: 5

# 2. 카테고리 5/6 헤더 신설 확인 + 카테고리 4 placeholder 해제 확인
grep -cE "^# 5\. 타입 안전성|^# 6\. API/HTTP" .claude/skills/_shared/code-review-pitfalls.md
# 기대: 2
grep -c "^# 4\. CLI 도메인 규칙 회귀 (예약" .claude/skills/_shared/code-review-pitfalls.md
# 기대: 0 (예약 부기 제거됨)
grep -c "^# 4\. CLI 도메인 규칙 회귀$" .claude/skills/_shared/code-review-pitfalls.md
# 기대: 1 (헤더는 유지)

# 3. common-pitfalls.md CLI7 재발 강조
grep -c "재발 빈도 높음.*PR #40.*PR #72" .claude/skills/_shared/common-pitfalls.md
# 기대: 1

# 4. 각 신규 항목이 5항목 (증상/Good/검출/Why/Self-check) 모두 포함하는지
for h in "1-3" "4-1" "5-1" "5-2" "6-1"; do
  echo "--- $h ---"
  awk "/## $h/,/^## [0-9]/" .claude/skills/_shared/code-review-pitfalls.md | grep -cE "증상|Good|검출|Why|Self-check"
done
# 각 5 (또는 그 이상)

# 5. markdown 가독성 — 한 bullet 다중 속성 압축 없는지
grep -nE "^\s*-\s+.*\. .*\." .claude/skills/_shared/code-review-pitfalls.md | head -5
# 1줄에 2 문장 압축 있으면 sub-bullet 분리

# 6. PII gate
grep -rnE "tc-ocr|nhnent|@(nhn|nhnent)\.com" .claude/skills/_shared/code-review-pitfalls.md .claude/skills/_shared/common-pitfalls.md
# 기대: 0건
```

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
git add .claude/skills/_shared/code-review-pitfalls.md .claude/skills/_shared/common-pitfalls.md
git commit -m "$(cat <<'EOF'
docs(skill): accumulate 5 new review pitfalls from PR #36-#74 analysis (task 037 phase 1/3)

- code-review-pitfalls.md: 1-3 (resolver-before-editor, PR #74/#64),
  4-1 (interactive 경고 mismatch, PR #55), 5-1/5-2 (Map.get()! / as unknown as T 이중 단언, PR #68/#64),
  6-1 (redirect manual + status 분기, PR #72)
- 카테고리 5 (타입 안전성) + 6 (API/HTTP 패턴) 신설
- common-pitfalls.md CLI7: PR #40 → PR #72 재발 빈도 강조 1줄
EOF
)"
```
