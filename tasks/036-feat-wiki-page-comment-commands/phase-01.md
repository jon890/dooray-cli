# Phase 01 — api/client (5 method) + types (WikiComment 등) + formatters/wiki-comment.ts + 단위 테스트

## 컨텍스트

wiki 페이지 댓글 6 명령을 위한 인프라. post comment 패턴 mirror.

**사전 조건**: task 035 phase-01 (`resolveWikiPageInput` + wiki URL parser + `getWikiPage` 의 files/images 확장) 머지 완료. 본 phase 는 035 산출물을 재사용.

**결정 (사용자 확정, 2026-05-21)**:
- 명령 위치: `wiki page comment <verb>` (035 의 `wiki page file` 과 path 일관성)
- 6 verb: `list / latest / get / add / edit / delete`
- formatter: **wiki 전용 신설** (`formatters/wiki-comment.ts`) — post comment 와 시그니처 다름 (mailUsers/files/mention 없음)
- ADR 불요 — API 단순, 함정 없음

**post comment 대비 시그니처 차이** (cmux-browser 공식 share 페이지 재확인, 2026-05-21):
- request body: `{ body: { content } }` 만 — post comment 의 `mimeType` 불요
- WikiComment 응답: `page: { id }` (post 의 `post: PostInfo` 대신) + `creator.member.name` 직접 포함 (ADR-021 enrich 불요)
- `mailUsers` / `files` / `type` / `subtype` 필드 부재
- mention / cc / 첨부 endpoint 모두 부재 → CLI 옵션도 미지원

코드 컨텍스트:
- `src/api/client.ts:485-553` — wiki 메소드 섹션 (신규 5 메소드 추가 지점)
- `src/api/types.ts:301-334` — PostComment / Create·UpdateCommentRequest / PostCommentListResponse / PostCommentDetailResponse / CreateCommentApiResponse (mirror 기준)
- `src/formatters/comment.ts` — PostComment formatter (구조 참조용, 시그니처 다름)
- `src/resolvers/wiki-page-input.ts` (task 035 산출물) — `resolveWikiPageInput`
- `src/api/client.ts` post comment 메소드들 (`getPostComments` / `getPostComment` / `addPostComment` / `updatePostComment` / `deletePostComment`)

## 변경 파일 (정확)

기대 결과 (총 5 파일):
```
src/api/types.ts                                             (수정 — WikiComment + WikiCommentBody + WikiCommentListResponse + WikiCommentDetailResponse + Create/UpdateWikiCommentRequest 추가)
src/api/client.ts                                            (수정 — getWikiPageComments / getWikiPageComment / addWikiPageComment / updateWikiPageComment / deleteWikiPageComment 5 메소드)
src/formatters/wiki-comment.ts                               (신규 — formatWikiComment + formatWikiCommentList)
src/formatters/wiki-comment.test.ts                          (신규 — 3 케이스: 단일 포맷 / JSON / quiet)
tasks/036-feat-wiki-page-comment-commands/index.json         (phase-03 에서 완료 마킹)
```

**planning docs (CLAUDE.md / docs/code-architecture.md / docs/prd.md / docs/flow.md) 는 task 생성 시점에 main 직접 commit 으로 선반영** — phase 안에서 추가 변경 금지.

## 작업 항목 (5개 이하)

### 1. `src/api/types.ts` — WikiComment 타입 신설

PostComment 섹션 (line 301-334) 뒤에 다음 추가:

```ts
export interface WikiCommentPage {
  id: string;
}

export interface WikiCommentCreator {
  type: string;        // "member" 고정
  member: {
    organizationMemberId: string;
    name: string;      // creator 이름 — API 가 직접 제공 (ADR-021 enrich 불요)
  };
}

export interface WikiCommentBody {
  mimeType: string;    // "text/x-markdown" 고정
  content: string;
}

export interface WikiComment {
  id: string;
  page: WikiCommentPage;
  createdAt: string;
  modifiedAt?: string;
  creator: WikiCommentCreator;
  body: WikiCommentBody;
}

export interface CreateWikiCommentRequest {
  body: { content: string };  // mimeType 미전송
}

export interface UpdateWikiCommentRequest {
  body: { content: string };
}

export interface WikiCommentListResponse {
  header: DoorayApiHeader;
  result: WikiComment[];
  totalCount: number;
}

export type WikiCommentDetailResponse = DoorayApiResponse<WikiComment>;

export interface CreateWikiCommentResult {
  id: string;
}

export type CreateWikiCommentApiResponse = DoorayApiResponse<CreateWikiCommentResult>;
```

### 2. `src/api/client.ts` — 5 메소드 추가

기존 wiki 섹션 (line 485-553) 끝에 추가:

