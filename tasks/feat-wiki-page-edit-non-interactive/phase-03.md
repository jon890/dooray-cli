# Phase 3: page-edit 비대화형 플래그 + 분기 로직 + SKILL.md

## 컨텍스트

Phase 1에서 `updateWikiPageTitle`/`updateWikiPageContent` API 메서드가 준비됐고, Phase 2에서 `readBodyInput` 공용 유틸이 준비됐다. 이제 `wiki page edit` 커맨드에 플래그를 추가하고 플래그 조합별로 적절한 API를 호출한다.

### 먼저 읽을 파일

- `src/commands/wiki/page-edit.ts` — 현재 $EDITOR 전용 구현 (action L16-44)
- `src/commands/wiki/page-create.ts` — Phase 2에서 `readBodyInput` 사용 패턴 참조
- `src/api/client.ts` — `updateWikiPage`, `updateWikiPageTitle`, `updateWikiPageContent` 3개 메서드
- `src/editor/index.ts` — `openInEditor`, `serializeWikiFrontmatter`, `parseWikiFrontmatter` (기존 flow 재사용)
- `skills/dooray-cli/SKILL.md` — Commands 표에 wiki 항목 추가 위치
- `docs/dooray-api-reference.md` §7 "Wiki 페이지 수정 엔드포인트 3종" — 분기 매핑 스펙

### 이전 phase 상호작용

Phase 1+2가 완료되어 있어야 동작. 이 phase는 두 phase 산출물을 **사용자 기능**으로 조립.

### 분기 로직 스펙

| 플래그 조합 | 동작 | 호출 API |
|---|---|---|
| 없음 | `$EDITOR` 열어 제목+본문 수정 (기존) | `updateWikiPage` |
| `--title X` 단독 | 제목만 | `updateWikiPageTitle` |
| `--body Y` or `--body-file f` 단독 | 본문만 | `updateWikiPageContent` |
| `--title X` + body 플래그 | 제목+본문 | `updateWikiPage` |

`--body` / `--body-file` 동시 지정은 `readBodyInput` 내부에서 이미 에러 처리됨 (Phase 2).

## 목표

1. `wiki page edit` 에 `--title`, `--body`, `--body-file` 옵션 추가
2. 플래그 조합에 따라 3개 API 중 하나로 분기
3. 플래그 전혀 없으면 기존 $EDITOR flow 그대로
4. `skills/dooray-cli/SKILL.md` Commands 표에 `wiki page edit` 비대화형 예시 추가

## 작업 목록

### 1) `src/commands/wiki/page-edit.ts` 재작성

파일 전체를 아래 구조로 교체 (기존 $EDITOR flow 보존):

```ts
import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolveWiki } from "../../resolvers/wiki.js";
import {
  openInEditor,
  serializeWikiFrontmatter,
  parseWikiFrontmatter,
} from "../../editor/index.js";
import { readBodyInput } from "../../utils/body-input.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";

export const wikiPageEditCommand = new Command("edit")
  .description("위키 페이지 수정 (플래그 없으면 $EDITOR)")
  .argument("<project>", "프로젝트 코드 또는 ID")
  .argument("<page-id>", "페이지 ID")
  .option("--title <title>", "페이지 제목 (지정 시 $EDITOR 생략)")
  .option("--body <text>", "본문 텍스트 (- 입력 시 stdin에서 읽기)")
  .option("--body-file <path>", "본문 파일 경로 (- 입력 시 stdin에서 읽기)")
  .action(async (project, pageId, opts) => {
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    const hasTitle = opts.title != null;
    const hasBody = opts.body != null || opts.bodyFile != null;
    const nonInteractive = hasTitle || hasBody;

    startSpinner("위키 정보 조회 중...");
    const wikiId = await resolveWiki(client, project);

    if (!nonInteractive) {
      // 기존 $EDITOR flow
      const res = await client.getWikiPage(wikiId, pageId);
      const page = res.result;
      stopSpinner(true, "위키 페이지 조회 완료");

      const original = serializeWikiFrontmatter(page);
      const edited = await openInEditor(original);

      if (original === edited) {
        process.stdout.write("변경사항 없음\n");
        return;
      }

      const parsed = parseWikiFrontmatter(edited);

      startSpinner("위키 페이지 수정 중...");
      await client.updateWikiPage(wikiId, pageId, {
        subject: parsed.title,
        body: { mimeType: "text/x-markdown", content: parsed.body },
      });
      stopSpinner(true, "위키 페이지 수정 완료");
      process.stdout.write(`위키 페이지가 수정되었습니다: ${pageId}\n`);
      return;
    }

    // 비대화형 분기
    stopSpinner(true, "위키 정보 조회 완료");

    if (hasTitle && hasBody) {
      const bodyContent = await readBodyInput(opts);
      startSpinner("위키 페이지 수정 중...");
      await client.updateWikiPage(wikiId, pageId, {
        subject: opts.title,
        body: { mimeType: "text/x-markdown", content: bodyContent },
      });
    } else if (hasTitle) {
      startSpinner("위키 페이지 제목 수정 중...");
      await client.updateWikiPageTitle(wikiId, pageId, { subject: opts.title });
    } else {
      // hasBody only
      const bodyContent = await readBodyInput(opts);
      startSpinner("위키 페이지 본문 수정 중...");
      await client.updateWikiPageContent(wikiId, pageId, {
        body: { mimeType: "text/x-markdown", content: bodyContent },
      });
    }

    stopSpinner(true, "위키 페이지 수정 완료");
    process.stdout.write(`위키 페이지가 수정되었습니다: ${pageId}\n`);
  });
```

