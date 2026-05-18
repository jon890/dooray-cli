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

기대 결과 (총 6 파일):
```
src/resolvers/post-tags.ts                            (신규 — mergeTagIds pure)
src/resolvers/post-tags.test.ts                       (신규 — 4 케이스)
src/resolvers/tag.ts                                  (수정 — lookupTagIds + validateMandatoryCoverage 신규 export)
src/resolvers/tag.test.ts                             (신규 또는 추가 — 2 케이스: lookupTagIds + validateMandatoryCoverage)
src/commands/post/edit.ts                             (수정 — 옵션 3개 + 흐름)
tasks/033-feat-post-edit-tag-options/index.json       (완료 마킹 phase-02 에서)
```

**planning docs (CLAUDE.md / docs/adr.md / docs/code-architecture.md) 는 task 생성 시점에 main 직접 commit 으로 선반영** — phase 안에서 추가 변경 금지.

## 작업 항목 (5개 이하)

### 1. `src/resolvers/post-tags.ts` + `post-tags.test.ts` — pure helper + 단위 테스트 4 케이스

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

단위 테스트 (`post-tags.test.ts`):

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

### 2. `src/resolvers/tag.ts` — 신규 helper 2개 + 단위 테스트

**critic CRITICAL 1+2 fix (사용자 결정)**: 기존 `validateMandatoryTags` (2인자, post create 의 사전 검증 전용) 와 `resolveTags` (mandatory 검증 포함) 는 **그대로 유지**. 본 task 에서 신규 helper 2개 추가.

```ts
/**
 * 입력된 이름들을 tagIds 로 변환만 (mandatory 검증 skip).
 * `--tag-remove` / `--tag-clear` 같이 머지 전 단계의 name lookup 에 사용.
 * `resolveTags` 와 달리 mandatory 그룹 충족 검사 안 함.
 */
export async function lookupTagIds(
  client: DoorayApiClient,
  projectId: string,
  names: string[],
): Promise<string[]> {
  if (names.length === 0) return [];
  const tags = await ensureTags(client, projectId);
  return names.map((n) =>
    matchByName(tags, n, "태그", (t) => `${t.name} (${t.id})`).id
  );
}

/**
 * 머지된 최종 tagIds 가 프로젝트의 mandatory 그룹을 모두 커버하는지 검증.
 * `--tag` 류 옵션 적용 후 최종 결과 검사용.
 * `validateMandatoryTags` 가 "tag 입력 없이 mandatory 그룹 있으면 throw" 인 반면,
 * 이 함수는 selectedTagIds 가 모든 mandatory 그룹의 ID 중 하나씩을 포함하는지 검사.
 */
export async function validateMandatoryCoverage(
  client: DoorayApiClient,
  projectId: string,
  selectedTagIds: string[],
): Promise<void> {
  const tags = await ensureTags(client, projectId);
  const selectedSet = new Set(selectedTagIds);
  const mandatoryGroups = new Map<string, { groupName: string; tagsInGroup: CachedTag[] }>();
  for (const t of tags) {
    if (t.groupMandatory && t.groupId) {
      if (!mandatoryGroups.has(t.groupId)) {
        mandatoryGroups.set(t.groupId, { groupName: t.groupName ?? t.groupId, tagsInGroup: [] });
      }
      mandatoryGroups.get(t.groupId)!.tagsInGroup.push(t);
    }
  }
  for (const [, info] of mandatoryGroups) {
    const covered = info.tagsInGroup.some((t) => selectedSet.has(t.id));
    if (!covered) {
      const candidates = info.tagsInGroup.map((t) => `${t.name} (${t.id})`).join(", ");
      throw new DoorayCliError(
        `필수 태그 그룹 "${info.groupName}" 에서 최소 1개 선택 필요\n후보: ${candidates}`,
        EXIT_PARAM_ERROR,
      );
    }
  }
}
```

**테스트** (`src/resolvers/tag.test.ts` 신규 또는 기존 파일 추가) — 2 케이스 최소:
- `lookupTagIds`: 이름 배열 → id 배열 변환 (mandatory throw 안 함을 확인)
- `validateMandatoryCoverage`: mandatory 그룹 미충족 시 throw / 충족 시 통과

### 3. `src/commands/post/edit.ts` — 옵션 3개 + nonInteractive 트리거 확장 + 흐름

