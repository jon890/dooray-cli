# Phase 02 — post edit (6 옵션) + post create (2 옵션) 통합 + API 실증

## 컨텍스트

phase-01 의 `parseUserSpec` / `mergeUsers` / `resolveUserAdditions` 를 사용해 두 명령에 옵션 통합. ADR-025 의 결정 (full payload PUT + append/clear/dedupe + interactive 무시) 그대로 구현.

코드 현황:
- `src/commands/post/edit.ts:35-50` — postEditCommand 옵션 정의 위치. mention/link-task 패턴 답습
- `src/commands/post/edit.ts:128-151` — non-interactive 모드의 `client.updatePost` payload 합성 (users: { to: toUsers, cc: ccUsers })
- `src/commands/post/edit.ts:155-159` — interactive 모드 mention 경고 패턴 (그대로 답습)
- `src/commands/post/create.ts:43` — `--cc <members...>` variadic 옵션 (멤버만)
- `src/commands/post/create.ts:130-131,150` — `resolveUsers` → `client.createPost` payload

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- src/commands/post/edit.ts src/commands/post/create.ts
```

기대 결과 (총 2 파일):
```
src/commands/post/create.ts
src/commands/post/edit.ts
```

## 작업 항목

### 1. `src/commands/post/edit.ts` — 6 옵션 + 통합

옵션 정의 (line 47 의 `--link-task` 옆에 추가):

```ts
.option("--cc <name>", "참조자(cc) 멤버 추가 (반복 가능, 이름 부분일치)",
  (v, prev: string[]) => [...prev, v], [] as string[])
.option("--cc-group <code>", "참조자(cc) 그룹 추가 (반복 가능, 그룹 코드 부분일치)",
  (v, prev: string[]) => [...prev, v], [] as string[])
.option("--cc-clear", "기존 참조자 전부 제거 후 신규만 적용 (--cc/--cc-group 와 조합 가능)")
.option("--to <name>", "담당자(to) 멤버 추가 (반복 가능, 이름 부분일치)",
  (v, prev: string[]) => [...prev, v], [] as string[])
.option("--to-group <code>", "담당자(to) 그룹 추가 (반복 가능, 그룹 코드 부분일치)",
  (v, prev: string[]) => [...prev, v], [] as string[])
.option("--to-clear", "기존 담당자 전부 제거 후 신규만 적용")
```

action 안에서 (non-interactive 분기 line 127-151 갱신):

```ts
import { resolveUserAdditions, mergeUsers } from "../../resolvers/post-users.js";

// non-interactive 진입 후 mention/link-task 처리 이후, updatePost 호출 직전:
const ccNames: string[] = (opts.cc ?? []).filter((s: string) => s.length > 0);
const ccGroups: string[] = (opts.ccGroup ?? []).filter((s: string) => s.length > 0);
const toNames: string[] = (opts.to ?? []).filter((s: string) => s.length > 0);
const toGroups: string[] = (opts.toGroup ?? []).filter((s: string) => s.length > 0);

let toUsers: CreatePostUser[] = post.users.to.map((u) => ({
  type: u.type,
  member: u.member,
  emailUser: u.emailUser,
  group: u.group,
}));
let ccUsers: CreatePostUser[] = post.users.cc.map((u) => ({
  type: u.type,
  member: u.member,
  emailUser: u.emailUser,
  group: u.group,
}));

if (toNames.length > 0 || toGroups.length > 0 || opts.toClear) {
  const additions = await resolveUserAdditions(client, projectId, toNames, toGroups);
  toUsers = mergeUsers(toUsers, additions, !!opts.toClear);
}
if (ccNames.length > 0 || ccGroups.length > 0 || opts.ccClear) {
  const additions = await resolveUserAdditions(client, projectId, ccNames, ccGroups);
  ccUsers = mergeUsers(ccUsers, additions, !!opts.ccClear);
}

// 기존 client.updatePost(... users: { to: toUsers, cc: ccUsers })
```

**dry-run 확장** (line 115-125 의 dry-run 분기 갱신):

```ts
if (opts.dryRun) {
  stopSpinner(false);
  const globalOpts = postEditCommand.optsWithGlobals() as OutputOptions;
  const previewBody = newBody ?? post.body.content;
  if (globalOpts.json) {
    process.stdout.write(JSON.stringify({ body: previewBody, users: { to: toUsers, cc: ccUsers } }) + "\n");
  } else {
    process.stdout.write(previewBody + "\n");
  }
  return;
}
```

dry-run 의 toUsers/ccUsers 미리 계산해야 하므로, 위 cc/to 처리 블록을 dry-run 분기 **이전** 으로 옮기는 게 자연스러움. executor 가 phase 작성 시 정확한 위치 결정.

**interactive 모드 경고** (line 155-164 의 mention/link-task 경고 옆):

```ts
if (ccNames.length > 0 || ccGroups.length > 0 || opts.ccClear ||
    toNames.length > 0 || toGroups.length > 0 || opts.toClear) {
  process.stderr.write(
    "⚠  --cc/--cc-group/--cc-clear/--to/--to-group/--to-clear 는 --title/--body 와 함께 사용 시에만 적용됩니다.\n",
  );
}
```

### 2. `src/commands/post/create.ts` — 2 옵션

옵션 정의 (line 43 옆에 추가):

```ts
.option("--cc-group <code>", "참조자(cc) 그룹 (반복 가능)",
  (v, prev: string[]) => [...prev, v], [] as string[])
.option("--to-group <code>", "담당자(to) 그룹 (반복 가능)",
  (v, prev: string[]) => [...prev, v], [] as string[])