```ts
async getWikiPageComments(
  wikiId: string,
  pageId: string,
  params?: { page?: number; size?: number },
): Promise<WikiCommentListResponse> {
  try {
    return await this.api
      .get(`wiki/v1/wikis/${wikiId}/pages/${pageId}/comments`, {
        searchParams: {
          ...(params?.page !== undefined && { page: params.page }),
          ...(params?.size !== undefined && { size: params.size }),
        },
      })
      .json<WikiCommentListResponse>();
  } catch (e) {
    throw await toDoorayCliError(e);
  }
}

async getWikiPageComment(
  wikiId: string,
  pageId: string,
  commentId: string,
): Promise<WikiCommentDetailResponse> {
  try {
    return await this.api
      .get(`wiki/v1/wikis/${wikiId}/pages/${pageId}/comments/${commentId}`)
      .json<WikiCommentDetailResponse>();
  } catch (e) {
    throw await toDoorayCliError(e);
  }
}

async addWikiPageComment(
  wikiId: string,
  pageId: string,
  body: CreateWikiCommentRequest,
): Promise<CreateWikiCommentApiResponse> {
  try {
    return await this.api
      .post(`wiki/v1/wikis/${wikiId}/pages/${pageId}/comments`, { json: body })
      .json<CreateWikiCommentApiResponse>();
  } catch (e) {
    throw await toDoorayCliError(e);
  }
}

async updateWikiPageComment(
  wikiId: string,
  pageId: string,
  commentId: string,
  body: UpdateWikiCommentRequest,
): Promise<DoorayApiUnitResponse> {
  try {
    return await this.api
      .put(`wiki/v1/wikis/${wikiId}/pages/${pageId}/comments/${commentId}`, { json: body })
      .json<DoorayApiUnitResponse>();
  } catch (e) {
    throw await toDoorayCliError(e);
  }
}

async deleteWikiPageComment(
  wikiId: string,
  pageId: string,
  commentId: string,
): Promise<DoorayApiUnitResponse> {
  try {
    return await this.api
      .delete(`wiki/v1/wikis/${wikiId}/pages/${pageId}/comments/${commentId}`)
      .json<DoorayApiUnitResponse>();
  } catch (e) {
    throw await toDoorayCliError(e);
  }
}
```

import 추가: `WikiCommentListResponse`, `WikiCommentDetailResponse`, `CreateWikiCommentRequest`, `UpdateWikiCommentRequest`, `CreateWikiCommentApiResponse`.

### 3. `src/formatters/wiki-comment.ts` — 전용 포맷터

`src/formatters/comment.ts` 패턴 mirror. 단 시그니처 차이 흡수:

```ts
import type { WikiComment } from "../api/types.js";
import type { OutputOptions } from "./table.js";
import { output, printJson, printQuiet } from "./table.js";

export interface FormatWikiCommentOptions {
  globalOpts: OutputOptions;
  totalCount?: number;
}

export function formatWikiCommentList(
  comments: WikiComment[],
  opts: FormatWikiCommentOptions,
): void {
  output(opts.globalOpts, {
    headers: ["ID", "작성자", "생성일", "본문 (요약)"],
    rows: comments.map((c) => [
      c.id,
      c.creator.member.name,
      c.createdAt,
      truncate(c.body.content, 60),
    ]),
    raw: comments,
    ids: comments.map((c) => c.id),
  });
}

export function formatWikiCommentDetail(
  comment: WikiComment,
  globalOpts: OutputOptions,
): void {
  if (globalOpts.json) {
    printJson(comment);
    return;
  }
  if (globalOpts.quiet) {
    printQuiet([comment.id]);
    return;
  }
  process.stdout.write(`ID:       ${comment.id}\n`);
  process.stdout.write(`Page ID:  ${comment.page.id}\n`);
  process.stdout.write(`작성자:   ${comment.creator.member.name}\n`);
  process.stdout.write(`생성일:   ${comment.createdAt}\n`);
  if (comment.modifiedAt && comment.modifiedAt !== comment.createdAt) {
    process.stdout.write(`수정일:   ${comment.modifiedAt}\n`);
  }
  process.stdout.write(`\n${comment.body.content}\n`);
}

function truncate(s: string, n: number): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length <= n ? oneLine : oneLine.slice(0, n - 1) + "…";
}
```

**post comment formatter 와의 차이**:
- creator 표시: `creator.name` (PostUser) → `creator.member.name` (WikiCommentCreator)
- post 의 `mailUsers` (받는 사람 / 참조) / `files` (첨부) 컬럼 부재
- post 의 `post.code/number` (속한 업무) → `page.id` (속한 페이지)

### 4. `src/formatters/wiki-comment.test.ts` — 단위 테스트

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WikiComment } from "../api/types.js";
import { formatWikiCommentDetail, formatWikiCommentList } from "./wiki-comment.js";

const fixture: WikiComment = {
  id: "3950295078642684620",
  page: { id: "3521165468947041024" },
  createdAt: "2024-12-03T17:51:10+09:00",
  modifiedAt: "2024-12-03T17:51:10+09:00",
  creator: { type: "member", member: { organizationMemberId: "u1", name: "홍길동" } },
  body: { mimeType: "text/x-markdown", content: "테스트 댓글 본문" },
};

