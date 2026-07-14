# Phase 04 — README + SKILL.md 사용자 가이드 갱신 + 최종 검증 + completed 마킹

**Model**: sonnet
**Status**: pending

---

## 목표

`wiki tree` 명령을 사용자 facing 문서(README, 공개 SKILL)에 반영하고, 전체 산출물을 최종 검증한 뒤 task 를 완료 처리한다.

**범위 외**:
- planning 결정 docs(`docs/adr/`·`CLAUDE.md`·`docs/flow.md`·`prd.md`·`code-architecture.md`)는 이미 task 생성 전 커밋됨 — 손대지 않는다.
- Issue #102(SKILL 위키 페이지 삭제 서술·링크 형식 수정)는 별개 이슈 — 이 task 범위 아님. 여기서는 `wiki tree` 항목만 추가한다.

---

## 작업 항목 (3)

### 1. `README.md` — 위키 섹션에 `wiki tree` 추가

380행 `dooray wiki pages <project>` 다음 줄에 추가 (README 위키 섹션은 ```bash 펜스 유지):

```
dooray wiki tree <project>                    # 페이지 계층 트리 (root 부터 재귀)
dooray wiki tree <project> --depth 2          # 손자까지만
```

### 2. `skills/dooray-cli/SKILL.md` — 의도 → 커맨드 매핑 + 자동화 시나리오

- 84행 `| 위키 페이지 목록 | dooray wiki pages <project> |` 다음 행에 추가:
  ```
  | 위키 페이지 트리 | `dooray wiki tree <project>` (계층 트리, `--depth N` 상한, `--json` 은 flat) |
  ```
- 228행 부근 자동화 시나리오(`# 1. 위키 페이지 목록`) 근처에, 트리로 계층을 훑는 예를 한 개 추가(자동화 관점 — `--json` flat 파싱이 `wiki pages` 와 동일함을 언급). 기존 시나리오 흐름을 해치지 않는 선에서 간결히.

**내부 참조 금지**: README·SKILL 에 `ADR-NNN`·`Issue #NN`·`task NN` 을 넣지 않는다 (외부 facing 문서).

### 3. `index.json` — task 완료 마킹

- `status` 를 `"completed"` 로.
- 모든 phase 의 `status` 를 `"completed"` 로.
- `current_phase` 를 `4` 로, `updated_at` 갱신.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `README.md` | 수정 — 위키 섹션에 `wiki tree` 2줄 |
| `skills/dooray-cli/SKILL.md` | 수정 — 매핑 표 1행 + 자동화 시나리오 1개 |
| `tasks/048-feat-wiki-tree/index.json` | 수정 — completed 마킹 |

## 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 내부 참조 0건 (외부 facing 문서)
grep -rnE "ADR-[0-9]+|Issue #[0-9]+|task [0-9]+" README.md skills/dooray-cli/SKILL.md 2>/dev/null
# 0건

# 개인/사내 식별자 0건
grep -rnE "tc-ocr|nhnent|nhn-comico|@(nhn|nhnent)\.com" README.md skills/ 2>/dev/null
grep -rnE "[0-9]{15,}" README.md skills/ 2>/dev/null | grep -vE "1234567890123456789|9876543210987654321|2939987647631384419|<postId>|<pageId>"
# 각각 0건

# wiki tree 반영 확인
grep -n "wiki tree" README.md skills/dooray-cli/SKILL.md
# README + SKILL 양쪽에 등장

# 최종 통합 검증
pnpm tsc --noEmit && pnpm test && pnpm run build
# 전부 통과

# 스모크 (실제 위키 프로젝트 코드로 교체해 1회 실행 — 트리 렌더 육안 아님, 종료코드 0 확인)
node dist/index.js wiki tree --help
echo "exit=$?"
```

## 의도 메모 (왜)

- 사용자 facing 문서에서 내부 추적 번호(ADR/Issue/task)를 빼는 이유: 사용자가 README/SKILL 을 그대로 LLM 에 붙여 실행하기도 해 내부 참조가 노이즈가 된다.
- Issue #102 를 이 task 에 합치지 않는 이유: 별개 관심사(기존 서술 오류 정정 + 링크 형식 추가)라 커밋·리뷰 단위를 분리하는 편이 낫다.
