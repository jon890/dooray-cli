# Phase 01 — post-tags.ts (mergeTagIds) + edit.ts 옵션 3개 + mandatory 검증 + interactive 경고 + 단위 테스트

## 컨텍스트

Issue #66: 생성된 업무에 태그를 사후 추가/교체/제거하는 자동화가 cli 로 불가. `dooray post edit --tag` 등 옵션 부재.

**결정** (사용자 옵션 B, 2026-05-18):
- `--tag` (반복, append+dedupe) / `--tag-clear` (기존 비우고 신규만) / `--tag-remove <name>` (반복, 특정 태그 제거)
- `--title` / `--body` **없이도** 단독 호출 허용 (자동화 친화). body 는 `post.body.content` 자동 재전송
- mandatory tag 검증 동일 적용 (ADR-019)
- interactive 모드 (`$EDITOR`) 진입 시 옵션 무시 + 경고 (cc-group 패턴 그대로)

코드 컨텍스트:
- `src/commands/post/edit.ts:90` — `const nonInteractive = title || opts.body || opts.bodyFile;`
- `src/commands/post/edit.ts:167-177` — `updatePost` 호출 (subject/body/priority/dueDate/users 만 — tagIds 미포함)
- `src/resolvers/tag.ts` — `resolveTags(client, projectId, names): string[]` + `validateMandatoryTags(client, projectId, tagIds): void`
- `src/resolvers/post-users.ts` — `mergeUsers(existing, additions, clear)` pure function 패턴 (테스트 가능 단위로 분리)
- `src/api/types.ts:211` — `PostDetail.tags: Tag[]`, `Tag.id: string`
- `src/api/types.ts:250` — `UpdatePostRequest.tagIds?: string[]`

## 변경 파일 (정확)

기대 결과 (총 4 파일):
```
src/resolvers/post-tags.ts                            (신규 — mergeTagIds pure)
src/resolvers/post-tags.test.ts                       (신규 — 4 케이스)
src/commands/post/edit.ts                             (수정 — 옵션 3개 + 흐름)
tasks/033-feat-post-edit-tag-options/index.json       (완료 마킹 phase-02 에서)
```

**planning docs (CLAUDE.md / docs/adr.md / docs/code-architecture.md) 는 task 생성 시점에 main 직접 commit 으로 선반영** — phase 안에서 추가 변경 금지.

## 작업 항목 (5개 이하)

### 1. `src/resolvers/post-tags.ts` — 신규 pure helper

```ts
/**
 * 기존 tagIds + 추가/제거/clear 입력을 머지해 최종 tagIds 산출 (pure).
 *
 * 적용 순서: clear → remove → add (중복 제거)
 *
 * @param existing 현재 post 의 tagIds (post.tags.map(t => t.id))
 * @param additions 추가할 tagIds (name → id 변환 후)
 * @param removals 제거할 tagIds
 * @param clear true 면 existing 무시
 */
export function mergeTagIds(
  existing: string[],
  additions: string[],
  removals: string[],
  clear: boolean,
): string[] {
  const base = clear ? [] : existing;
  const afterRemove = removals.length > 0
    ? base.filter((id) => !removals.includes(id))
    : base;
  if (additions.length === 0) return afterRemove;
  return Array.from(new Set([...afterRemove, ...additions]));
}
```

### 2. `src/resolvers/post-tags.test.ts` — 단위 테스트 (4 케이스)

```ts
import { describe, it, expect } from "vitest";
import { mergeTagIds } from "./post-tags.js";

describe("mergeTagIds", () => {
  it("append + dedupe (기존 [a,b] + 추가 [b,c] → [a,b,c])", () => {
    expect(mergeTagIds(["a", "b"], ["b", "c"], [], false)).toEqual(["a", "b", "c"]);
  });

  it("clear + add (기존 [a,b] clear + 추가 [c] → [c])", () => {
    expect(mergeTagIds(["a", "b"], ["c"], [], true)).toEqual(["c"]);
  });

  it("remove (기존 [a,b,c] - [b] → [a,c])", () => {
    expect(mergeTagIds(["a", "b", "c"], [], ["b"], false)).toEqual(["a", "c"]);
  });

  it("순서 clear → remove → add ([a,b] clear remove[a] add[c,d] → [c,d])", () => {
    expect(mergeTagIds(["a", "b"], ["c", "d"], ["a"], true)).toEqual(["c", "d"]);
  });
});
```