#### 3.1 옵션 정의 (line ~56 `--parent` 옆에 추가)

```ts
.option("--tag <name>", "태그 추가 (반복 가능, 기존 태그 유지 + 신규 추가 + dedupe)", (v, prev: string[]) => [...prev, v], [] as string[])
.option("--tag-clear", "기존 태그 전부 제거 후 --tag 만 적용")
.option("--tag-remove <name>", "특정 태그 제거 (반복 가능, 이름 부분일치)", (v, prev: string[]) => [...prev, v], [] as string[])
```

#### 3.2 nonInteractive 트리거 확장 (line 90) — **`|| hasTagChange` 만 추가**

```ts
import { lookupTagIds, validateMandatoryCoverage } from "../../resolvers/tag.js";
import { mergeTagIds } from "../../resolvers/post-tags.js";

const tagAdditions = (opts.tag ?? []) as string[];
const tagRemovals = (opts.tagRemove ?? []) as string[];
const hasTagChange = tagAdditions.length > 0 || tagRemovals.length > 0 || !!opts.tagClear;

// before
const nonInteractive = title || opts.body || opts.bodyFile;
// after — hasTagChange 만 추가. cc/to/parent 동작은 본 task scope 외 (별도 follow-up issue)
const nonInteractive = title || opts.body || opts.bodyFile || hasTagChange;
```

**critic MAJOR 1 fix**: cc/to/parent trigger 확장은 본 task scope 외. 별도 follow-up issue 로 분리. 본 PR 은 tag 동작만 추가.

#### 3.3 tagIds 계산 + mandatory 커버리지 검증 (nonInteractive 분기 안에서)

`updatePost` 호출 직전. **신규 helper 2개 사용** (critic CRITICAL 1+2 fix):

```ts
let finalTagIds: string[] | undefined;
if (hasTagChange) {
  const existingTagIds = post.tags.map((t) => t.id);
  // tagAdditions 는 mandatory 검증 안 거치고 단순 name → id 변환 (lookupTagIds)
  // 머지 결과 (finalTagIds) 가 mandatory 그룹 커버하는지는 validateMandatoryCoverage 가 검사
  const additionIds = await lookupTagIds(client, projectId, tagAdditions);
  const removalIds = await lookupTagIds(client, projectId, tagRemovals);
  finalTagIds = mergeTagIds(existingTagIds, additionIds, removalIds, !!opts.tagClear);
  await validateMandatoryCoverage(client, projectId, finalTagIds);
}
```

#### 3.4 updatePost body 에 tagIds 반영 + body 자동 재전송 안전

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

**critic MAJOR 2 fix**: `--tag` 단독 호출 시 `newBody = null` → `post.body.content` 자동 재전송. 이때 `checkAndGuardDropped` (line 96-99) 는 `newBody != null` 조건이라 skip — 의도된 동작. 재전송 (server 가 보낸 그대로 다시 전송) 은 attachment 보존이라 drop 발생 안 함. executor 가 "newBody null 가드 추가" 식으로 오변경 금지.

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

# 5. mandatory 커버리지 검증 호출 (신규 helper)
grep -nE "validateMandatoryCoverage\(" src/commands/post/edit.ts
# 기대: 1줄
grep -nE "^export async function (lookupTagIds|validateMandatoryCoverage)\b" src/resolvers/tag.ts
# 기대: 2줄

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
        src/resolvers/tag.ts src/resolvers/tag.test.ts \
        src/commands/post/edit.ts
git commit -m "$(cat <<'EOF'
feat(commands): add --tag / --tag-clear / --tag-remove to post edit (Issue #66 phase 1/2)

- post-tags.ts: mergeTagIds pure helper (clear → remove → add → dedupe)
- tag.ts: lookupTagIds (mandatory skip — name→id 변환 전용) +
  validateMandatoryCoverage (머지 결과 커버리지 검사) 신규 helper
- post edit.ts: 옵션 3개 + nonInteractive trigger 에 hasTagChange (cc/to/parent
  는 별도 follow-up) + lookupTagIds + mergeTagIds + validateMandatoryCoverage
- 단위 테스트: post-tags 4 케이스 + tag 2 케이스 (lookup + coverage)
- --title/--body 없이 단독 호출 허용 (body 자동 재전송, ADR-019 확장)
- interactive 경고 + dry-run JSON 에 tagIds 노출
EOF
)"
```
