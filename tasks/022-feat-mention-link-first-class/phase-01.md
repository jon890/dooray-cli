# Phase 01 — `post create` / `post edit` 에 `--mention` / `--mention-group` 추가

## 컨텍스트

GitHub Issue #33 의 핵심 — `post comment add/edit` 에는 PR #31 (task 016) 로 이미 `--mention` / `--mention-group` 이 들어갔지만, `post create` / `post edit` 본문에는 미적용. 사용자가 평문 `@홍길동` 을 쓰면 알림이 발송되지 않는 사고 발생 가능.

본 phase 는 comment 명령의 옵션 정의와 멘션 prepend 흐름을 그대로 복제. 새 util 추가는 phase-02 에서.

코드 현황:
- `src/utils/mention.ts` — `buildMemberMention`, `buildGroupMention`, `prependMentions(body, members, groups, me)` 이미 존재
- `src/commands/post/comment/add.ts:24-30` + `src/commands/post/comment/edit.ts` — `--mention <name>` (반복 가능) + `--mention-group <code>` 옵션 정의 + `mentionInputs.map((name) => resolveMember(...))` + `groupInputs.map((code) => resolveMemberGroup(...))` + `prependMentions(...)` 호출 패턴 확립
- `src/commands/post/create.ts:42-94` — `--tag` 등 메타 옵션 + body 결정 흐름. mention 미적용
- `src/commands/post/edit.ts:38-117` — non-interactive (--title/--body) + interactive ($EDITOR) 양 모드. mention 미적용

직전 plan 과의 관계: 016 (PR #31) 가 mention 패턴을 comment 명령에 도입. 동일 helper (`prependMentions`) 와 resolver (`resolveMember`, `resolveMemberGroup`, `ensureMe`) 그대로 재사용.

```bash
# cwd: /Users/nhn/personal/dooray-cli
git log origin/main --oneline -10 -- src/commands/post/create.ts src/commands/post/edit.ts src/utils/mention.ts
```

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- src/commands/post/create.ts src/commands/post/edit.ts
```

기대 결과 (총 2 파일):
```
src/commands/post/create.ts
src/commands/post/edit.ts
```

## 작업 항목

### 1. `src/commands/post/create.ts` — 옵션 추가 + projectCode 획득 + body 합성

옵션 정의 추가 (기존 `--tag` 옆):

```ts
.option("--mention <name>", "멤버 멘션 (반복 가능)", (v, prev: string[]) => [...prev, v], [] as string[])
.option("--mention-group <code>", "그룹 멘션 (반복 가능)", (v, prev: string[]) => [...prev, v], [] as string[])
```

**projectCode 획득 (필수)** — `post create` 는 `resolveProject(client, input)` 만 사용하고 반환은 `string` (id만). `--mention-group` markdown 은 `[@<projectCode>/<groupCode>](...)` 포맷이라 정확한 projectCode 필요. positional 이 code 든 ID 든 projects cache 에서 reverse lookup:

```ts
import { ensureProjects } from "../../resolvers/project.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
// ...
const projectId = await resolveProject(client, projectInput);
let projectCode: string | undefined;
if (groupInputs.length > 0) {
  // mention-group 사용 시에만 reverse lookup (cache 히트면 추가 API 호출 없음)
  const projects = await ensureProjects(client);
  projectCode = projects.find((p) => p.id === projectId)?.code;
  if (!projectCode) {
    throw new DoorayCliError(
      `--mention-group 은 공개 프로젝트에서만 지원됩니다. dooray project list 로 캐시 갱신 후 재시도하세요.`,
      EXIT_PARAM_ERROR,
    );
  }
}
```

action 안에서 (resolveTags 호출 근처):

```ts
import { prependMentions } from "../../utils/mention.js";
import { ensureMe } from "../../resolvers/me.js";
import { resolveMember, buildMemberNameMap } from "../../resolvers/member.js";
import { resolveMemberGroup } from "../../resolvers/member-group.js";

// ...
const mentionInputs: string[] = (opts.mention ?? []).filter((s: string) => s.length > 0);
const groupInputs: string[] = (opts.mentionGroup ?? []).filter((s: string) => s.length > 0);

let bodyContent = await readBodyInputOrEmpty(opts); // 또는 기존 body 결정 로직
if (mentionInputs.length > 0 || groupInputs.length > 0) {
  const me = await ensureMe(client);
  const memberIds = await Promise.all(
    mentionInputs.map((name) => resolveMember(client, projectId, name)),
  );
  const nameMap = await buildMemberNameMap(client, projectId);
  const members = memberIds.map((id) => ({ memberId: id, name: nameMap.get(id) ?? id }));
  const groups = await Promise.all(
    groupInputs.map(async (code) => {
      const g = await resolveMemberGroup(client, projectId, code);
      return { groupId: g.id, code: g.code, projectCode: projectCode! };
    }),
  );
  bodyContent = prependMentions(bodyContent, members, groups, me);
}

// updatePost / createPost body 에 bodyContent 사용
```

### 2. `src/commands/post/edit.ts` — non-interactive 분기에만 적용

`postEditCommand` 의 non-interactive 분기 (line 63-92) 에서 newBody 결정 후 mention prepend. 동일 패턴.

interactive ($EDITOR) 모드는 사용자가 본문을 직접 작성하므로 `--mention` 적용은 ambiguous — 본 phase 에서는 **non-interactive 모드만** 적용. interactive 모드에서 `--mention` 함께 쓰면 stderr 경고 후 무시.

```ts
// non-interactive 분기:
if (mentionInputs.length > 0 || groupInputs.length > 0) {
  // ... newBody 에 prependMentions 적용
}

// interactive 분기 진입 직전:
if (!nonInteractive && (mentionInputs.length > 0 || groupInputs.length > 0)) {
  process.stderr.write("⚠  --mention/--mention-group 은 --title/--body 와 함께 사용 시에만 적용됩니다.\n");
}
```

### 3. resolveMember / resolveMemberGroup / ensureMe / buildMemberNameMap 시그니처 점검

```bash
# cwd: /Users/nhn/personal/dooray-cli
grep -nE "export (async )?function (resolveMember|resolveMemberGroup|ensureMe|buildMemberNameMap)" src/resolvers/
```

기존 함수 그대로 사용. comment add 의 import 라인을 그대로 복제.

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. 빌드 + 테스트 통과
pnpm build && pnpm test

# 2. 옵션 정의 추가 (각 파일)
grep -nE "--mention\b|--mention-group" src/commands/post/create.ts src/commands/post/edit.ts
# 기대: 4줄 이상 (각 파일 2 옵션)

# 3. prependMentions 호출
grep -cE "prependMentions" src/commands/post/create.ts src/commands/post/edit.ts
# 기대: 각 1 이상

# 4. interactive 모드 경고 (post edit 만)
grep -nE "함께 사용|--title/--body 와 함께" src/commands/post/edit.ts
# 기대: 1 이상
```

## 작업 외 금지

- `--link-task` 옵션 추가 금지 — phase-02 에서
- `--dry-run` 추가 금지 — phase-03 에서
- comment add/edit 의 mention 흐름 변경 금지
- ADR 추가 금지 (ADR 작성 전 점검 — 기존 mention 패턴의 단순 확장)

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/022-feat-mention-link-first-class
git add src/commands/post/create.ts src/commands/post/edit.ts
git commit -m "feat(commands): add --mention/--mention-group to post create/edit

Issue #33: extend first-class mention support beyond comments.
Reuses prependMentions util + member/group resolvers from comment flow.
Edit interactive mode warns if --mention is mixed in (\$EDITOR owns body)."
```
