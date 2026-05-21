# Phase 01 — api/client (3 method) + types + utils/dooray-url (wiki URL parser) + resolvers/wiki-page-input + 단위 테스트

## 컨텍스트

Issue #70 — wiki 페이지 첨부파일을 CLI 로 제어 불가. 본 phase 는 명령 구현 전 인프라 (API 클라이언트 메소드 + 타입 + URL parser + input resolver) 를 준비.

**결정 (사용자 확정, 2026-05-21)**:
- 명령 위치: `wiki page file <verb>` (기존 `wiki page` 그룹 아래, post file mirror)
- 5 verb: `list / upload / download / download-all / delete`
- Page 입력: `<project> <page-id>` + `--id` + `--url` + positional URL (post file 패턴 mirror)
- upload: 단일 파일, `--type general|inline_image` (기본 `general`), multipart `type` → `file` 순서 강제 (ADR-029)
- list: 별도 endpoint 없음 → `getWikiPage` 응답의 `result.files[]` + `result.images[]` 합성
- delete: confirm 없이 즉시 (post file delete mirror)

코드 컨텍스트:
- `src/utils/dooray-url.ts:1-13` — 현재 `TASK_URL_RE` + `TASK_URL_ALT_RE`. `parseDoorayTaskUrl(string): string | null` 와 `isLikelyDoorayUrl` export
- `src/resolvers/post-input.ts:42-110` — `resolvePostInput` 패턴 — 본 task 의 `resolveWikiPageInput` 가 mirror
- `src/api/client.ts:484-553` — wiki 메소드들 (`getWikiPage`, `createWikiPage`, `updateWikiPage` 등)
- `src/api/client.ts:555-680` — post file 메소드 4종 (`uploadPostFile` 의 307 + multipart 패턴 그대로 mirror)
- `src/api/types.ts:454-467` — `WikiPageDetail` (현재 `files` / `images` 필드 없음 — 추가 필요)

## 변경 파일 (정확)

기대 결과 (총 7 파일):
```
src/utils/dooray-url.ts                              (수정 — WIKI_URL_RE 추가 + parseDoorayWikiUrl export)
src/utils/dooray-url.test.ts                         (수정 — wiki URL 3 케이스 추가)
src/api/types.ts                                     (수정 — WikiPageDetail.files/images + UploadWikiPageFileResponse 추가)
src/api/client.ts                                    (수정 — uploadWikiPageFile / downloadWikiPageFile / deleteWikiPageFile 3 메소드)
src/resolvers/wiki-page-input.ts                     (신규 — resolveWikiPageInput)
src/resolvers/wiki-page-input.test.ts                (신규 — 6 케이스: positional / --id / --url / URL positional / 충돌 / 에러)
tasks/035-feat-wiki-page-file-commands/index.json    (status: in_progress, current_phase: 2 — phase-02 진입 직전 phase-03 에서 마킹)
```

**planning docs (CLAUDE.md / docs/adr.md / docs/code-architecture.md / docs/prd.md / docs/flow.md) 는 task 생성 시점에 main 직접 commit 으로 선반영** — phase 안에서 추가 변경 금지.

## 작업 항목 (5개 이하)

### 1. `src/utils/dooray-url.ts` + 단위 테스트 — wiki URL parser 추가

```ts
// 기존 TASK_URL_RE, TASK_URL_ALT_RE 유지. 신규 추가:
const WIKI_URL_RE = /^https?:\/\/[\w.-]+\.dooray\.com\/wiki\/(\d+)\/(\d+)(?:[/?#].*)?$/;

export interface ParsedWikiPageUrl {
  wikiId: string;
  pageId: string;
}

export function parseDoorayWikiUrl(input: string): ParsedWikiPageUrl | null {
  const m = WIKI_URL_RE.exec(input);
  if (!m) return null;
  return { wikiId: m[1], pageId: m[2] };
}

// isLikelyDoorayUrl 은 기존 그대로 — wiki / task 둘 다 https?:// 시작이므로 재사용
```

테스트 (`dooray-url.test.ts`) 에 wiki 3 케이스 추가 (기존 describe 블록 옆에 새 describe 추가):

```ts
describe("parseDoorayWikiUrl", () => {
  it("표준 wiki URL → {wikiId, pageId}", () => {
    expect(parseDoorayWikiUrl("https://x.dooray.com/wiki/123/456"))
      .toEqual({ wikiId: "123", pageId: "456" });
  });
  it("쿼리 파라미터 무시", () => {
    expect(parseDoorayWikiUrl("https://my-org.dooray.com/wiki/123/456?foo=bar"))
      .toEqual({ wikiId: "123", pageId: "456" });
  });
  it("task URL 은 wiki parser 에서 null", () => {
    expect(parseDoorayWikiUrl("https://x.dooray.com/task/123/456")).toBeNull();
  });
});
```

