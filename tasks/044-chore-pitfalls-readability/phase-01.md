# Phase 01 — plan/ (19) + INDEX.md 가독성 재포맷 (규칙 앵커)

## 컨텍스트

`docs/pitfalls/` 파일들이 원본 monolith 에서 계승한 가독성 위반을 정리한다.
**순수 재포맷** — 무엇을 말하는지(단어·의미)는 100% 보존, 어떻게 줄바꿈·나열하는지(형식)만 조정.

**작업 위치**: worktree `/Users/nhn/personal/dooray-cli/.claude/worktrees/pitfalls-readability`.
모든 경로 이 루트 기준. git 은 `git -C <worktree> ...`. branch `chore/pitfalls-readability`.

본 phase 가 **규칙 단일 소스**다. phase 2·3 이 그대로 따른다.

## 적용 대상 (CLAUDE.md "docs / ADR 작성 형식" 6패턴)

1. **semantic line break** — 한 단락의 여러 문장을 문장당 한 줄로 분리.
2. **enumerated inline 금지** — `A / B / C` (3개+), `①②③`, `1) 2) 3)` → markdown bullet list.
3. **괄호 중첩 2겹 금지** — `(... (...) ...)` → 단락/불릿 분리로 평탄화.
4. **`=` / `→` 동치·인과 압축은 한 문장 1회** — 여러 관계 압축 시 문장 분리.
5. **긴 문장 의미 단위 분할** — 약 80자 초과 + 백틱/괄호 다수면 의미 단위로.
6. **한 bullet 다중 속성 압축 금지** — 한 bullet 에 마침표·콤마·`+`·슬래시로 2개+ 독립 속성이 이어지면 sub-bullet 으로 분리.

## 불가침 (절대 건드리지 않음)

- **코드 블록**(``` … ```) 내부 — grep/bash/yaml 명령·예시. 한 글자도 변경 금지.
- **frontmatter**(`--- … ---`) — id/category/title/triggers/tool_catchable/source/related.
- 인라인 코드(`` `…` ``), URL, 숫자, 파일명, 식별자.
- **단어 자체** — 요약·재작성·동의어 교체·단어 추가/삭제 전부 금지. 오직 줄바꿈·bullet 구조만.

## 기계적 금지 (과잉 방지)

- 120자 넘는다고 **무조건** 쪼개지 않는다. 하나의 응집된 문장이면 그대로 둔다 (억지 분할이 오히려 나쁨).
- 원본에 이미 잘 읽히는 곳은 손대지 않는다 (외과적 — 실제 위반만).

## 작업 항목 (5개 이하)

1. `docs/pitfalls/plan/*.md` (19) 각 파일의 **prose 본문**에 6패턴 적용. 코드블록·frontmatter 불가침.
2. `docs/pitfalls/INDEX.md` 동일 적용.
3. 각 파일 편집 후 **단어 토큰 무손실 체크**(아래) 통과 — 실패 시 그 파일 되돌려 재작업.
4. `git -C <wt>` 로 phase 1 commit (`chore(pitfalls): readability reformat plan/ + INDEX`, 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`).
5. index.json phase 1 completed, current_phase 2.

## 검증 — 단어 토큰 무손실 (필수, 파일마다)

재포맷은 줄바꿈·bullet 마커(`-`)·콤마만 바뀌고 **단어 토큰 집합은 불변**이어야 한다.
편집 전 원본은 `git -C <wt> show HEAD:<path>` (이 phase 시작 시점 = 미편집).

```bash
# 단어 토큰 수: 한글/영문/숫자 시퀀스만 카운트 (마커·공백·구두점 무시)
words_head() { git -C "$WT" show "HEAD:$1" | grep -oE "[가-힣A-Za-z0-9]+" | wc -l | tr -d ' '; }
words_cur()  { grep -oE "[가-힣A-Za-z0-9]+" "$WT/$1" | wc -l | tr -d ' '; }
# 모든 편집 파일에 대해 두 값이 같아야 함
for f in docs/pitfalls/plan/*.md docs/pitfalls/INDEX.md; do
  h=$(words_head "$f"); c=$(words_cur "$f")
  [ "$h" = "$c" ] || echo "WORD MISMATCH $f: head=$h cur=$c"
done
# 출력 0줄이어야 통과. MISMATCH 면 그 파일 단어 누락/추가 → 재작업
```

추가 확인:
- 코드블록 불변: `git -C "$WT" diff -- docs/pitfalls/plan docs/pitfalls/INDEX.md` 에서 ``` 안 라인이 변경되지 않았는지 육안 확인.
- frontmatter 7키 그대로.
