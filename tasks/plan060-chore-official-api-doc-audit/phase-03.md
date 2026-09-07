# Phase 03. 공개 문서의 틀린 API 서술을 고치고 근거 우선순위를 명문화한다

**Execution profile**: standard

## 목표

`README.md` 와 `skills/` 의 틀린 API 서술을 고친다.
그리고 API 동작의 근거가 공식 문서라는 것을 `CLAUDE.md` 에 한 자리로 명문화한다.

**범위 외**: 내부 문서와 코드 주석은 phase 02 다. 새 기능을 만들지 않는다.

## 컨텍스트

**근거 문서**: `docs/adr/046-official-api-doc-precedence.md`.

`README.md` 와 `skills/dooray-cli/SKILL.md` 에는 내부 추적 번호를 넣지 않는다.
`ADR-NNN`, `Issue #NN`, `task NN` 이 모두 금지 대상이다.
`CLAUDE.md` 의 「공개 문서(README · 공개 SKILL)」 절이 이 규칙을 소유하고
`scripts/check-public-refs.sh` 가 검사한다. CI 도 같은 스크립트를 돌린다.

고칠 자리는 이렇다.

`skills/dooray-cli/references/wiki.md` 의 마지막 절이 「위키 페이지 이동은 불가능하다」다.
본문은 이렇게 적혀 있다.

```
`parentPageId` 를 바꾸는 이동은 API 로 할 수 없다. 수정 요청이 `parentPageId` 를 무시하고 전용 endpoint 도 없다.
사용자가 이동을 요청하면 웹 UI 를 안내한다.
```

두 문장 중 앞부분은 맞고 뒷부분은 틀렸다.
수정 요청이 `parentPageId` 를 무시하는 것은 사실이지만 전용 endpoint 는 있다.
`POST /wiki/v1/wikis/{wiki-id}/pages/{page-id}/move` 가 공식 API 문서에 있다.

`CLAUDE.md` 의 「API 스펙 확인 절차」는 신규 endpoint 를 쓸 때 공식 문서를 확인하라고 정하고 있다.
그 규칙이 이미 있었는데도 틀린 서술이 쌓였다. 규칙이 신규 사용 시점만 덮고,
이미 저장소에 적힌 서술을 사실로 받아들이는 경로를 덮지 않았기 때문이다.

## 의도 메모

- 「이동은 불가능하다」를 「CLI 에 이동 명령이 아직 없다」로 바꾼다.
  API 가 불가능한 것과 CLI 가 아직 안 만든 것은 다르다.
  전자로 적으면 사용자가 API 를 직접 찔러 볼 이유가 없다고 오해한다. Issue #148 이 그 상황이었다.
- 공개 문서에 ADR 번호를 달지 않는다. 왜 그런지는 `docs/adr/` 이 소유하고,
  공개 문서는 지금 무엇이 되고 무엇이 안 되는지만 적는다.
- `CLAUDE.md` 에 근거 우선순위를 적을 때 ADR 본문을 옮겨 적지 않는다.
  옮기면 갈라진다. 한 문장과 링크로 둔다.

## 작업 항목

### 1. `skills/dooray-cli/references/wiki.md` 의 이동 관련 절을 고친다

절 제목을 `위키 페이지 이동은 CLI 에 아직 없다` 로 바꾼다.

담을 내용은 이렇다.

- 페이지 수정 요청은 `parentPageId` 를 무시한다. 그 필드를 보내도 부모가 바뀌지 않는다.
- 이동 전용 endpoint 는 공식 API 에 있다. CLI 가 아직 그것을 감싸지 않았다.
- 지금 이동이 필요하면 웹 UI 를 쓴다.
- 지우고 다시 만드는 방법을 쓰지 않는다. 첨부와 인라인 이미지와 댓글과 페이지 ID 가 사라진다.

endpoint 경로를 본문에 적는다. 사용자가 직접 부를 수도 있고,
CLI 에 없다는 것과 API 에 없다는 것을 구별해 주는 정보이기 때문이다.

### 2. `README.md` 와 `skills/dooray-cli/SKILL.md` 의 API 서술을 훑는다

```bash
# cwd: <repo root>
grep -rn "불가능\|지원하지 않\|할 수 없\|없습니다\|없다" README.md skills/ | grep -iE "api|endpoint|이동|move" | head -20
```

찾은 자리마다 공식 문서로 확인한다. 저장소 문서를 근거로 삼지 않는다.
공식 문서 주소는 `CLAUDE.md` 의 「API 스펙 확인 절차」가 소유하고,
`~/.claude/scripts/browser-driver` 로 열어야 본문이 읽힌다.