### 2. `src/api/types.ts` — WikiPageDetail 확장 + UploadWikiPageFileResponse

기존 `WikiPageDetail` 에 optional 필드 2개 추가 + 신규 응답 타입:

```ts
// WikiPageDetail (line 454) 에 추가:
export interface WikiPageFile {
  id: string;
  name: string;
  size: number;
}

export interface WikiPageDetail {
  // ... 기존 필드 ...
  files?: WikiPageFile[];   // general 첨부
  images?: WikiPageFile[];  // inline_image
}

// 새 타입 (UpdateWikiPageContentRequest 뒤에 추가):
export type WikiPageFileType = "general" | "inline_image";

export interface UploadWikiPageFileResult {
  id: string;
  attachFileId: string;
  name: string;
  mimeType: string;
  type: WikiPageFileType;
  size: number;
  createdAt: string;
}

export type UploadWikiPageFileResponse = DoorayApiResponse<UploadWikiPageFileResult>;
```

### 3. `src/api/client.ts` — 3 메소드 추가 (ADR-029 multipart 순서 강제 + ADR-015 307 패턴 재사용)

`deletePostFile` (line 663) 직후, `// ─── Templates ───` 섹션 직전에 신규 섹션 추가:

```ts
// ─── Wiki Page Files (ADR-029) ──────────────────────

async uploadWikiPageFile(
  wikiId: string,
  pageId: string,
  filePath: string,
  type: WikiPageFileType,
): Promise<UploadWikiPageFileResponse> {
  try {
    const fileName = basename(filePath);
    const fileBuffer = await readFile(filePath);

    // ADR-029: type 필드를 file 필드보다 먼저 append (Dooray 서버 순서 검증)
    const buildFormData = (): FormData => {
      const fd = new FormData();
      fd.append("type", type);
      fd.append("file", new Blob([fileBuffer]), fileName);
      return fd;
    };

    const url = `${this.baseUrl}wiki/v1/wikis/${wikiId}/pages/${pageId}/files`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: this.authHeader },
      body: buildFormData(),
      redirect: "manual",
    });

    if (res.status === 307) {
      const location = res.headers.get("location");
      if (!location) {
        throw new DoorayCliError("위키 파일 업로드 리다이렉트 URL을 받지 못했습니다.", EXIT_API_ERROR);
      }
      // 재시도 시에도 FormData 새로 빌드 (type → file 순서 보장)
      const uploadRes = await fetch(location, {
        method: "POST",
        headers: { Authorization: this.authHeader },
        body: buildFormData(),
      });
      if (!uploadRes.ok) {
        throw new DoorayCliError(`위키 파일 업로드 실패 (${uploadRes.status})`, EXIT_API_ERROR);
      }
      return await uploadRes.json() as UploadWikiPageFileResponse;
    }

    if (!res.ok) {
      throw new DoorayCliError(`위키 파일 업로드 실패 (${res.status})`, EXIT_API_ERROR);
    }
    return await res.json() as UploadWikiPageFileResponse;
  } catch (e) {
    if (e instanceof DoorayCliError) throw e;
    throw await toDoorayCliError(e);
  }
}

async downloadWikiPageFile(
  wikiId: string,
  pageId: string,
  fileId: string,
): Promise<{ buffer: ArrayBuffer; fileName: string }> {
  try {
    const res = await this.api
      .get(`wiki/v1/wikis/${wikiId}/pages/${pageId}/files/${fileId}`, {
        redirect: "manual",
        throwHttpErrors: false,
      });

    const location = res.headers.get("location");
    if (!location) {
      throw new DoorayCliError("위키 파일 다운로드 리다이렉트 URL을 받지 못했습니다.", EXIT_API_ERROR);
    }

    const fileRes = await fetch(location, {
      headers: { Authorization: this.authHeader },
    });
    if (!fileRes.ok) {
      throw new DoorayCliError(`위키 파일 다운로드 실패 (${fileRes.status})`, EXIT_API_ERROR);
    }

    const disposition = fileRes.headers.get("content-disposition");
    let fileName = `file-${fileId}`;
    if (disposition) {
      const match = disposition.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);
      if (match) fileName = decodeURIComponent(match[1].replace(/"/g, ""));
    }

    const buffer = await fileRes.arrayBuffer();
    return { buffer, fileName };
  } catch (e) {
    if (e instanceof DoorayCliError) throw e;
    throw await toDoorayCliError(e);
  }
}

async deleteWikiPageFile(
  wikiId: string,
  pageId: string,
  fileId: string,
): Promise<DoorayApiUnitResponse> {
  try {
    return await this.api
      .delete(`wiki/v1/wikis/${wikiId}/pages/${pageId}/files/${fileId}`)
      .json<DoorayApiUnitResponse>();
  } catch (e) {
    throw await toDoorayCliError(e);
  }
}
```