```

(`--cc <members...>` / `--to <members...>` 는 이미 있음 — variadic. clear 는 create 에 무의미하므로 추가 안 함.)

action 안에서 (line 130-131 갱신):

```ts
import { resolveUserAdditions } from "../../resolvers/post-users.js";

const ccGroupCodes: string[] = (opts.ccGroup ?? []).filter((s: string) => s.length > 0);
const toGroupCodes: string[] = (opts.toGroup ?? []).filter((s: string) => s.length > 0);

const toUsersMembers = opts.to ? await resolveUsers(client, projectId, opts.to) : [];
const ccUsersMembers = opts.cc ? await resolveUsers(client, projectId, opts.cc) : [];
const toUsersGroups = toGroupCodes.length > 0
  ? await resolveUserAdditions(client, projectId, [], toGroupCodes)
  : [];
const ccUsersGroups = ccGroupCodes.length > 0
  ? await resolveUserAdditions(client, projectId, [], ccGroupCodes)
  : [];

const toUsers = [...toUsersMembers, ...toUsersGroups];
const ccUsers = [...ccUsersMembers, ...ccUsersGroups];

// 기존 client.createPost(... users: { to: toUsers, cc: ccUsers })
```

create 는 새 업무 = dedupe 불필요 (사용자가 같은 멤버를 중복 입력하면 그대로 두거나, 사용자 책임). 단 일관성 위해 `mergeUsers([], [...members, ...groups], false)` 로 dedupe 만 적용 가능 — executor 가 단순화 선택.

### 3. 동작 실증 (필수 — ADR-025 의 group type 형식 확인)

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm build

# 사용자 환경 가정 — config 셋업되어 있음
# 1) 신규 업무 생성 (그룹 cc 동봉)
node dist/index.js post create <project> \
  --title "[test] cc group 실증" \
  --body "phase-02 검증" \
  --cc-group <group-code> \
  --json | jq -r '.id'
# 기대: 200 OK + post id 반환

# 2) post edit 으로 cc 그룹 추가 (다른 그룹)
node dist/index.js post edit --id <postId> \
  --cc-group <다른-group-code> \
  --json
# 기대: 200 OK

# 3) cc-clear + 단일 멤버
node dist/index.js post edit --id <postId> \
  --cc-clear --cc <member-name>

# 4) dry-run 검증
node dist/index.js post edit --id <postId> \
  --cc-group <group-code> --dry-run --json | jq '.users.cc'
# 기대: cc 배열에 type=group 객체 포함, API 미호출

# 5) 정리 (실증용 업무 삭제 — 가능하면)
node dist/index.js post done <project> <number>   # 또는 dooray UI 에서 삭제
```

**executor 메모**: 위 5번 시나리오는 사용자 환경의 실제 group code 가 필요. 미설정 시 사용자에게 group code 1개 요청. 실패 시 ADR-025 의 group type 형식 (`type: "group"` + `projectMemberGroupId`) 가 잘못됐을 가능성 — 실제 응답 (Failed to read HTTP message 같은 메시지) 을 사용자에게 보고하고 ADR-025 revisit.

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. tsc + build + test
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
# 기대: 0
pnpm build && pnpm test
# 기대: exit 0

# 2. 옵션 추가 — edit 6 + create 2 = 8
grep -cE "^\s*\.option\(\"--cc[a-z\-]*<|^\s*\.option\(\"--to[a-z\-]*<|^\s*\.option\(\"--cc-clear|^\s*\.option\(\"--to-clear" src/commands/post/edit.ts
# 기대: 6 이상
grep -cE "^\s*\.option\(\"--(cc|to)-group" src/commands/post/create.ts
# 기대: 2

# 3. resolveUserAdditions / mergeUsers 호출
grep -cE "resolveUserAdditions" src/commands/post/edit.ts src/commands/post/create.ts
# 기대: 각 1 이상
grep -cE "mergeUsers" src/commands/post/edit.ts
# 기대: 1 이상 (create 는 dedupe 선택적)

# 4. interactive 경고
grep -nE "--cc/--cc-group" src/commands/post/edit.ts
# 기대: 1 이상

# 5. (실증 통과 시) executor 메모: cc/to-group 1 사이클 200 OK
```

## 작업 외 금지

- `client.updatePost` / `client.createPost` 시그니처 변경 금지 (full payload PUT 그대로 — ADR-025)
- 신규 client 메서드 추가 금지 (기존 updatePost/createPost 사용)
- ADR / docs 변경 금지 (planning 단계에서 commit `bc92776`, `564870f` 으로 반영됨)
- README / SKILL.md 갱신 금지 — phase-03
- mention/link-task 처리 흐름 변경 금지 (인접 패턴 답습)

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/027-feat-post-edit-create-cc-to-group
git add src/commands/post/edit.ts src/commands/post/create.ts
git commit -m "feat(commands): add cc/to + group options to post edit/create

Issue #54 (phase 2/3, ADR-025):
- post edit: --cc / --cc-group / --cc-clear + --to / --to-group / --to-clear (6 옵션)
- post create: --cc-group / --to-group (2 옵션)
- append + dedupe (organizationMemberId / projectMemberGroupId / emailAddress)
- --*-clear 는 기존 비우고 신규만
- group type: { type: 'group', group: { projectMemberGroupId } }
- interactive (\$EDITOR) 모드는 옵션 무시 + stderr 경고 (mention/link-task 답습)
- dry-run 의 JSON 출력에 users: { to, cc } 포함

API 실증: post create/edit 으로 cc-group 추가 200 OK (사용자 환경에서 1회)."
```
