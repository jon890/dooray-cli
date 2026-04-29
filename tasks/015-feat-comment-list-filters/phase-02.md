# Phase 2: comment list 옵션 + filter 로직 + comment latest 명령

## 컨텍스트

Phase 1의 `order` API 위에 사용자 옵션 추가 + client-side filter (`--since` page-level break, `--from-author`).

### 먼저 읽을 파일

- `src/commands/post/comment/list.ts` — 011/012 적용 후 형태 (resolvePostInput + buildMemberNameMap + enrichCommentCreators 호출)
- `src/resolvers/member.ts` — `resolveMember`(name → memberId) 시그니처
- `src/resolvers/post-input.ts` (011) — `resolvePostInput` 시그니처
- `src/api/client.ts` `getPostComments`/`GetPostCommentsParams` (phase 1 산출)
- `src/utils/errors.ts` `DoorayCliError`, `src/utils/exit-codes.ts` `EXIT_PARAM_ERROR`

## 작업 목록 (4개)

### 1) `src/commands/post/comment/list.ts` — 옵션 5개 추가

기존 `--page`/`--size` 옆에 추가:
```ts
.option("--sort <order>", "정렬 (asc/desc), 기본 asc", "asc")
.option("--reverse", "--sort desc 의 alias")
.option("--latest <n>", "최신 N개 (--sort desc + size=N + page=0 단축)")
.option("--since <iso>", "이 시간 이후 댓글만 (ISO 8601 또는 YYYY-MM-DD)")
.option("--from-author <name>", "작성자 이름으로 필터 (부분일치)")
```

### 2) action 핸들러 — 옵션 검증 + fetch 전략 분기

흐름:

```ts
.action(async (project, postNumberStr, opts) => {
  const globalOpts = ...;
  // ... config/client/resolvePostInput 기존과 동일

  // (a) 상호배타 검증
  validateExclusive(opts);

  // (b) order 결정
  const order = resolveOrder(opts);  // "-createdAt" | "createdAt"

  // (c) fetch 전략 (3가지)
  let comments: PostComment[];
  if (opts.latest) {
    // --latest: 1페이지만, size=N
    const n = Number(opts.latest);
    if (!Number.isFinite(n) || n <= 0) {
      throw new DoorayCliError("--latest는 양의 정수여야 합니다.", EXIT_PARAM_ERROR);
    }
    const res = await client.getPostComments(projectId, postId, {
      page: 0, size: Math.min(n, 100), order: "-createdAt",
    });
    comments = res.result.slice(0, n);
  } else if (opts.since) {
    // --since: desc로 페이지 단위 fetch + page-level break
    comments = await fetchSince(client, projectId, postId, opts.since);
    // 출력 순서는 사용자 의도(--sort) 따름 — 기본은 asc
    if (order === "createdAt") comments = [...comments].reverse();
  } else {
    // 일반: 단일 페이지 (기존 동작 유지) + order 적용
    const res = await client.getPostComments(projectId, postId, {
      page: Number(opts.page ?? 0),
      size: Number(opts.size ?? 20),
      order,
    });
    comments = res.result;
  }

  // (d) --from-author client-side filter
  if (opts.fromAuthor) {
    const memberId = await resolveMember(client, projectId, opts.fromAuthor);
    comments = comments.filter((c) => c.creator?.member?.organizationMemberId === memberId);
  }

  // (e) 기존 enrich (012)
  if (!globalOpts.json) {
    let nameMap = new Map<string, string>();
    try { nameMap = await buildMemberNameMap(client, projectId); } catch {}
    comments = enrichCommentCreators(comments, nameMap);
  }
  formatCommentList(comments, globalOpts);
});
```

**`validateExclusive(opts)`** 헬퍼 (같은 파일 내 또는 utils):
```ts
function validateExclusive(opts: any): void {
  // --latest 우선 — page/size/sort 무시 대신 명시 에러
  if (opts.latest) {
    if (opts.page && opts.page !== "0") throw err("--latest와 --page는 동시 사용 불가");
    if (opts.size && opts.size !== "20") throw err("--latest와 --size는 동시 사용 불가");
    if (opts.sort && opts.sort !== "asc") throw err("--latest와 --sort는 동시 사용 불가");
    if (opts.reverse) throw err("--latest와 --reverse는 동시 사용 불가");
    if (opts.since) throw err("--latest와 --since는 동시 사용 불가");
  }
  // --reverse + --sort 모순
  if (opts.reverse && opts.sort && opts.sort !== "asc") {
    throw err("--reverse와 --sort 옵션은 동시 사용 불가");
  }
  // --sort 값 검증
  if (opts.sort && opts.sort !== "asc" && opts.sort !== "desc") {
    throw err(`--sort는 asc 또는 desc만 허용합니다: "${opts.sort}"`);
  }
  function err(msg: string): DoorayCliError {
    return new DoorayCliError(msg, EXIT_PARAM_ERROR);
  }
}

function resolveOrder(opts: any): "createdAt" | "-createdAt" {
  if (opts.reverse) return "-createdAt";
  if (opts.sort === "desc") return "-createdAt";
  return "createdAt";
}
```

> **`opts.page`/`opts.size` default 비교**: commander의 default value(`"0"`/`"20"`)와 비교해야 사용자 명시 입력만 잡아냄. default 그대로 통과는 OK.