import 추가 필요: `WikiPageFileType`, `UploadWikiPageFileResponse` (type), `basename` / `readFile` 는 이미 post file 에서 import 중 — 재사용.

### 4. `src/resolvers/wiki-page-input.ts` + 단위 테스트 (resolvePostInput 패턴 mirror)

```ts
import { DoorayApiClient } from "../api/client.js";
import { resolveProject } from "./project.js";
import { resolveWiki } from "./wiki.js";
import { parseDoorayWikiUrl, isLikelyDoorayUrl } from "../utils/dooray-url.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

export interface WikiPageInputArgs {
  projectArg?: string;
  pageIdArg?: string;
  idOpt?: string;   // pageId 직접 — wikiId 별도 fetch 필요
  urlOpt?: string;
}

export interface ResolvedWikiPageInput {
  wikiId: string;
  pageId: string;
}

const INPUT_HELP =
  "위키 페이지를 식별할 정보가 부족합니다. 다음 중 하나를 입력하세요:\n" +
  "  - <project> <page-id>          예: my-project 4071828729722696495\n" +
  "  - --id <page-id> --project <project>   (또는 --url)\n" +
  "  - <Dooray URL>                 예: https://x.dooray.com/wiki/<wikiId>/<pageId>";

export async function resolveWikiPageInput(
  client: DoorayApiClient,
  args: WikiPageInputArgs & { project?: string },
): Promise<ResolvedWikiPageInput> {
  const { projectArg, pageIdArg, idOpt, urlOpt, project } = args;
  const hasPositional = !!projectArg || !!pageIdArg;

  if (idOpt && urlOpt) {
    throw new DoorayCliError("--id와 --url은 동시에 사용할 수 없습니다.", EXIT_PARAM_ERROR);
  }
  if ((idOpt || urlOpt) && hasPositional) {
    throw new DoorayCliError("--id/--url과 positional 인자(<project> <page-id>)는 동시에 사용할 수 없습니다.", EXIT_PARAM_ERROR);
  }

  // 1. --url — wikiId/pageId 둘 다 URL 에서 추출 (project 불요)
  if (urlOpt) {
    const parsed = parseDoorayWikiUrl(urlOpt);
    if (!parsed) {
      throw new DoorayCliError(
        `--url 형식이 올바르지 않습니다: "${urlOpt}"\n예: https://x.dooray.com/wiki/<wikiId>/<pageId>`,
        EXIT_PARAM_ERROR,
      );
    }
    return parsed;
  }

  // 2. positional 1개 & URL 형태 — wikiId/pageId 둘 다 URL 에서 추출
  if (projectArg && !pageIdArg && isLikelyDoorayUrl(projectArg)) {
    const parsed = parseDoorayWikiUrl(projectArg);
    if (!parsed) {
      throw new DoorayCliError(
        `Dooray Wiki URL 형식이 올바르지 않습니다: "${projectArg}"\n예: https://x.dooray.com/wiki/<wikiId>/<pageId>`,
        EXIT_PARAM_ERROR,
      );
    }
    return parsed;
  }

  // 3. --id 단독 — project 필요 (wikiId 해석에 project 필요)
  if (idOpt) {
    const projectCode = project ?? projectArg;
    if (!projectCode) {
      throw new DoorayCliError(
        "--id 모드는 --project <code> 가 필요합니다 (또는 첫 positional 에 project code).",
        EXIT_PARAM_ERROR,
      );
    }
    const wikiId = await resolveWiki(client, projectCode);
    return { wikiId, pageId: idOpt };
  }

  // 4. positional 2개 (기본 경로)
  if (projectArg && pageIdArg) {
    const wikiId = await resolveWiki(client, projectArg);
    return { wikiId, pageId: pageIdArg };
  }

  throw new DoorayCliError(INPUT_HELP, EXIT_PARAM_ERROR);
}
```

**중요 차이 (post-input.ts 대비)**:
- post 는 `getPostStandalone(postId)` 가 있어 `--id` 단독으로 projectId 역추적 가능. wiki API 는 `getPageStandalone` 부재 → `--id` 모드에서 project 필요. 본 task 는 `--id` 와 동시에 `--project` 옵션 명시 (또는 첫 positional 에 project code) 로 우회.
- 명령 측에서는 positional 시그니처를 `<arg1> [arg2]` 로 유연하게 받아 분기 (post file 패턴 mirror — 동일 로직)

테스트 6 케이스:
- positional 2개 → wikiId resolve + pageId 반환
- `--url` 단독 → URL parser 결과 그대로
- positional URL → URL parser 결과 그대로
- `--id` + `--project` → resolveWiki + pageId
- `--id` + `--url` 충돌 → throw
- positional 0개 → INPUT_HELP throw

mock: `DoorayApiClient` 모킹, `resolveWiki` 는 fixture wikiId 반환.

### 5. tsc + build + test 동작 확인

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
# 기대: 0

pnpm build && pnpm test
# 기대: exit 0, wiki-page-input.test.ts 6 케이스 + dooray-url.test.ts 의 wiki 3 케이스 추가 통과
```

