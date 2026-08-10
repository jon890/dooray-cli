# Phase 02 — 댓글 첨부 두 출처 병합과 이름·크기 보강

**Execution profile**: standard

---

## 목표

`dooray post comment file list` 가 지금 댓글 단건 조회 응답의 `files` 만 읽는다.
그런데 첨부 경로가 둘로 갈린다.

- 웹 UI 로 첨부한 파일 → 댓글 응답의 `files` 에만 들어온다. 본문 참조는 없다.
- CLI `upload` 로 올린 파일 → 댓글 본문의 마크다운 참조로만 남는다. 댓글 `files` 에는 들어가지 않는다.

그래서 CLI 로 올린 파일이 `list` 에 보이지 않는다. 게다가 댓글 `files` 의 `name` 과 `size` 는 항상 `null` 이라
파일명 열이 비고 크기가 값 없음으로 표시된다 (GitHub Issue #118).

이 phase 는 두 출처를 합치고 이름·크기를 업무 단위 첨부 목록에서 채운다.
근거와 결정은 `docs/adr/024-comment-file-synthesis.md`, 흐름은 `docs/flow.md` "댓글 첨부파일 흐름" 에 이미 반영돼 있다.

**범위 외**:

- `upload` / `download` / `delete` 명령 동작 — 바꾸지 않는다
- `README.md`, `skills/dooray-cli/SKILL.md` — Phase 03
- 댓글에 첨부 카드를 만드는 시도 — 공개 API 로 불가능하다 (ADR-024 맥락)

---

## 작업 항목 (4)

### 1. `src/utils/attachment-check.ts` — 라벨까지 뽑는 함수 추가

현재 `extractAttachmentFileIds(body: string): Set<string>` 이 `/files/<id>` 참조에서 id 만 뽑는다.
같은 정규식으로 마크다운 라벨도 캡처하는 함수를 추가하고, 기존 함수는 새 함수를 쓰는 얇은 래퍼로 바꾼다.
정규식이 두 벌이 되면 한쪽만 고쳐지는 사고가 난다.

```ts
export interface AttachmentReference {
  id: string;
  label: string;   // 마크다운 대괄호 안 문자열. 빈 문자열일 수 있다
}

export function extractAttachmentReferences(body: string): AttachmentReference[]
export function extractAttachmentFileIds(body: string): Set<string>   // 기존 시그니처 유지
```

- 정규식은 기존 것을 라벨 캡처만 추가해 쓴다: `/!?\[([^\]]*)\]\(\/files\/([^\s)?#]+)/g`
  - id 종결자에서 `?` 와 `#` 를 제외하는 이유는 기존 주석에 남아 있다. 그 동작을 유지한다.
- 같은 id 가 본문에 여러 번 나오면 **첫 등장만** 남긴다. 라벨이 서로 다를 수 있으므로 첫 값을 쓴다.
- `extractAttachmentFileIds` 의 반환값과 호출부(`findDroppedAttachments`)는 그대로 동작해야 한다.

`src/utils/attachment-check.test.ts` 에 라벨 캡처, 이미지 표기(`![]()`)와 일반 링크(`[]()`) 양쪽, 중복 id, 라벨 없는 경우를 추가한다.

### 2. `src/utils/comment-file-merge.ts` — 신규 (순수 함수)

I/O 없이 입력만으로 결과를 만든다. 테스트가 API 호출 없이 돌아야 한다.

```ts
export type CommentFileSource = "attachment" | "body-link" | "both";

export interface MergedCommentFile {
  id: string;
  name: string | null;
  size: number | null;
  mimeType: string | null;
  source: CommentFileSource;
}

export function mergeCommentFiles(input: {
  commentFiles: ReadonlyArray<{ id: string; name: string | null; size: number | null }>;
  bodyRefs: ReadonlyArray<{ id: string; label: string }>;
  postFiles: ReadonlyArray<{ id: string; name: string; size: number; mimeType: string }>;
}): MergedCommentFile[];
```

동작:

- `id` 기준 합집합. 양쪽에 다 있으면 `source: "both"` 로 1건만 남긴다.
- 순서는 `commentFiles` 순 → 그다음 `bodyRefs` 순. 안정적인 출력이 있어야 테스트가 가능하다.
- 이름 우선순위: `postFiles` 의 `name` → `commentFiles` 의 `name` → `bodyRefs` 의 `label`.
  앞의 둘은 서버 값이고 라벨은 사용자가 쓴 문자열이라 신뢰도가 낮다.
  라벨이 빈 문자열이면 값이 없는 것으로 보고 `null` 로 둔다.
- `size` 와 `mimeType` 은 `postFiles` 에서만 온다. 없으면 `null`.
- `postFiles` 가 빈 배열이어도 정상 동작해야 한다 (보강 조회 실패 시 이 상태로 호출된다).

`src/utils/comment-file-merge.test.ts` 에 다음을 덮는다.

- 댓글 첨부만 있을 때 → `source: "attachment"`, 이름·크기가 `postFiles` 에서 채워짐
- 본문 참조만 있을 때 → `source: "body-link"`
- 같은 id 가 양쪽에 있을 때 → 1건, `source: "both"`
- `postFiles` 에 없는 id → `name`·`size`·`mimeType` 이 `null` (라벨이 있으면 이름은 라벨)
- `postFiles` 가 빈 배열
- 본문에 같은 id 가 두 번 등장 → 1건

### 3. `src/commands/post/comment/file/list.ts` — 조립

호출 순서를 지킨다. 입력 해석(`resolveCommentFileInput`)이 스피너보다 **먼저**다 —
커밋 `c1f36f6` 이 이 순서를 바로잡았고 `docs/pitfalls/code-review/spinner-before-validation.md` 가 같은 패턴을 다룬다.

1. `resolveCommentFileInput` 으로 `projectId`/`postId`/`commentId` 해석 (기존 코드 유지)
2. `startSpinner("댓글 첨부 파일 목록 조회 중...")`
3. `client.getPostComment(projectId, postId, commentId)` — `files` 와 `body.content` 를 함께 얻는다
4. `extractAttachmentReferences(res.result.body.content)` 로 본문 참조 추출
5. 댓글 `files` 와 본문 참조가 **모두 비어 있으면** 보강 조회를 하지 않고 빈 상태 출력으로 간다 (기존 동작 유지)
6. 하나라도 있으면 `client.getPostFiles(projectId, postId)` 를 `try`/`catch` 로 감싸 호출한다
   - 실패하면 `postFiles` 를 빈 배열로 두고 stderr 에 한 줄 경고를 쓴 뒤 계속 진행한다.
     경고 예: `⚠  첨부 메타데이터 조회 실패 — 파일명·크기를 표시하지 못합니다.`
   - 목록 자체는 보여줄 수 있으므로 여기서 명령을 실패시키지 않는다. 종료 코드는 0 이다.
   - API 호출을 `try` 로 감쌀 때 실패 경로에서 스피너가 도는 채로 남지 않게 한다
     (`docs/pitfalls/code-review/spinner-missing-try-catch.md`)
7. `mergeCommentFiles` 호출 후 `stopSpinner(true, `첨부 파일 ${merged.length}개`)`
8. 출력

출력 계약:

- 표 헤더: `["파일명", "크기", "출처", "ID"]`
- `출처` 표시값: `attachment` → `첨부`, `body-link` → `본문 링크`, `both` → `둘 다`
- 파일명은 `sanitizeFileName`(같은 `attachment-check.ts` 에 있다)을 거쳐 출력한다.
  서버가 준 문자열에 제어문자가 있으면 터미널이 변조된다
  (`docs/pitfalls/code-review/unsanitized-external-string-output.md`). 이름이 `null` 이면 `-`.
- 크기는 Phase 01 의 `formatSize` 를 쓴다. `null` 이면 `-`.
- `--json`: `output()` 의 `raw` 로 `MergedCommentFile[]` 을 그대로 넘긴다.
  즉 `{ id, name, size, mimeType, source }` 이고 값이 없으면 `null` 이다.
  `source` 는 기계 판독용이므로 한국어로 바꾸지 않는다.
  가공값을 `raw` 로 넘기는 것은 `src/commands/wiki/page-file/list.ts` 가 이미 쓰는 방식이다.
- `--quiet`: `ids` 로 `merged.map((f) => f.id)` — 기존과 같이 id 만 나온다
  (`docs/pitfalls/code-review/quiet-mode-missing-identifier.md`)
- 빈 상태: 기존 그대로. 표준 출력은 `첨부 없음`, `--json` 은 `[]`

### 4. 명령 설명 문구 보강

`src/commands/post/comment/file/list.ts` 의 `.description()` 을 갱신해 두 출처를 합쳐 보여준다는 점을 한 줄로 알린다.
`src/commands/post/comment/file/upload.ts` 의 `.description()` 에는 업로드 결과가 첨부 카드가 아니라 본문 링크로 표시된다는 점을 덧붙인다 (GitHub Issue #119).
도움말 문자열에 `ADR-NNN` 이나 `Issue #NN` 같은 내부 참조 번호를 넣지 않는다 — 커밋 `d0e1cbd` 가 이미 제거한 항목이다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/utils/attachment-check.ts` | 수정 |
| `src/utils/attachment-check.test.ts` | 수정 |
| `src/utils/comment-file-merge.ts` | 신규 |
| `src/utils/comment-file-merge.test.ts` | 신규 |
| `src/commands/post/comment/file/list.ts` | 수정 |
| `src/commands/post/comment/file/upload.ts` | 수정 (설명 문구만) |

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit && pnpm run build && pnpm test
```

```bash
# cwd: <repo root>
# 정규식이 한 벌인지 — attachment-check.ts 한 곳에서만 나와야 한다
grep -rn "files/" src/utils/*.ts | grep -c "\["
```

```bash
# cwd: <repo root>
# 도움말에 내부 참조 번호가 없는지 — 0 건이어야 한다
grep -rnE "ADR-[0-9]+|Issue #[0-9]+" src/commands/post/comment/file/
```

```bash
# cwd: <repo root>
# 입력 해석이 스피너보다 먼저인지 육안이 아니라 순서로 확인한다.
# resolveCommentFileInput 의 줄 번호가 startSpinner 보다 작아야 한다
grep -n "resolveCommentFileInput\|startSpinner" src/commands/post/comment/file/list.ts
```

## 의도 메모 (왜)

- 병합 로직을 순수 함수로 뺀 것은 API 호출 없이 경계 조건을 테스트하기 위해서다.
  명령 파일 안에 두면 보강 실패·중복 id 같은 경우를 검증하려고 클라이언트를 흉내 내야 한다.
- 보강 조회 실패에 명령을 실패시키지 않는 이유는 보강이 부가 정보이기 때문이다.
  실패로 처리하면 지금(목록은 나오되 이름이 빈 상태)보다 나빠진다.
- `출처` 열을 만든 것은 사용자가 웹 UI 첨부와 CLI 업로드를 구분해야 `delete` 결과를 예측할 수 있기 때문이다.
  `delete` 는 본문 참조를 지우는 동작이라 두 경우의 결과가 다르다.

## Blocked 조건

- `src/utils/format-size.ts` 가 없으면 Phase 01 이 끝나지 않은 것이다. `PHASE_BLOCKED: Phase 01 산출물 부재` 를 출력하고 종료한다.
