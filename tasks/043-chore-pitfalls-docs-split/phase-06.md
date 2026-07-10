# Phase 06 — 참조 갱신 + 옛 파일 삭제 + 최종 검증

## 컨텍스트

패턴 파일 이전(phase 2~5)이 끝났으니 참조 5곳을 `docs/pitfalls/` 로 돌리고,
옛 monolithic 2파일을 삭제한다. 삭제는 **참조 갱신 완료 후**에만.

## 참조 갱신 대상 (5파일)

1. `.claude/agents/dooray-cli-executor.md`
2. `.claude/skills/planning/SKILL.md`
3. `.claude/skills/build-with-teams/SKILL.md`
4. `.claude/skills/review-fix/SKILL.md`
5. `docs/adr.md`

### 갱신 규칙

- **경로 참조**: `.claude/skills/_shared/common-pitfalls.md` / `code-review-pitfalls.md` →
  `docs/pitfalls/INDEX.md` (일반) 또는 해당 카테고리 디렉터리(`docs/pitfalls/plan/` 등).
- **상대 링크**: `.claude/skills/*/SKILL.md` 안의 `../_shared/common-pitfalls.md` →
  `../../../docs/pitfalls/INDEX.md` (planning/build-with-teams/review-fix 는 모두 `.claude/skills/<name>/` 깊이라 `../../../docs/...`).
- **번호 참조**(`common-pitfalls 1-16`, `CLI23`): 번호는 이제 각 파일 frontmatter `source` 에 있으므로
  "docs/pitfalls/INDEX.md 참조" + 사람이 읽을 패턴 이름을 남긴다 (예: `CLI23` → "code-review/ 의 partial-failure 패턴").
- **review-fix 6.5단계 누적 절차 재작성** (의미 변경 — 중요):
  "`_shared/common-pitfalls.md` 의 `### dooray-cli` 섹션에 CLI# 추가" →
  "`docs/pitfalls/code-review/<slug>.md` **새 패턴 파일 생성** (phase-01 형식) + INDEX 라우터 표 반영".
- **build-with-teams 회고 누적 절차**도 동일하게 "해당 카테고리 디렉터리에 새 파일 추가" 로.

## 작업 항목 (5개 이하)

1. 5개 참조 파일을 위 규칙대로 갱신 (경로·상대링크·번호참조·누적 절차 재작성).
2. 옛 파일 삭제: `git rm .claude/skills/_shared/common-pitfalls.md .claude/skills/_shared/code-review-pitfalls.md`.
3. 잔존 참조 grep 0건 확인 (아래 검증).
4. 전체 완결성 검증 (파일 수 총합) 통과.
5. `index.json` phase 6 completed + status "completed" 로 갱신.

## 검증

```bash
# 1) 옛 파일 잔존 참조 0건 (전 repo)
grep -rn "common-pitfalls\|code-review-pitfalls" .claude/ docs/ CLAUDE.md README.md skills/ 2>/dev/null
# → 0건이어야 함 (남으면 갱신 누락)

# 2) 옛 파일 삭제 확인
ls .claude/skills/_shared/common-pitfalls.md .claude/skills/_shared/code-review-pitfalls.md 2>&1
# → 둘 다 No such file

# 3) 전체 패턴 파일 수 (plan 17 + team 11 + code-review 38 = 66, INDEX 별도)
echo "plan=$(ls docs/pitfalls/plan/*.md|wc -l) team=$(ls docs/pitfalls/team/*.md|wc -l) cr=$(ls docs/pitfalls/code-review/*.md|wc -l)"
# 기대: plan=17 team=11 cr=38

# 4) 모든 패턴 파일에 frontmatter id 존재
for f in docs/pitfalls/*/*.md; do head -1 "$f" | grep -q "^---$" || echo "frontmatter 누락: $f"; done
```

- 빌드·테스트 무관(코드 변경 없음) — docs 전용.
- 갱신한 SKILL/agent 파일 가독성 자체 점검 (CLAUDE.md 6패턴).
