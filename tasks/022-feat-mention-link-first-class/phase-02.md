# Phase 02 — `--link-task <project>/<number>` 옵션 + buildTaskLink util

## 컨텍스트

Issue #33 — 본문에 다른 업무 링크를 markdown 으로 자동 삽입. `dooray://{orgId}/tasks/{postId}` 포맷 + 호버 title (워크플로우 카테고리, 모를 때는 생략 가능).

이슈 본문의 실측 패턴:
```
[projectCode/{number} &#91;제목&#93;](dooray://{orgId}/tasks/{postId} "backlog")
```

링크 텍스트 안에서 `[` → `&#91;`, `]` → `&#93;`, `—` → `&mdash;` 이스케이프 필요.

본 phase 는 4 명령 모두 (`post create`, `post edit`, `post comment add`, `post comment edit`) 에 `--link-task <project>/<number>` 옵션 추가. 반복 가능. body 끝에 줄바꿈 후 append.

코드 현황:
- `src/utils/mention.ts` — `buildMemberMention`, `buildGroupMention`, `prependMentions` (mention 패턴 참조)
- `src/resolvers/post-input.ts` — postId 해소 헬퍼
- `src/api/client.ts:getPost` — 제목 / 워크플로우 메타 fetch

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- src/utils/task-link.ts src/utils/task-link.test.ts src/commands/post/
```

기대 결과 (총 6 파일):
```
src/commands/post/comment/add.ts
src/commands/post/comment/edit.ts
src/commands/post/create.ts
src/commands/post/edit.ts
src/utils/task-link.ts                (신규)
src/utils/task-link.test.ts           (신규)
```

## 작업 항목

### 1. `src/utils/task-link.ts` — buildTaskLink + escape helper

```ts
import type { CachedMe } from "../cache/types.js";

// markdown link 텍스트 안의 특수문자 escape
export function escapeLinkText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/\[/g, "&#91;")
    .replace(/\]/g, "&#93;")
    .replace(/—/g, "&mdash;");
}

export interface TaskLinkInput {
  projectCode: string;
  number: number;
  postId: string;
  subject: string;
  workflowClass?: string; // 호버 title 용 (옵션)
}

export function buildTaskLink(t: TaskLinkInput, me: CachedMe): string {
  const text = `${t.projectCode}/${t.number} ${escapeLinkText(t.subject)}`;
  const url = `dooray://${me.orgId}/tasks/${t.postId}`;
  if (t.workflowClass) {
    return `[${text}](${url} "${t.workflowClass}")`;
  }
  return `[${text}](${url})`;
}

// body 끝에 task link 들을 줄바꿈 후 append. 본문이 비어있어도 형식 유지.
export function appendTaskLinks(body: string, links: TaskLinkInput[], me: CachedMe): string {
  if (links.length === 0) return body;
  const rendered = links.map((l) => buildTaskLink(l, me)).join("\n");
  if (!body) return rendered;
  return body.replace(/\n*$/, "") + "\n\n" + rendered;
}
```

### 2. `src/utils/task-link.test.ts` — 단위 테스트 (총 6 케이스)

```ts
import { describe, it, expect } from "vitest";
import { escapeLinkText, buildTaskLink, appendTaskLinks } from "./task-link.js";
import type { CachedMe } from "../cache/types.js";

const ME: CachedMe = { id: "user-1", orgId: "1234567890123456789", name: "tester", email: "user@example.com" };

describe("escapeLinkText", () => {
  it("[ ] — & 이스케이프", () => {
    expect(escapeLinkText("a [b] — c & d")).toBe("a &#91;b&#93; &mdash; c &amp; d");
  });
  it("이스케이프 대상 없으면 그대로", () => {
    expect(escapeLinkText("plain text")).toBe("plain text");
  });
});

describe("buildTaskLink", () => {
  it("workflowClass 있으면 호버 title 포함", () => {
    expect(buildTaskLink({
      projectCode: "demo", number: 42, postId: "9876543210987654321",
      subject: "feat: foo", workflowClass: "backlog",
    }, ME)).toBe('[demo/42 feat: foo](dooray://1234567890123456789/tasks/9876543210987654321 "backlog")');
  });
  it("workflowClass 없으면 title 생략", () => {
    expect(buildTaskLink({
      projectCode: "demo", number: 42, postId: "9876543210987654321",
      subject: "fix: bar",
    }, ME)).toBe('[demo/42 fix: bar](dooray://1234567890123456789/tasks/9876543210987654321)');
  });
});