고친 자리와 확인만 하고 그대로 둔 자리를 각각 보고에 적는다.
찾은 것이 없으면 없다고 적는다.

### 3. `CLAUDE.md` 의 「API 스펙 확인 절차」에 근거 우선순위를 더한다

절 끝에 두 문장을 더한다.

- 저장소의 ADR 과 `CLAUDE.md` 와 스킬 문서와 코드 주석에 적힌 API 서술은
  근거가 아니라 그때의 확인 결과다.
- 그 서술과 공식 문서가 어긋나면 공식 문서를 따르고 저장소 서술을 고친다.

그리고 `docs/adr/046-official-api-doc-precedence.md` 를 가리키는 링크를 한 줄 둔다.
그 ADR 의 본문을 옮겨 적지 않는다.

구현된 endpoint 와 공식 목록을 대조하는 명령도 한 줄 적는다.

```bash
# cwd: <repo root>
pnpm api:inventory
```

### 4. 공개 문서 검사를 이 phase 의 테스트로 돌린다

이 phase 는 코드를 바꾸지 않으므로 검사가 완료 판정이다.

```bash
# cwd: <repo root>
bash scripts/check-public-refs.sh
bash scripts/check-pii.sh
bash ~/.claude/scripts/korean-style-check.sh README.md CLAUDE.md skills/dooray-cli/SKILL.md skills/dooray-cli/references/wiki.md
python3 ~/.claude/scripts/check-readability.py README.md CLAUDE.md skills/dooray-cli/SKILL.md skills/dooray-cli/references/wiki.md
```

넷 다 종료 코드 0 이어야 한다.
`check-readability.py` 는 손대지 않은 줄의 기존 엠대시 위반으로 1 이 나올 수 있다.
그 경우 이 phase 가 추가한 줄에 위반이 없는지 아래로 확인하고 넘어간다.

```bash
# cwd: <repo root>
git diff --unified=0 -- README.md CLAUDE.md skills/ | grep '^+' | grep -v '^+++' | grep -c '—'   # = 0
```

목록 항목에서 이름과 설명을 가르는 엠대시는 규칙이 허용하지만, 이 phase 는 그것도 쓰지 않는다.

## 검증

```bash
# cwd: <repo root>
bash scripts/check-public-refs.sh
bash scripts/check-pii.sh
pnpm test
```

정정이 들어갔는지 확인한다.

```bash
# cwd: <repo root>
grep -c "이동은 불가능하다" skills/dooray-cli/references/wiki.md      # = 0
grep -c "pages/{page-id}/move" skills/dooray-cli/references/wiki.md   # >= 1
grep -c "046-official-api-doc-precedence" CLAUDE.md                   # = 1
grep -c "api:inventory" CLAUDE.md                                     # = 1
```

넷 다 기대값이 맞아야 한다.

공개 문서에 내부 참조가 남지 않았는지 직접 본다.

```bash
# cwd: <repo root>
grep -cE "ADR-[0-9]{3}|Issue #[0-9]+|task [0-9]+" README.md skills/dooray-cli/SKILL.md skills/dooray-cli/references/wiki.md
```

세 파일 모두 0 이어야 한다. `CLAUDE.md` 는 내부 문서라 대상이 아니다.

## plan 완료 마킹

이 plan 의 마지막 phase 다. 위 검증을 모두 통과시킨 뒤 `index.json` 을 고치고,
**이 phase 의 단일 commit 에 그 변경을 함께 넣는다.** 별도 commit 이나 amend 로 미루지 않는다.

```bash
# cwd: <repo root>
PLAN=tasks/plan060-chore-official-api-doc-audit
sed -i '' 's/"status": "pending"/"status": "completed"/g' $PLAN/index.json
sed -i '' 's/"current_phase": 1/"current_phase": 3/' $PLAN/index.json
grep -c '"status": "completed"' $PLAN/index.json     # = 4 (최상위 1 + phase 3)
grep -c '"current_phase": 3' $PLAN/index.json        # = 1
```

두 기대값이 맞아야 한다. `phases` 배열 항목에 `status` 키가 없으면 먼저 각 항목에 넣는다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `skills/dooray-cli/references/wiki.md` | 수정 |
| `README.md` | 수정 |
| `skills/dooray-cli/SKILL.md` | 수정 |
| `CLAUDE.md` | 수정 |
| `tasks/plan060-chore-official-api-doc-audit/index.json` | 수정 |