### 3. `src/commands/post/edit.ts` — 옵션 3개 + nonInteractive 트리거 확장

#### 3.1 옵션 정의 (line ~56 `--parent` 옆에 추가)

```ts
.option("--tag <name>", "태그 추가 (반복 가능, 기존 태그 유지 + 신규 추가 + dedupe)", (v, prev: string[]) => [...prev, v], [] as string[])
.option("--tag-clear", "기존 태그 전부 제거 후 --tag 만 적용")
.option("--tag-remove <name>", "특정 태그 제거 (반복 가능, 이름 부분일치)", (v, prev: string[]) => [...prev, v], [] as string[])
```

#### 3.2 action 안에서 처리

```ts
import { resolveTags, validateMandatoryTags } from "../../resolvers/tag.js";
import { mergeTagIds } from "../../resolvers/post-tags.js";

const tagAdditions = (opts.tag ?? []) as string[];
const tagRemovals = (opts.tagRemove ?? []) as string[];
const hasTagChange = tagAdditions.length > 0 || tagRemovals.length > 0 || !!opts.tagClear;
```

#### 3.3 nonInteractive 트리거 확장 (line 90)

```ts
// before
const nonInteractive = title || opts.body || opts.bodyFile;
// after
const nonInteractive = title || opts.body || opts.bodyFile || hasTagChange
  || toNames.length > 0 || toGroups.length > 0 || opts.toClear
  || ccNames.length > 0 || ccGroups.length > 0 || opts.ccClear
  || !!opts.parent;
```

(cc/to/parent 도 사실상 nonInteractive 진입 트리거이므로 같이 정리. 단 cc-group 단독 호출 허용은 별도 follow-up 이라 본 PR scope 에는 추가만 — 동작 자체는 hasTagChange 만 신규 흐름)

**주의**: cc/to 단독 호출 동작은 본 task scope 외. trigger 확장은 하되 (안 하면 hasTagChange 외 단독 호출도 의도와 다르게 nonInteractive 진입), cc/to 단독 호출의 실제 적용 흐름은 별도 검증 후 follow-up. 만약 scope 충돌 우려가 있으면 trigger 도 `|| hasTagChange` 만 추가하고 cc/to 는 그대로 둘 것 (executor 가 코드 읽고 판단).

#### 3.4 tagIds 계산 + mandatory 검증 (nonInteractive 분기 안에서)

`updatePost` 호출 직전:

```ts
let finalTagIds: string[] | undefined;
if (hasTagChange) {
  const existingTagIds = post.tags.map((t) => t.id);
  const additionIds = tagAdditions.length > 0
    ? await resolveTags(client, projectId, tagAdditions)
    : [];
  const removalIds = tagRemovals.length > 0
    ? await resolveTags(client, projectId, tagRemovals)
    : [];
  finalTagIds = mergeTagIds(existingTagIds, additionIds, removalIds, !!opts.tagClear);
  await validateMandatoryTags(client, projectId, finalTagIds);
}
```

#### 3.5 updatePost body 에 tagIds 반영

```ts
await client.updatePost(projectId, postId, {
  subject: title ?? post.subject,
  body: { mimeType: "text/x-markdown", content: newBody ?? post.body.content },
  priority: post.priority,
  dueDate: post.dueDate,
  dueDateFlag: post.dueDateFlag,
  users: { to: toUsers, cc: ccUsers },
  ...(finalTagIds !== undefined && { tagIds: finalTagIds }),
});
```

### 4. interactive 모드 경고 + dry-run JSON 확장

interactive 진입 분기 안 (cc-group 경고 옆):

```ts
if (hasTagChange) {
  process.stderr.write(
    "⚠  --tag / --tag-clear / --tag-remove 는 --title/--body 와 함께 사용 시에만 적용됩니다.\n",
  );
}
```

dry-run JSON (line 154-159 옆):

```ts
process.stdout.write(JSON.stringify({
  body: previewBody,
  users: { to: toUsers, cc: ccUsers },
  ...(finalTagIds !== undefined && { tagIds: finalTagIds }),
  ...(opts.parent && { parentChange: opts.parent }),
}) + "\n");
```