**설계 핵심**:
- `nonInteractive` 판정: `--title` 또는 body 플래그 중 **하나라도** 있으면 true
- `readBodyInput(opts)` 호출 시점은 **API 호출 직전**에만 (title-only 분기에선 호출 안 함 → 불필요한 stdin 대기 방지)
- spinner 메시지는 분기별로 차별화 (제목/본문/둘다)
- 기존 flow의 "변경사항 없음" 조기 리턴은 $EDITOR 경로에서만 작동

### 2) `skills/dooray-cli/SKILL.md` Commands 표 업데이트

기존 표 한 줄 추가. L68 근방 (`위키 페이지 생성` 바로 아래):

**현재 상태 확인**:
```bash
# cwd: /Users/nhn/personal/dooray-cli
grep -n "위키 페이지 생성\|위키 페이지 수정" skills/dooray-cli/SKILL.md
```

**추가할 줄** (위키 페이지 수정 관련 기존 행이 있으면 교체, 없으면 생성 행 아래에 삽입):

```markdown
| 위키 페이지 수정 (제목) | `dooray wiki page edit <project> <page-id> --title "..."` |
| 위키 페이지 수정 (본문) | `dooray wiki page edit <project> <page-id> --body "..."` 또는 `--body-file ./new.md` |
| 위키 페이지 수정 (에디터) | `dooray wiki page edit <project> <page-id>` (플래그 없으면 $EDITOR 열림) |
```

**주의**: `--title` 로 쓸 것 (`--subject` 아님). 현재 SKILL.md의 `wiki page create` 행은 이미 `--subject`로 잘못 쓰여 있지만, 이 task는 그 줄을 건드리지 않는다 (Issue #9 범위).

### 3) 빌드 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm run build
```

### 4) 정적 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 옵션 추가 확인
grep -n 'option("--title\|option("--body\|option("--body-file' src/commands/wiki/page-edit.ts

# 3개 API 호출 모두 포함 확인
grep -n "updateWikiPage\b\|updateWikiPageTitle\|updateWikiPageContent" src/commands/wiki/page-edit.ts

# readBodyInput import + 호출 확인
grep -n "readBodyInput" src/commands/wiki/page-edit.ts

# 기존 $EDITOR flow 보존 확인 (openInEditor 호출이 남아있어야 함)
grep -n "openInEditor" src/commands/wiki/page-edit.ts

# SKILL.md 항목 추가 확인
grep -n "위키 페이지 수정" skills/dooray-cli/SKILL.md
```

## 성공 기준

- [ ] `pnpm run build` 성공 (exit 0)
- [ ] `grep '--title\|--body\|--body-file' src/commands/wiki/page-edit.ts` → 3개 옵션 모두 매치
- [ ] `grep "updateWikiPageTitle" src/commands/wiki/page-edit.ts` → 1줄 이상
- [ ] `grep "updateWikiPageContent" src/commands/wiki/page-edit.ts` → 1줄 이상
- [ ] `grep "updateWikiPage\b" src/commands/wiki/page-edit.ts` → 1줄 이상 (둘 다 지정 분기)
- [ ] `grep "readBodyInput" src/commands/wiki/page-edit.ts` → 2줄 (import + 호출)
- [ ] `grep "openInEditor" src/commands/wiki/page-edit.ts` → 1줄 이상 (기존 flow 보존)
- [ ] `grep -c "위키 페이지 수정" skills/dooray-cli/SKILL.md` → 3 이상 (제목/본문/에디터)
- [ ] `git diff --stat` → `src/commands/wiki/page-edit.ts` + `skills/dooray-cli/SKILL.md` 2 파일 수정

## 주의사항

- **기존 $EDITOR flow를 건드리지 말 것** — `serializeWikiFrontmatter`, `parseWikiFrontmatter`, `openInEditor` 호출 순서와 "변경사항 없음" 조기 리턴 등 동일하게 보존
- **Spinner 라이프사이클** — `resolveWiki` 호출은 모든 경로에 공통이므로 진입 직후 spinner 시작. 분기에 따라 spinner 메시지만 다르게 갱신
- **`opts.title != null` 판정 중요** — `--title ""` 로 빈 문자열 제목을 보낼 수 있어야 함. 단, API가 400 반환 시 그대로 전달 (CLI 단 가드 추가 안 함)
- **SKILL.md의 `wiki page create` 라인 수정 금지** — 그건 Issue #9 스코프

## Blocked 조건

- Phase 1의 `updateWikiPageTitle`/`updateWikiPageContent` 메서드가 실제로 존재하지 않음 → `PHASE_BLOCKED: Phase 1 산출물 누락`
- Phase 2의 `readBodyInput` export가 실제로 존재하지 않음 → `PHASE_BLOCKED: Phase 2 산출물 누락`
- `src/editor/index.ts` 에서 `serializeWikiFrontmatter`/`parseWikiFrontmatter`/`openInEditor` export 중 하나라도 누락 → `PHASE_BLOCKED: editor 모듈 구조 변경 감지`
- `skills/dooray-cli/SKILL.md` 파일이 존재하지 않음 → `PHASE_BLOCKED: skills 문서 경로 변경 감지`
