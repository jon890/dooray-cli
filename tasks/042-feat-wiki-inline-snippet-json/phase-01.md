# Phase 01 — wikiInlineImageSnippet 헬퍼 + upload --json markdownSnippet + 테스트 + ADR-031 보강 + docs

## 컨텍스트

Issue #81 — `wiki page file upload` 의 `inline_image` 타입이 plain 모드에서만 markdown snippet 출력.
`--json` / `--quiet` 자동화 경로에서 snippet 을 얻을 길이 없음.

**현재 상태** (`src/commands/wiki/page-file/upload.ts`):
- plain 모드: inline_image 시 `![name](/wikis/{wikiId}/files/{attachFileId})` snippet 출력
- `--json`: `printJson(res.result)` — snippet 필드 없음
- `--quiet`: `id` 만

**결정**:
- `--json` 응답에 inline_image 일 때만 `markdownSnippet` 필드 추가
- `--quiet` 은 "id 만" 원칙 유지 (snippet 미포함)
- plain snippet 과 `--json` snippet 을 `wikiInlineImageSnippet` 헬퍼로 단일화 → 동일 문자열 보장 + 테스트
- `general` 타입은 변경 없음

## 변경 파일 (정확)

```
src/utils/wiki-snippet.ts                   (신규 — wikiInlineImageSnippet 순수 함수)
src/utils/wiki-snippet.test.ts              (신규 — 헬퍼 단위 테스트)
src/commands/wiki/page-file/upload.ts       (수정 — 헬퍼 사용 + --json markdownSnippet)
docs/adr.md                                 (수정 — ADR-031 보강 섹션)
CLAUDE.md                                   (수정 — file 명령군 출력 섹션 + wiki page file 섹션 한 줄)
README.md                                   (수정 — wiki inline_image --json 사용 예)
skills/dooray-cli/SKILL.md                  (수정 — 자동화 시나리오)
tasks/042-feat-wiki-inline-snippet-json/index.json   (완료 마킹)
```

## code-review-pitfalls self-check

- spinner 순서: 변경부는 `stopSpinner(true)` 이후 출력 분기 — spinner 무관.
- 순수 함수 분리: `wikiInlineImageSnippet` 은 부수효과 0 → 직접 테스트.
- 출력 정책 일관: `--quiet` 우선순위·"id 만" 원칙 유지 (ADR-031 정책 변경 아님, 확장).

## 작업 항목 (5개 이하)

### 1. 헬퍼 추출 — `src/utils/wiki-snippet.ts` (신규)

```ts
// wiki inline_image 본문 삽입용 markdown reference.
// plain 출력과 --json markdownSnippet 필드가 동일 문자열이 되도록 단일화.
export function wikiInlineImageSnippet(
  wikiId: string,
  attachFileId: string,
  name: string,
): string {
  return `![${name}](/wikis/${wikiId}/files/${attachFileId})`;
}
```

### 2. upload.ts 적용 — `src/commands/wiki/page-file/upload.ts`

`--json` 분기에 inline_image 시 `markdownSnippet` 추가. plain 분기는 헬퍼 호출로 교체.

```ts
import { wikiInlineImageSnippet } from "../../../utils/wiki-snippet.js";

// --json 분기
if (globalOpts.json) {
  const payload =
    fileType === "inline_image"
      ? {
          ...res.result,
          markdownSnippet: wikiInlineImageSnippet(
            wikiId,
            res.result.attachFileId,
            res.result.name,
          ),
        }
      : res.result;
  printJson(payload);
} else if (globalOpts.quiet) {
  process.stdout.write(`${res.result.id}\n`);   // 변경 없음 — id 만
} else {
  // ...기존 attachFileId/name/size/type 출력...
  if (fileType === "inline_image") {
    process.stdout.write("\n본문 삽입용 markdown snippet (직접 wiki page edit 으로 본문에 박으세요):\n");
    process.stdout.write(
      `  ${wikiInlineImageSnippet(wikiId, res.result.attachFileId, res.result.name)}\n`,
    );
  }
}
```

### 3. 단위 테스트 — `src/utils/wiki-snippet.test.ts` (신규)

- `wikiInlineImageSnippet("W", "F", "a.png")` → `![a.png](/wikis/W/files/F)`
- 공백·한글 파일명 등 그대로 보존 확인

### 4. ADR-031 보강 + CLAUDE.md

`docs/adr.md` ADR-031 본문 끝(`**트레이드오프**` 블록 다음, `---` 앞)에 추가:

```markdown
**보강 (Issue #81, 2026-06)**: `wiki page file upload` 의 `--json` 출력에 inline_image 시 `markdownSnippet` 필드 추가.
`--quiet` 은 "id 만" 원칙 유지(snippet 미포함).
plain 모드 snippet 과 동일 문자열을 `wikiInlineImageSnippet` 헬퍼로 단일화.
general 타입은 변경 없음.
```

`CLAUDE.md` 변경:
- "file 명령군 `--json` / `--quiet` 출력" 섹션의 `upload` 줄에 "inline_image 시 `markdownSnippet` 필드 (ADR-031 보강)" 한 줄.
- "wiki page file" 섹션 inline_image 항목에 "`--json` 은 `markdownSnippet` 포함" 한 줄.

### 5. README + SKILL 사용 예

- `README.md`: wiki inline_image 업로드 `--json` 출력에 `markdownSnippet` 포함 예시.
- `skills/dooray-cli/SKILL.md`: 자동화 시나리오에 "inline_image 업로드 후 `--json` 의 `markdownSnippet` 으로 본문 삽입" 추가.

## 검증 기준

- `pnpm tsc --noEmit && pnpm test && pnpm run build` 통과
- inline_image `--json` 출력에 `markdownSnippet` 존재, plain snippet 과 문자열 일치
- general `--json` 출력은 `markdownSnippet` 없음 (변경 없음)
- `--quiet` 은 id 만 (회귀 0)
- 가독성 + 개인 식별 정보 grep 통과 (placeholder 사용)
