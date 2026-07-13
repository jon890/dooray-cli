# Phase 02 — team/ (11) 가독성 재포맷

## 컨텍스트

`docs/pitfalls/team/*.md` (10 패턴 + 00-checklist = 11) 에 가독성 6패턴 적용.
**규칙·불가침·무손실 체크는 phase-01.md 를 그대로 따른다** (단일 소스).

worktree·branch 동일. 순수 재포맷 — 단어·의미·코드블록·frontmatter 불변.

## 작업 항목 (5개 이하)

1. `docs/pitfalls/team/*.md` (11) prose 본문에 6패턴 적용. 실제 위반만(외과적), 억지 분할 금지.
2. 파일마다 단어 토큰 무손실 체크(phase-01 스크립트, 대상 경로만 `docs/pitfalls/team/*.md`) 통과.
3. 코드블록·frontmatter 불변 육안 확인.
4. phase 2 commit (`chore(pitfalls): readability reformat team/`).
5. index.json phase 2 completed, current_phase 3.

## 검증

```bash
for f in docs/pitfalls/team/*.md; do
  h=$(git -C "$WT" show "HEAD:$f" | grep -oE "[가-힣A-Za-z0-9]+" | wc -l | tr -d ' ')
  c=$(grep -oE "[가-힣A-Za-z0-9]+" "$WT/$f" | wc -l | tr -d ' ')
  [ "$h" = "$c" ] || echo "WORD MISMATCH $f: head=$h cur=$c"
done
# 0줄 = 통과
```