**`fetchSince(client, projectId, postId, sinceStr)`** 헬퍼 (`src/commands/post/comment/list.ts` 내부 또는 별도 utility):
```ts
async function fetchSince(
  client: DoorayApiClient,
  projectId: string,
  postId: string,
  sinceStr: string,
): Promise<PostComment[]> {
  const sinceDate = new Date(sinceStr);
  if (isNaN(sinceDate.getTime())) {
    throw new DoorayCliError(
      `--since 값을 파싱할 수 없습니다: "${sinceStr}" (ISO 8601 또는 YYYY-MM-DD)`,
      EXIT_PARAM_ERROR,
    );
  }
  const sinceMs = sinceDate.getTime();
  const collected: PostComment[] = [];
  let page = 0;
  const size = 100;
  while (true) {
    const res = await client.getPostComments(projectId, postId, {
      page, size, order: "-createdAt",
    });
    const pageItems = res.result;
    // 페이지 단위 필터: since 이상만 통과
    const survivors = pageItems.filter((c) => new Date(c.createdAt).getTime() >= sinceMs);
    collected.push(...survivors);
    // 페이지 끝까지 받은 후, 페이지에 since 미만 댓글이 하나라도 있으면 break
    // (= 그 페이지가 since 경계 페이지) — 안전 마진: 다음 페이지로 안 넘어감
    const hasOlder = pageItems.length > survivors.length;
    if (hasOlder) break;
    if (pageItems.length < size) break; // 마지막 페이지
    page++;
  }
  return collected;
}
```

> 정렬 보장: Dooray가 페이지 내 createdAt desc 보장한다고 가정. 같은 millisecond 동시 등록 댓글은 다음 페이지로 넘어가지 않으므로 안전 마진. 시나리오 검증은 phase 3.

### 3) `src/commands/post/comment/latest.ts` 신규

```ts
import { Command } from "commander";
import { getConfigOrThrow } from "../../../config/store.js";
import { DoorayApiClient } from "../../../api/client.js";
import { resolvePostInput } from "../../../resolvers/post-input.js";
import { buildMemberNameMap } from "../../../resolvers/member.js";
import { enrichCommentCreators } from "../../../utils/comment-enrich.js";
import { formatCommentList } from "../../../formatters/post.js";
import type { OutputOptions } from "../../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../../utils/spinner.js";

export const commentLatestCommand = new Command("latest")
  .description("최신 댓글 1개 조회 (= comment list --latest 1)")
  .argument("[project]", "프로젝트 코드 (또는 첫 인자에 Dooray URL)")
  .argument("[post-number]", "업무 번호 (project와 함께 사용)")
  .option("--id <postId>", "Dooray post ID (project/post-number 대신)")
  .option("--url <url>", "Dooray 업무 URL (project/post-number 대신)")
  .option("-n, --count <n>", "최신 N개 (기본 1)", "1")
  .action(async (project, postNumberStr, opts) => {
    const globalOpts = commentLatestCommand.optsWithGlobals() as OutputOptions;
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    startSpinner("최신 댓글 조회 중...");
    const { projectId, postId } = await resolvePostInput(client, {
      projectArg: project, postNumberArg: postNumberStr,
      idOpt: opts.id, urlOpt: opts.url,
    });
    const n = Math.max(1, Number(opts.count) || 1);
    const res = await client.getPostComments(projectId, postId, {
      page: 0, size: Math.min(n, 100), order: "-createdAt",
    });
    stopSpinner(true, "조회 완료");

    let comments = res.result.slice(0, n);
    if (!globalOpts.json) {
      let nameMap = new Map<string, string>();
      try { nameMap = await buildMemberNameMap(client, projectId); } catch {}
      comments = enrichCommentCreators(comments, nameMap);
    }
    formatCommentList(comments, globalOpts);
  });
```

### 4) `src/index.ts` — `commentLatestCommand` 등록

기존 commentCommand 등록 부분에 추가:
```ts
import { commentLatestCommand } from "./commands/post/comment/latest.js";
// ...
commentCommand.addCommand(commentLatestCommand);
```

`commentListCommand` 등록 다음 줄에 자연스럽게.

## 성공 기준

- [ ] `pnpm run build` 성공
- [ ] `pnpm test` 통과
- [ ] `node dist/index.js post comment list --help` → 5개 신규 옵션 노출 (`--sort`, `--reverse`, `--latest`, `--since`, `--from-author`)
- [ ] `node dist/index.js post comment latest --help` → 정상 (`-n/--count` 옵션)
- [ ] `grep -c "validateExclusive\|fetchSince\|resolveOrder" src/commands/post/comment/list.ts` → 3 이상
- [ ] `grep -c "commentLatestCommand" src/index.ts` → 2 이상 (import + addCommand)
- [ ] `grep -c "from-author\|fromAuthor" src/commands/post/comment/list.ts` → 1 이상

## 주의사항

- **`--latest`와 다른 옵션 상호배타**: commander default value를 사용자 명시 입력과 구분 — `opts.page === "0"`은 default. 사용자 명시는 다른 값일 때만 충돌 처리
- **`--since` 페이지 단위 break**: 페이지 내부 필터 후 경계 페이지에서 break (`hasOlder`). 다음 페이지로 안 넘어감 (걸림돌 #1 완화)
- **`--from-author`는 fetch 후 client-side filter**: `comments` 배열 직접 변형. resolveMember 모호 매칭 에러는 그대로 throw
- **011/012 흐름 보존**: `resolvePostInput` → fetch → enrich → format. 본 phase는 fetch 단계만 분기 추가
- **`comment latest`는 단순 명령** — `--latest` 옵션과 중복이지만 보너스 (이슈 본문 명시). agent 친화 단축 명령
- **`--page`/`--size`는 기존 그대로 유지** (단일 페이지 호출 용도). `--latest`/`--since`와는 상호배타

## Blocked 조건

- phase 1의 `order` 파라미터 부재 → `PHASE_BLOCKED: phase 1 미완료`
- `resolvePostInput`/`buildMemberNameMap` 시그니처 변경 → `PHASE_BLOCKED: 의존 헬퍼 시그니처 변경`
