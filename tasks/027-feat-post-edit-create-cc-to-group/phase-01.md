# Phase 01 — `resolvers/post-users.ts` (parse + merge + resolve) + tests

## 컨텍스트

GitHub Issue #54 — `post edit/create` 의 cc/to 참조자·담당자에 멤버 또는 그룹 추가/수정 (`--cc`, `--cc-group`, `--cc-clear`, `--to`, `--to-group`, `--to-clear`).

본 phase 는 명령에 통합하기 전에 **pure 함수 helper** 를 분리해 단위 테스트로 정확성 보장. mock 없이 검증되도록 sync 분기 (parseUserSpec / mergeUsers) 와 async resolver (resolveUserAdditions) 를 분리.

코드 현황:
- `src/api/types.ts:127-139` — `PostUser` (member/emailUser/group/workflow) + `PostUsers` (from/to/cc)
- `src/api/types.ts:122-125` — `Group.projectMemberGroupId` (이슈 본문의 `memberGroupId` 와 다름 — ADR-025)
- `src/api/types.ts:218-228` — `CreatePostUser` / `CreatePostUsers` (post create/edit payload)
- `src/resolvers/member.ts:101` — `resolveMember(client, projectId, input)` (이름 부분일치)
- `src/resolvers/member-group.ts` — `resolveMemberGroup(client, projectId, code)` (code 부분일치) — 정확한 export 이름은 grep 으로 확인
- ADR-025 — full payload PUT + group type 명세

직전 plan 과의 관계: 016 (post comment mention) 가 `--mention-group` 도입, 022 (post comment mention/link-task) 가 post create/edit 까지 first-class 확장. 본 plan 은 다음 영역 (cc/to participants) 으로 확장.

```bash
# cwd: /Users/nhn/personal/dooray-cli
git log origin/main --oneline -10 -- src/resolvers/ src/api/types.ts
# 기대: ADR-025 commit + 최근 resolver 변경
```

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- src/resolvers/post-users.ts src/resolvers/post-users.test.ts
```

기대 결과 (총 2 파일, 신규):
```
src/resolvers/post-users.ts
src/resolvers/post-users.test.ts
```

## 작업 항목

### 1. `src/resolvers/post-users.ts` — 3 함수

```ts
import type { DoorayApiClient } from "../api/client.js";
import type { CreatePostUser } from "../api/types.js";
import { resolveMember } from "./member.js";
import { resolveMemberGroup } from "./member-group.js";

// PURE — member-id 와 group-id 의 sync 변환. mock 없이 단위 테스트.
export function parseUserSpec(
  memberIds: string[],
  groupIds: string[],
): CreatePostUser[] {
  const users: CreatePostUser[] = [];
  for (const id of memberIds) {
    users.push({ type: "member", member: { organizationMemberId: id } });
  }
  for (const gid of groupIds) {
    users.push({ type: "group", group: { projectMemberGroupId: gid, members: [] } });
  }
  return users;
}

// PURE — 기존 users 와 신규 users 병합. clear 면 existing 무시. dedupe:
//   - member: organizationMemberId
//   - group: projectMemberGroupId
//   - emailUser: emailAddress (보존)
export function mergeUsers(
  existing: CreatePostUser[],
  additions: CreatePostUser[],
  clear: boolean,
): CreatePostUser[] {
  const base = clear ? [] : existing;
  const seen = new Set<string>();
  const result: CreatePostUser[] = [];
  for (const u of [...base, ...additions]) {
    const key = userKey(u);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(u);
  }
  return result;
}

function userKey(u: CreatePostUser): string | null {
  if (u.member?.organizationMemberId) return `m:${u.member.organizationMemberId}`;
  if (u.group?.projectMemberGroupId) return `g:${u.group.projectMemberGroupId}`;
  if (u.emailUser?.emailAddress) return `e:${u.emailUser.emailAddress}`;
  return null;
}

// ASYNC — 이름/코드 입력을 resolveMember / resolveMemberGroup 으로 id 변환 후 parseUserSpec 호출.
export async function resolveUserAdditions(
  client: DoorayApiClient,
  projectId: string,
  names: string[],
  groupCodes: string[],
): Promise<CreatePostUser[]> {
  const memberIds = await Promise.all(
    names.map((n) => resolveMember(client, projectId, n)),
  );
  const groups = await Promise.all(
    groupCodes.map((c) => resolveMemberGroup(client, projectId, c)),
  );
  const groupIds = groups.map((g) => g.id);
  return parseUserSpec(memberIds, groupIds);
}
```

**중요 — Group 타입의 `members` 필드**: API 응답 `Group` 에는 `members: Member[]` 가 있지만 송신 시점에는 빈 배열로 두어도 Dooray 가 무시 (ADR-025 의 실증 결과로 phase-02 에서 확인). 일단 빈 배열로 보내고, phase-02 실증 후 필요 시 조정.

`resolveMemberGroup` 의 정확한 export 이름과 반환 객체 모양 (`g.id` / `g.code` 등) 은 executor 가 phase 시작 시 grep 으로 확인:

```bash
grep -nE "export.*resolveMemberGroup" src/resolvers/member-group.ts
```

### 2. `src/resolvers/post-users.test.ts` — 단위 테스트 (총 7 케이스)

```ts
import { describe, it, expect } from "vitest";
import { parseUserSpec, mergeUsers } from "./post-users.js";
import type { CreatePostUser } from "../api/types.js";