### 5. 동작 실증 (사용자 환경 1회)

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm build

# 1) --tag 단독 호출 (기존 태그 유지 + 신규 추가, body 자동 재전송)
node dist/index.js post edit --id <postId> --tag "<group>: <name>"

# 2) --tag-clear + --tag (전체 교체)
node dist/index.js post edit --id <postId> --tag-clear --tag "<group>: <name>"

# 3) --tag-remove (특정 태그 제거)
node dist/index.js post edit --id <postId> --tag-remove "<group>: <name>"

# 4) dry-run JSON
node dist/index.js post edit --id <postId> --tag "<g>: <n>" --dry-run --json
# 기대: { body, users, tagIds: [...] } 출력 + API 미호출

# 5) interactive 모드 (--tag 만 있어도 단독 nonInteractive 진입 — 경고 없음. 반대로 $EDITOR 강제 분기에 --tag 주면 경고)
```

executor 메모: post 가 mandatory tag 그룹 정책을 가진 프로젝트면 --tag-clear 가 mandatory 위반 → `validateMandatoryTags` 가 친절한 에러 (ADR-019). 그 흐름도 1회 실증.

## code-review-pitfalls 회피 항목

- **1-1 (validation 전 spinner)**: post 조회 spinner 는 기존 흐름. `resolveTags` / `validateMandatoryTags` 는 spinner 안에서 호출 — 기존 cc 흐름과 동일 패턴
- **1-2 (spinner leak)**: try/catch 가 이미 있음 — 신규 코드는 그 안에서만
- **2-2 (catch 분기)**: `validateMandatoryTags` 가 throw 하면 그대로 상위 catch 로 전파 — 별도 처리 없음
- **3-3 (테스트 mock mirror)**: `mergeTagIds` pure function — mock 불요
- **외과적 변경**: cc/to 단독 호출 동작은 본 task 에서 변경 금지 (trigger 확장만, 흐름 그대로)

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. tsc + build + test
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
# 기대: 0
pnpm build && pnpm test
# 기대: exit 0 + post-tags.test.ts 4 케이스 통과

# 2. 신규 helper
ls src/resolvers/post-tags.ts src/resolvers/post-tags.test.ts

# 3. 옵션 등록
grep -cE '^\s*\.option\("--tag(-clear|-remove)?\s' src/commands/post/edit.ts
# 기대: 3

# 4. mergeTagIds 호출
grep -nE "mergeTagIds\(" src/commands/post/edit.ts
# 기대: 1줄

# 5. mandatory 검증 호출
grep -nE "validateMandatoryTags\(" src/commands/post/edit.ts
# 기대: 1줄

# 6. CLI help 노출
node dist/index.js post edit --help 2>&1 | grep -cE "\-\-tag"
# 기대: 3 이상
```

## 작업 외 금지

- README / SKILL.md 갱신 금지 — phase-02
- cc/to 단독 호출 동작 변경 금지 — trigger 확장은 hasTagChange 만 (cc/to 추가는 follow-up issue)
- planning docs 변경 금지 — task 생성 시점 commit 으로 반영됨
- 신규 ADR 작성 금지 — ADR-019 한 줄 확장만
- post create 의 tag 흐름 변경 금지 — 본 task scope 는 edit 한정

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/033-post-edit-tag-options (main 에서 분기)
git add src/resolvers/post-tags.ts src/resolvers/post-tags.test.ts \
        src/commands/post/edit.ts
git commit -m "$(cat <<'EOF'
feat(commands): add --tag / --tag-clear / --tag-remove to post edit (Issue #66 phase 1/2)

- post-tags.ts: mergeTagIds pure helper (clear → remove → add → dedupe)
- post edit.ts: 옵션 3개 + nonInteractive trigger 에 hasTagChange + validateMandatoryTags
- post-tags.test.ts: 4 케이스 (append+dedupe / clear+add / remove / 복합)
- --title/--body 없이 단독 호출 허용 (body 자동 재전송, ADR-019)
- interactive 경고 + dry-run JSON 에 tagIds 노출
EOF
)"
```
