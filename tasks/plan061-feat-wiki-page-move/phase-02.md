# Phase 02. `wiki page move` 를 문서에 적는다

**Execution profile**: standard

## 목표

phase 01 이 만든 명령을 `README.md` 와 `skills/dooray-cli/` 와 `docs/` 에 적는다.

**범위 외**: 코드 변경은 phase 01 이 소유한다.
`skills/dooray-cli/references/wiki.md` 의 「위키 페이지 이동은 불가능하다」 절을 정정하는 것은 plan060 이 맡는다.
이 phase 는 그 절을 고치지 않고, plan060 이 이미 고쳤는지만 확인한다.

## 컨텍스트

**근거 문서**: `docs/adr/047-wiki-page-move.md`, `docs/flow.md` 의 「위키 흐름」 절.

`README.md` 와 `skills/dooray-cli/SKILL.md` 에는 내부 추적 번호를 넣지 않는다.
`ADR-NNN`, `Issue #NN`, `task NN` 이 모두 금지 대상이다.
`CLAUDE.md` 의 「공개 문서(README · 공개 SKILL)」 절이 이 규칙을 소유하고
`scripts/check-public-refs.sh` 가 검사한다. CI 도 같은 스크립트를 돌린다.

## 의도 메모

- `beforePageId` 의 `0` 이 맨 앞을 뜻한다는 것은 문서에 적지 않는다.
  `--first` 가 그것을 감싸므로 사용자가 알 필요가 없다. 근거는 ADR-047 이 담는다.
- 하위 페이지가 기본으로 함께 이동한다는 것은 적는다. 기본값이 참이라 모르고 쓰면 트리가 통째로 움직인다.
- 확인 절차가 없다는 것을 적는다. 다른 위키 명령과 다르므로 알려 두는 편이 낫다.

## 작업 항목

### 1. `docs/adr/INDEX.md` 에 ADR-047 을 등재한다

한 줄을 append 한다. 기존 줄을 고치지 않는다.
동시에 도는 다른 planning 과 같은 줄을 건드리지 않기 위해서다.

### 2. `docs/code-architecture.md` 의 트리에 새 파일을 더한다

`commands/wiki/` 아래에 `page-move.ts` 를 한 줄로 더한다.
설명은 부모 변경과 정렬 변경과 위키 간 이동을 공식 move endpoint 로 부른다는 뜻으로 적고 ADR-047 을 가리킨다.

### 3. `docs/prd.md` 의 MVP 범위에 한 줄을 더한다

`dooray wiki` 행에 이동이 포함됐다는 것을 덧붙인다. ADR-047 을 괄호로 가리킨다.
내부 문서이므로 ADR 번호를 써도 된다.

### 4. `docs/flow.md` 의 위키 흐름에 예시를 더한다

명령 예시 블록에 세 줄을 더한다.

```
dooray wiki page move <project> <page-id> --parent <parent-page-id>
dooray wiki page move --id <page-id> --parent <parent-page-id> --no-children
dooray wiki page move --id <page-id> --parent <parent-page-id> --first
```

블록 아래에 두 문장을 적는다.
하위 페이지가 기본으로 함께 이동한다는 것과, `--parent` 가 필수라는 것이다.

### 5. `skills/dooray-cli/SKILL.md` 의 위키 표에 행을 더한다

`페이지 이동` 행을 더한다. 커맨드는 `dooray wiki page move <project> <page-id> --parent <parent-page-id>` 로 한다.
설명에 네 가지를 담는다.
`--parent` 가 필수라는 것, 하위 페이지가 기본으로 함께 이동한다는 것,
`--no-children` 으로 페이지 하나만 옮긴다는 것, `--to-wiki` 로 다른 위키로 옮긴다는 것이다.

`--first` 와 `--before` 도 한 구로 덧붙인다.

삭제 명령의 확인 정책 표에는 넣지 않는다. 이동은 확인 절차가 없다.

### 6. `skills/dooray-cli/references/wiki.md` 에 이동 절을 넣는다

plan060 이 「위키 페이지 이동은 불가능하다」 절을 정정했는지 먼저 본다.

```bash
# cwd: <repo root>
grep -c "이동은 불가능하다" skills/dooray-cli/references/wiki.md
```

