# Phase 01 — wikiInlineImageSnippet 헬퍼 + upload --json markdownSnippet + 테스트 + README/SKILL

## 컨텍스트

Issue #81 — `wiki page file upload` 의 `inline_image` 타입이 plain 모드에서만 markdown snippet 출력.
`--json` / `--quiet` 자동화 경로에서 snippet 을 얻을 길이 없음.

**영향 범위**: `wiki page file upload` 단일 명령.
inline_image 타입은 wiki page file 에만 존재 (`WikiPageFileType = "general" | "inline_image"`).
post file / comment file 엔 inline 개념 없음 → 무관.

**결정** (필드명 `markdownSnippet` 확정):
- `--json` 응답에 inline_image 일 때만 `markdownSnippet` 필드 추가
- `--quiet` 은 "id 만" 원칙 유지 (snippet 미포함)
- plain snippet 과 `--json` snippet 을 `wikiInlineImageSnippet` 헬퍼로 단일화 → 동일 문자열 보장 + 테스트
- `general` 타입은 변경 없음

**planning 결정 docs 는 선반영 완료**:
ADR-031 보강 / CLAUDE.md / code-architecture.md 는 planning 단계에서 이미 반영 + commit.
본 phase 는 코드 + 사용자 가이드 docs (README / SKILL) 만 다룬다.
README/SKILL 은 phase 의 실제 출력 예시에 의존하므로 코드 확정과 함께 작성.

## 변경 파일 (정확)

```
src/utils/wiki-snippet.ts                   (신규 — wikiInlineImageSnippet 순수 함수)
src/utils/wiki-snippet.test.ts              (신규 — 헬퍼 단위 테스트)
src/commands/wiki/page-file/upload.ts       (수정 — 헬퍼 사용 + --json markdownSnippet)
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

### 4. README + SKILL 사용 예

- `README.md`: wiki inline_image 업로드 `--json` 출력에 `markdownSnippet` 포함 예시.
  - 예시의 ID 는 placeholder (`<wikiId>` / `<attachFileId>`) 또는 dummy 패턴 — 실제 19자리 금지.
- `skills/dooray-cli/SKILL.md`: 자동화 시나리오에 "inline_image 업로드 후 `--json` 의 `markdownSnippet` 으로 본문 삽입" 추가.

### 5. 빌드·테스트 + 완료 마킹

```bash
pnpm tsc --noEmit && pnpm test && pnpm run build
```

- `index.json` `status` → `completed`, phase-01 `status` → `completed`, `updated_at` 갱신.

## 검증 기준

- inline_image `--json` 출력에 `markdownSnippet` 존재, plain snippet 과 문자열 일치
- general `--json` 출력은 `markdownSnippet` 없음 (변경 없음)
- `--quiet` 은 id 만 (회귀 0)
- 개인 식별 정보 grep 통과 (placeholder 사용):
  ```bash
  grep -rnE "[0-9]{15,}" README.md skills/ 2>/dev/null | grep -vE "1234567890123456789|9876543210987654321|<postId>|<pageId>|<wikiId>|<attachFileId>"
  # 0건이어야 함
  ```