describe("appendTaskLinks", () => {
  it("links 가 비어있으면 body 그대로", () => {
    expect(appendTaskLinks("hello", [], ME)).toBe("hello");
  });
  it("body 끝에 빈 줄 1개 + 링크 줄바꿈 append", () => {
    const out = appendTaskLinks("hello", [{
      projectCode: "demo", number: 1, postId: "9876543210987654321", subject: "x",
    }], ME);
    expect(out).toBe("hello\n\n[demo/1 x](dooray://1234567890123456789/tasks/9876543210987654321)");
  });
});
```

### 3. 4 명령에 `--link-task` 옵션 추가

각 명령에 동일 옵션 정의:

```ts
.option("--link-task <ref>", "다른 업무 링크 추가 (<project>/<number> 또는 postId, 반복 가능)",
  (v, prev: string[]) => [...prev, v], [] as string[])
```

action 흐름:

```ts
import { appendTaskLinks, type TaskLinkInput } from "../../utils/task-link.js";
import { ensureMe } from "../../resolvers/me.js";
import { resolvePostInput } from "../../resolvers/post-input.js";

// ...
const linkInputs: string[] = (opts.linkTask ?? []).filter((s: string) => s.length > 0);
if (linkInputs.length > 0) {
  const me = await ensureMe(client);
  const links: TaskLinkInput[] = await Promise.all(
    linkInputs.map(async (ref) => {
      // <project>/<number> 또는 19자리 postId
      let projectArg: string | undefined;
      let postNumberArg: string | undefined;
      let idOpt: string | undefined;
      if (/^[0-9]{15,}$/.test(ref)) {
        idOpt = ref;
      } else if (ref.includes("/")) {
        const [p, n] = ref.split("/");
        projectArg = p;
        postNumberArg = n;
      }
      const { projectId: pid, postId: pidPost, projectCode, postNumber } =
        await resolvePostInput(client, { projectArg, postNumberArg, idOpt });
      const detail = await client.getPost(pid, pidPost);
      return {
        projectCode,
        number: postNumber ?? detail.result.number,
        postId: pidPost,
        subject: detail.result.subject,
        workflowClass: detail.result.workflowClass,
      };
    }),
  );
  bodyContent = appendTaskLinks(bodyContent, links, me);
}
```

**중요**:
- `--link-task` 와 `--mention` 동시 사용 시 처리 순서: mention prepend → linkTask append. 즉 `prependMentions(bodyContent, ...)` 결과에 다시 `appendTaskLinks(...)` 적용.
- linkTask resolution 은 별도 API 호출 필요 (`getPost` 로 subject + workflowClass 획득). resolveTags 와 병렬화 권장 (Promise.all).

### 4. resolvePostInput 시그니처 확인

`projectCode` / `postNumber` 가 반환에 포함되는지 확인:

```bash
# cwd: /Users/nhn/personal/dooray-cli
grep -nE "projectCode|postNumber" src/resolvers/post-input.ts | head -10
```

없으면 phase-02 에서 함께 추가 (반환 타입 확장). 있으면 그대로 사용.

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. 빌드 + 테스트 통과
pnpm build && pnpm test
# 기대: exit 0

# 2. util + tests 추가
grep -nE "export function (escapeLinkText|buildTaskLink|appendTaskLinks)" src/utils/task-link.ts
# 기대: 3줄
grep -cE "^\s*it\(" src/utils/task-link.test.ts
# 기대: 6

# 3. 4 명령에 --link-task 옵션
grep -lE "link-task|linkTask" src/commands/post/create.ts src/commands/post/edit.ts src/commands/post/comment/add.ts src/commands/post/comment/edit.ts | wc -l | tr -d ' '
# 기대: 4

# 4. appendTaskLinks 호출 4 명령
grep -cE "appendTaskLinks" src/commands/post/create.ts src/commands/post/edit.ts src/commands/post/comment/add.ts src/commands/post/comment/edit.ts
# 기대: 각 1 이상
```

## 작업 외 금지

- placeholder 치환 (`{{group:...}}`) 추가 금지 (이슈 옵션 3 — 별도 enhancement)
- wiki link 추가 금지
- task-link 캐시 도입 금지 (매 호출 fetch — 호출 빈도 낮음)
- mention 흐름 변경 금지 (phase-01 그대로)
- ADR 추가 금지

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/022-feat-mention-link-first-class
git add src/utils/task-link.ts src/utils/task-link.test.ts src/commands/post/create.ts src/commands/post/edit.ts src/commands/post/comment/add.ts src/commands/post/comment/edit.ts
git commit -m "feat(commands): add --link-task option for inline task references

Issue #33: build dooray:// task link markdown from <project>/<number>
or postId. New task-link util (escape + build + append). Applied to
post create/edit + post comment add/edit. Mention prepend then link
append; resolution via existing resolvePostInput + getPost."
```
