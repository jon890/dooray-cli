# Phase 01 — 크기 표기 공용화와 nullable 타입 정정

**Execution profile**: standard

---

## 목표

파일 크기 표기 함수가 세 파일에 그대로 복사돼 있고, 그중 어느 것도 값이 없는 경우를 다루지 못한다.
Dooray 댓글 단건 조회 응답의 `files[].name` 과 `files[].size` 는 항상 `null` 로 오는데 타입은 non-null 로 선언돼 있어,
`post comment file list` 가 크기를 `nullB` 로 출력한다 (GitHub Issue #118).

이 phase 는 공용 함수를 만들고 타입을 실제 응답에 맞게 고친다. 출력 동작 변경은 Phase 02 가 담당한다.

**범위 외**:

- 댓글 본문 참조 병합, `출처` 열 추가, 보강 조회 — Phase 02
- `README.md`, `skills/dooray-cli/SKILL.md` 갱신 — Phase 03
- `post file list` 와 `wiki page file list` 의 출력 형식 변경 — 이 phase 는 함수 교체만 하고 출력 문자열은 동일하게 유지한다

---

## 작업 항목 (3)

### 1. `src/utils/format-size.ts` — 신규

```ts
export function formatSize(bytes: number | null | undefined): string
```

- `bytes` 가 `null` 또는 `undefined` 면 `"-"` 를 반환한다.
- 그 외에는 기존 세 복사본과 **완전히 같은 문자열**을 반환한다.
  - `bytes < 1024` → `` `${bytes}B` ``
  - `bytes < 1024 * 1024` → `` `${(bytes / 1024).toFixed(1)}KB` ``
  - 그 외 → `` `${(bytes / (1024 * 1024)).toFixed(1)}MB` ``
- `bytes === 0` 은 값이 있는 것이므로 `"0B"` 다. `-` 가 아니다.
  `??` 를 쓰고 `||` 를 쓰지 않는다. `||` 는 `0` 을 falsy 로 흘려 빈 파일을 값 없음으로 만든다.

### 2. `src/utils/format-size.test.ts` — 신규

vitest 로 다음을 덮는다.

- `0` → `"0B"`
- `1023` → `"1023B"`
- `1024` → `"1.0KB"`
- `1024 * 1024` → `"1.0MB"`
- `null` → `"-"`
- `undefined` → `"-"`

### 3. 복사본 3곳을 공용 함수로 교체

아래 세 파일에서 지역 `formatSize` 함수 정의를 지우고 `src/utils/format-size.js` 에서 import 한다.
(빌드가 CJS 단일 번들이지만 소스는 ESM 확장자 표기를 쓴다 — 같은 디렉터리의 다른 import 문을 그대로 따른다.)

- `src/commands/post/file/list.ts`
- `src/commands/wiki/page-file/list.ts`
- `src/commands/post/comment/file/list.ts`

호출부 인자와 열 구성은 바꾸지 않는다.

### 4. `src/api/types.ts` — `PostCommentFile` 정정

```ts
export interface PostCommentFile {
  id: string;
  name: string | null;
  size: number | null;
}
```

`PostFile` 과 `PostFileDetail` 은 업무 단위 응답 타입이고 실제로 값이 채워져 오므로 **바꾸지 않는다.**

이 변경으로 `src/commands/post/comment/file/list.ts` 의 `f.name` 이 `string | null` 이 되어 표 셀 타입과 어긋날 수 있다.
그 경우 이 phase 에서는 `f.name ?? "-"` 로 최소 대응만 한다. 제대로 된 이름 보강은 Phase 02 다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/utils/format-size.ts` | 신규 |
| `src/utils/format-size.test.ts` | 신규 |
| `src/api/types.ts` | 수정 (`PostCommentFile` 만) |
| `src/commands/post/file/list.ts` | 수정 |
| `src/commands/wiki/page-file/list.ts` | 수정 |
| `src/commands/post/comment/file/list.ts` | 수정 |

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit && pnpm run build && pnpm test
```

```bash
# cwd: <repo root>
# 지역 formatSize 정의가 남아 있지 않은지 — 출력은 src/utils/format-size.ts 한 줄뿐이어야 한다
grep -rn "function formatSize" src/
```

```bash
# cwd: <repo root>
# 0 을 falsy 로 흘리는 패턴이 없는지 — 0 건이어야 한다
grep -rn "size ||" src/
```

타입 변경 phase 이므로 `pnpm tsc --noEmit` 은 변경 전에도 한 번 실행해 기존 오류가 0 건임을 확인하고,
변경 후에도 0 건인지 같은 명령으로 비교한다.

## 의도 메모 (왜)

- 복사본 3개 중 하나만 고치면 같은 결함이 다른 두 곳에 남는다. 공용화가 이번 수정의 재발 방지책이다.
- 값 없음을 `"-"` 로 정한 것은 표에서 `0B` 와 구분되어야 하기 때문이다. 빈 문자열은 열이 비어 보여 조회 실패와 헷갈린다.
- 타입을 먼저 고쳐야 Phase 02 의 병합 로직이 컴파일러의 도움을 받는다. 순서를 바꾸면 `null` 처리 누락이 조용히 통과한다.
