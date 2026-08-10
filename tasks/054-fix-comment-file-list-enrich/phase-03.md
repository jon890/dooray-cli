# Phase 03 — 공개 문서 갱신과 통합 검증

**Execution profile**: standard

---

## 목표

Phase 02 로 `post comment file list` 의 동작이 바뀌었다.
사용자 대상 문서 두 곳이 아직 옛 동작(웹 UI 첨부를 놓칠 수 있다)을 설명하고 있어 사실과 어긋난다.
이 phase 는 그 두 문서를 고치고 전체 검증을 돌린 뒤 task 를 완료로 표기한다.

**범위 외**:

- `docs/` 아래 문서 — planning 단계에서 이미 갱신했다. 다시 손대지 않는다
- 코드 동작 변경 — Phase 01·02 에서 끝났다. 이 phase 에서 동작을 바꾸지 않는다

---

## 작업 항목 (3)

### 1. `README.md` — "댓글에 파일 첨부" 절 갱신

113 번째 줄 부근의 아래 문장이 이제 사실과 다르다.

> `comment file list`는 웹 UI에서 직접 첨부한 파일을 놓칠 수 있으며, 이 경우 `post file list`로 확인한다.

다음 내용으로 바꾼다.

- `comment file list` 는 웹 UI 로 첨부한 파일과 CLI 로 올린 파일을 함께 보여주고 `출처` 열로 구분한다
- CLI 로 올린 파일은 댓글의 첨부 카드가 아니라 본문 링크로 표시된다 — 웹 UI 결과와 다르게 보이는 지점이다

`ADR-NNN`, `Issue #NN`, `task NN` 같은 내부 참조 번호를 넣지 않는다.

### 2. `skills/dooray-cli/SKILL.md` — 162 번째 줄 부근 갱신

> `comment file list`가 비어도 웹 UI 첨부가 없다고 단정하지 말고 `post file list`로 확인한다.

이 문장은 더 이상 필요 없다. 대신 에이전트가 알아야 할 것만 남긴다.

- `list` 결과의 `출처` 열이 무엇을 뜻하는지
- `--json` 항목 형식이 `{ id, name, size, mimeType, source }` 이고 `source` 는 `attachment` / `body-link` / `both` 라는 점
- 값을 채우지 못하면 `name`·`size`·`mimeType` 이 `null` 이라는 점

내부 참조 번호를 넣지 않는다.

### 3. task 완료 표기

`tasks/054-fix-comment-file-list-enrich/index.json` 을 갱신한다.

- 최상위 `status` 를 `completed`
- `current_phase` 를 `3`
- `updated_at` 을 갱신
- 세 phase 의 `status` 를 모두 `completed`

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `README.md` | 수정 |
| `skills/dooray-cli/SKILL.md` | 수정 |
| `tasks/054-fix-comment-file-list-enrich/index.json` | 수정 |

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit && pnpm run build && pnpm test
```

```bash
# cwd: <repo root>
# 공개 문서에 내부 참조 번호가 없는지 — 0 건이어야 한다
grep -rnE "ADR-[0-9]+|Issue #[0-9]+|task [0-9]+" README.md skills/ 2>/dev/null
```

```bash
# cwd: <repo root>
# 옛 서술이 남아 있지 않은지 — 0 건이어야 한다
grep -rn "놓칠 수 있" README.md skills/
```

```bash
# cwd: <repo root>
# 개인 식별 정보 검증 — CLAUDE.md "개인 식별 정보 / 사내 식별자 노출 금지" 의 grep 3 종을 그대로 실행해 0 건 확인
```

## 의도 메모 (왜)

- 공개 문서를 마지막 phase 로 미룬 것은 코드 산출물에 의존하기 때문이다.
  출력 열 이름이나 `--json` 필드가 구현 중 바뀌면 앞서 쓴 문서가 곧바로 틀린 문서가 된다.
- 옛 문장을 지우기만 하지 않고 대체 문장을 넣는 이유는, 웹 UI 와 다르게 보이는 지점이 사용자가 실제로 혼동한 부분이기 때문이다.
