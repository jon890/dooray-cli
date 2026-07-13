# Phase 03 — code-review/ (38) 가독성 재포맷 + 전체 최종 검증

## 컨텍스트

`docs/pitfalls/code-review/*.md` (38, 위반 최다 ~131 긴 줄) 에 가독성 6패턴 적용.
**규칙·불가침·무손실 체크는 phase-01.md 준수.** 순수 재포맷.

이 dir 은 grep/bash 코드블록이 많다 — **코드블록 불가침이 특히 중요**. 긴 줄 상당수가 코드블록 안(명령)이며 이는 손대지 않는다.

worktree·branch 동일.

## 작업 항목 (5개 이하)

1. `docs/pitfalls/code-review/*.md` (38) prose 본문에 6패턴 적용. 코드블록 안 긴 줄은 제외(불변).
2. 파일마다 단어 토큰 무손실 체크 통과 (38 전부).
3. phase 3 commit (`chore(pitfalls): readability reformat code-review/`).
4. **전체 최종 검증**(아래) 통과.
5. index.json phase 3 completed + status "completed".

## 검증 (code-review + 전체)

```bash
# 1) code-review 단어 무손실
for f in docs/pitfalls/code-review/*.md; do
  h=$(git -C "$WT" show "HEAD:$f" | grep -oE "[가-힣A-Za-z0-9]+" | wc -l | tr -d ' ')
  c=$(grep -oE "[가-힣A-Za-z0-9]+" "$WT/$f" | wc -l | tr -d ' ')
  [ "$h" = "$c" ] || echo "WORD MISMATCH $f: head=$h cur=$c"
done
# 0줄 = 통과

# 2) 전체 트리 파일 수 불변 (69 = 66 패턴 + 2 checklist + INDEX)
ls docs/pitfalls/*/*.md docs/pitfalls/INDEX.md | wc -l   # 기대 69

# 3) frontmatter 훼손 없음 — 모든 패턴 파일 첫 줄 ---
for f in docs/pitfalls/*/*.md; do head -1 "$f" | grep -q "^---$" || echo "frontmatter 깨짐: $f"; done
```

- 파일 추가/삭제 0 (재포맷만). 3개 phase 통틀어 신규/삭제 파일 없어야 함.
- 코드 변경 0 — docs 전용.