describe("parseUserSpec", () => {
  it("멤버 id 들을 type:member 객체로 변환", () => {
    expect(parseUserSpec(["m1", "m2"], [])).toEqual([
      { type: "member", member: { organizationMemberId: "m1" } },
      { type: "member", member: { organizationMemberId: "m2" } },
    ]);
  });
  it("그룹 id 들을 type:group + projectMemberGroupId 로 변환", () => {
    expect(parseUserSpec([], ["g1"])).toEqual([
      { type: "group", group: { projectMemberGroupId: "g1", members: [] } },
    ]);
  });
  it("멤버 + 그룹 동시 — 멤버 먼저, 그룹 다음", () => {
    const out = parseUserSpec(["m1"], ["g1"]);
    expect(out[0]?.type).toBe("member");
    expect(out[1]?.type).toBe("group");
  });
});

describe("mergeUsers", () => {
  it("clear=false — 기존 + 신규 append, dedupe", () => {
    const existing: CreatePostUser[] = [{ type: "member", member: { organizationMemberId: "m1" } }];
    const additions: CreatePostUser[] = [
      { type: "member", member: { organizationMemberId: "m1" } }, // 중복
      { type: "member", member: { organizationMemberId: "m2" } },
    ];
    expect(mergeUsers(existing, additions, false)).toEqual([
      { type: "member", member: { organizationMemberId: "m1" } },
      { type: "member", member: { organizationMemberId: "m2" } },
    ]);
  });
  it("clear=true — 기존 무시, 신규만", () => {
    const existing: CreatePostUser[] = [{ type: "member", member: { organizationMemberId: "m1" } }];
    const additions: CreatePostUser[] = [{ type: "member", member: { organizationMemberId: "m2" } }];
    expect(mergeUsers(existing, additions, true)).toEqual(additions);
  });
  it("group dedupe — projectMemberGroupId 기준", () => {
    const existing: CreatePostUser[] = [{ type: "group", group: { projectMemberGroupId: "g1", members: [] } }];
    const additions: CreatePostUser[] = [{ type: "group", group: { projectMemberGroupId: "g1", members: [] } }];
    expect(mergeUsers(existing, additions, false).length).toBe(1);
  });
  it("emailUser dedupe — emailAddress 기준", () => {
    const existing: CreatePostUser[] = [{ type: "emailUser", emailUser: { emailAddress: "a@b.example.com", name: "A" } }];
    const additions: CreatePostUser[] = [{ type: "emailUser", emailUser: { emailAddress: "a@b.example.com", name: "A2" } }];
    expect(mergeUsers(existing, additions, false).length).toBe(1);
  });
});
```

(`resolveUserAdditions` 는 async + DoorayApiClient mock 필요 — phase-02 의 실증 시나리오로 대체. 본 phase 는 pure 함수만.)

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. tsc + build + test (CI 게이트와 동일)
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
# 기대: 0
pnpm build && pnpm test
# 기대: exit 0

# 2. 3 함수 export
grep -nE "export (async )?function (parseUserSpec|mergeUsers|resolveUserAdditions)" src/resolvers/post-users.ts
# 기대: 3 줄

# 3. 테스트 케이스 수
grep -cE "^\s*it\(" src/resolvers/post-users.test.ts
# 기대: 7
```

## 작업 외 금지

- post edit / post create 명령에 옵션 통합 금지 — phase-02 에서
- README / SKILL.md 갱신 금지 — phase-03 에서
- `member-group.ts` / `member.ts` 의 resolver 본체 변경 금지 (해당 helper 만 import)
- ADR / docs 변경 금지 (planning 단계에서 commit `bc92776` 으로 이미 반영)

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/027-feat-post-edit-create-cc-to-group
git add src/resolvers/post-users.ts src/resolvers/post-users.test.ts
git commit -m "feat(resolvers): add post-users helper (parseUserSpec / mergeUsers / resolveUserAdditions)

Issue #54 (phase 1/3, ADR-025): sync helper to convert member-ids /
group-ids into CreatePostUser objects + merge with existing users +
dedupe by organizationMemberId / projectMemberGroupId / emailAddress.
Async orchestrator resolveUserAdditions chains resolveMember +
resolveMemberGroup. 7 unit tests cover parse + merge edge cases."
```