describe("formatWikiCommentDetail", () => {
  let writes: string[];
  beforeEach(() => {
    writes = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s: any) => {
      writes.push(String(s));
      return true;
    });
  });

  it("table 모드 — 핵심 필드 모두 표시", () => {
    formatWikiCommentDetail(fixture, {});
    const joined = writes.join("");
    expect(joined).toContain("ID:");
    expect(joined).toContain("홍길동");
    expect(joined).toContain("테스트 댓글 본문");
  });

  it("--json 모드 — raw 객체 JSON 출력", () => {
    formatWikiCommentDetail(fixture, { json: true });
    const parsed = JSON.parse(writes.join(""));
    expect(parsed.id).toBe(fixture.id);
  });

  it("--quiet 모드 — ID 만 출력", () => {
    formatWikiCommentDetail(fixture, { quiet: true });
    expect(writes.join("").trim()).toBe(fixture.id);
  });
});
```

formatWikiCommentList 테스트는 `output` 헬퍼가 이미 다른 테스트에서 커버되므로 생략 (기존 패턴 답습).

### 5. tsc + build + test 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
# 기대: 0

pnpm build && pnpm test
# 기대: exit 0, wiki-comment.test.ts 3 케이스 통과
```

## code-review-pitfalls 회피 항목

본 phase 는 인프라 (client + types + formatter) 만 — spinner / UX 관련 패턴은 phase-02 에서 다룸.

- **3-3 (테스트 mock mirror)**: `wiki-comment.test.ts` 는 `process.stdout.write` spy 만 — 기존 formatter 테스트 패턴 mirror
- **4-x (외과적 변경)**: `api/types.ts` 에 신규 타입 추가만. 기존 PostComment 동작 영향 없음. `api/client.ts` 도 5 메소드 추가만, 기존 wiki 메소드 동작 무변경
- **post comment 패턴 답습 위험**: `mimeType` 을 wiki request body 에 넣지 않도록 주의 — wiki API 는 `body.content` 만 받음. post 의 `CreateCommentRequest` 와 다른 시그니처 (`CreateWikiCommentRequest`) 사용으로 컴파일 시점 분리

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. tsc + build + test
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
# 기대: 0
pnpm build && pnpm test
# 기대: exit 0 (3 케이스 추가 통과)

# 2. 신규 타입
grep -cE "^export interface (WikiComment|WikiCommentBody|WikiCommentPage|WikiCommentCreator|CreateWikiCommentRequest|UpdateWikiCommentRequest|WikiCommentListResponse|CreateWikiCommentResult)\b" src/api/types.ts
# 기대: 8

# 3. 신규 API 메소드
grep -cE "^\s*async (getWikiPageComments|getWikiPageComment|addWikiPageComment|updateWikiPageComment|deleteWikiPageComment)\b" src/api/client.ts
# 기대: 5

# 4. formatter export
grep -cE "^export function (formatWikiCommentList|formatWikiCommentDetail)\b" src/formatters/wiki-comment.ts
# 기대: 2

# 5. WikiComment request body 에 mimeType 미포함 검증 (post 패턴 답습 사고 회피)
grep -nE "mimeType" src/api/client.ts | grep -iE "WikiComment|wiki.*comment"
# 기대: 0 (client 의 wiki comment 메소드는 mimeType 안 보냄)
```

## 작업 외 금지

- 명령 파일 (`src/commands/wiki/page-comment/`) 생성 금지 — phase-02
- README / SKILL.md 갱신 금지 — phase-03
- planning docs 변경 금지
- 신규 ADR 작성 금지 — API 단순, 함정 없음
- post comment 의 mention / cc / file 옵션 mirror 금지 — wiki API 가 미지원
- 기존 PostComment 관련 코드 (`formatters/comment.ts`, `commands/post/comment/`) 변경 금지

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/036-feat-wiki-page-comment-commands (main 에서 분기, task 035 머지 후)
git add src/api/types.ts src/api/client.ts src/formatters/wiki-comment.ts src/formatters/wiki-comment.test.ts
git commit -m "$(cat <<'EOF'
feat(api,formatters): add wiki page comment types/methods + WikiComment formatter (task 036 phase 1/3)

- api/types.ts: WikiComment + WikiCommentBody + Page/Creator + Create/UpdateWikiCommentRequest +
  List/Detail/Create Response 8 타입 신설 (post comment 와 시그니처 분리)
- api/client.ts: getWikiPageComments / getWikiPageComment / addWikiPageComment /
  updateWikiPageComment / deleteWikiPageComment 5 메소드
- formatters/wiki-comment.ts: formatWikiCommentDetail / formatWikiCommentList
  (page.id + creator.member.name 시그니처 흡수)
- 단위 테스트 3 케이스 (table / --json / --quiet)
- request body 에 mimeType 미전송 (post comment 와 의도된 차이 — wiki API 스펙)
EOF
)"
```