0 이면 plan060 이 정정한 것이다. 그 절에 이어 사용법을 적는다.
0 이 아니면 plan060 이 아직 머지되지 않은 것이다.
그 절의 본문을 고치지 말고 파일 끝에 새 절을 넣어 사용법만 적고, 그 사실을 보고에 남긴다.

새 절에 담을 것은 이렇다.

- 명령 형태와 `--parent` 필수.
- 하위 페이지가 기본으로 함께 이동하고 `--no-children` 으로 끌 수 있다는 것.
- `--first` 와 `--before` 로 형제 사이 정렬을 바꾼다는 것.
- `--to-wiki` 로 다른 위키로 옮긴다는 것. 대상 위키에 권한이 없으면 오류로 드러난다는 것.
- 페이지를 지우고 다시 만드는 방법을 쓰지 않는다는 것. 첨부와 인라인 이미지와 댓글과 페이지 ID 가 사라진다.
- `wiki page edit` 은 부모를 바꾸지 못한다는 것. 그 요청은 부모 필드를 무시한다.

### 7. `README.md` 에 사용 예를 더한다

위키를 다루는 예시가 있는 자리에 두 줄을 더한다.

```
dooray wiki page move --id <page-id> --parent <parent-page-id>
dooray wiki page move --id <page-id> --parent <parent-page-id> --no-children
```

### 8. 공개 문서 검사를 이 phase 의 테스트로 돌린다

이 phase 는 코드를 바꾸지 않으므로 검사가 완료 판정이다.

```bash
# cwd: <repo root>
bash scripts/check-public-refs.sh
bash scripts/check-pii.sh
bash ~/.claude/scripts/korean-style-check.sh README.md skills/dooray-cli/SKILL.md skills/dooray-cli/references/wiki.md docs/flow.md docs/prd.md docs/code-architecture.md docs/adr/INDEX.md
```

셋 다 종료 코드 0 이어야 한다.

## 검증

```bash
# cwd: <repo root>
bash scripts/check-public-refs.sh
bash scripts/check-pii.sh
pnpm test
```

문서에 적은 명령이 실제로 도는지 확인한다.

```bash
# cwd: <repo root>
node dist/index.js wiki page move --help | grep -c -- "--parent"   # >= 1
```

문서 갱신이 들어갔는지 확인한다.

```bash
# cwd: <repo root>
grep -c "ADR-047" docs/adr/INDEX.md                          # = 1
grep -c "page-move.ts" docs/code-architecture.md             # = 1
grep -c "wiki page move" docs/flow.md                        # >= 1
grep -c "wiki page move" skills/dooray-cli/SKILL.md          # >= 1
grep -c "wiki page move" README.md                           # >= 1
```

다섯 다 기대값이 맞아야 한다.

공개 문서에 내부 참조가 남지 않았는지 직접 본다.

```bash
# cwd: <repo root>
grep -cE "ADR-[0-9]{3}|Issue #[0-9]+|task [0-9]+" README.md skills/dooray-cli/SKILL.md skills/dooray-cli/references/wiki.md
```

세 파일 모두 0 이어야 한다.

## plan 완료 마킹

이 plan 의 마지막 phase 다. 위 검증을 모두 통과시킨 뒤 `index.json` 을 고치고,
**이 phase 의 단일 commit 에 그 변경을 함께 넣는다.** 별도 commit 이나 amend 로 미루지 않는다.

```bash
# cwd: <repo root>
PLAN=tasks/plan061-feat-wiki-page-move
sed -i '' 's/"status": "pending"/"status": "completed"/g' $PLAN/index.json
sed -i '' 's/"current_phase": 1/"current_phase": 2/' $PLAN/index.json
grep -c '"status": "completed"' $PLAN/index.json     # = 3 (최상위 1 + phase 2)
grep -c '"current_phase": 2' $PLAN/index.json        # = 1
```

두 기대값이 맞아야 한다. `phases` 배열 항목에 `status` 키가 없으면 먼저 각 항목에 넣는다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `docs/adr/INDEX.md` | 수정 |
| `docs/code-architecture.md` | 수정 |
| `docs/prd.md` | 수정 |
| `docs/flow.md` | 수정 |
| `skills/dooray-cli/SKILL.md` | 수정 |
| `skills/dooray-cli/references/wiki.md` | 수정 |
| `README.md` | 수정 |
| `tasks/plan061-feat-wiki-page-move/index.json` | 수정 |