## code-review-pitfalls 회피 항목

본 phase 는 인프라 (client + types + utils + resolver) 만 다루므로 spinner / command UX 관련 항목 (1-x, 2-x) 은 phase-02 에서 점검.

- **3-3 (테스트 mock mirror)**: `wiki-page-input.test.ts` 는 `resolveWiki` 와 `DoorayApiClient` 두 곳을 모킹. `resolveWiki` 는 fixture 로 wikiId 반환 — 실제 캐시/API 호출 격리
- **4-x (외과적 변경)**: `WikiPageDetail` 에 `files?` / `images?` optional 추가만. 기존 wiki 명령 (`page-get` 등) 동작 영향 없음 확인 필요 — `WikiPageDetail` 를 destructure 하는 곳에서 unknown property 무시
- **ADR-015 패턴 답습**: `uploadWikiPageFile` 의 307 처리 + manual fetch 는 `uploadPostFile` 구조 그대로 mirror — 신규 패턴 도입 아님
- **ADR-029 강제**: `buildFormData()` 클로저로 매 호출 새 FormData 생성. 호출자가 FormData 객체를 직접 못 만지게 캡슐화

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. tsc + build + test
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
# 기대: 0
pnpm build && pnpm test
# 기대: exit 0

# 2. 신규 파일 / 메소드
ls src/resolvers/wiki-page-input.ts src/resolvers/wiki-page-input.test.ts
grep -nE "^\s*async (uploadWikiPageFile|downloadWikiPageFile|deleteWikiPageFile)\b" src/api/client.ts
# 기대: 3줄

# 3. URL parser
grep -nE "parseDoorayWikiUrl|WIKI_URL_RE" src/utils/dooray-url.ts
# 기대: 3줄 이상 (regex 정의 + 함수 export + 사용)

# 4. ADR-029 multipart 순서 검증 (type append 가 file append 보다 먼저인지)
awk '/uploadWikiPageFile/,/^  \}/' src/api/client.ts | \
  grep -nE 'append\("(type|file)"' | head -4
# 기대: 첫 번째 매치가 "type", 두 번째가 "file" (그리고 307 재시도에서 buildFormData 재호출이므로 동일 순서)

# 5. WikiPageDetail.files/images 노출
grep -nE "files\?:\s*WikiPageFile\[\]|images\?:\s*WikiPageFile\[\]" src/api/types.ts
# 기대: 2줄
```

## 작업 외 금지

- 명령 파일 (`src/commands/wiki/page-file/`) 생성 금지 — phase-02
- README / SKILL.md 갱신 금지 — phase-03
- planning docs 변경 금지 — task 생성 시점에 main commit 으로 반영됨
- 신규 ADR 작성 금지 — ADR-029 는 task 생성 시점 main commit
- 기존 wiki 명령 (`page-get`, `page-create`, `page-edit`) 동작 변경 금지 — `WikiPageDetail` optional 필드 추가만 허용
- `getPageStandalone` 같은 신규 API client 메소드 추가 금지 — `--id` 모드는 `--project` 동반 요구로 해결

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/035-feat-wiki-page-file-commands (main 에서 분기)
git add src/utils/dooray-url.ts src/utils/dooray-url.test.ts \
        src/api/types.ts src/api/client.ts \
        src/resolvers/wiki-page-input.ts src/resolvers/wiki-page-input.test.ts
git commit -m "$(cat <<'EOF'
feat(api,utils,resolvers): add wiki page file API + URL parser + input resolver (Issue #70 phase 1/3)

- utils/dooray-url.ts: WIKI_URL_RE + parseDoorayWikiUrl (wiki URL 지원, ADR-020 확장)
- api/types.ts: WikiPageDetail.files/images + UploadWikiPageFileResponse 추가
- api/client.ts: uploadWikiPageFile (multipart type→file 순서 강제 ADR-029, 307 ADR-015) +
  downloadWikiPageFile (307) + deleteWikiPageFile 3 메소드
- resolvers/wiki-page-input.ts: resolveWikiPageInput (post-input 패턴 mirror,
  --id 모드는 --project 동반 필수 — wiki API 가 page-only fetch 미지원)
- 단위 테스트: wiki-page-input 6 케이스 + dooray-url wiki 3 케이스
EOF
)"
```
