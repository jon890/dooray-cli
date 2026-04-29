# Phase 2: mention helper + comment add/edit 옵션 통합 + 단위 테스트

## 컨텍스트

Phase 1의 데이터 레이어 위에 사용자 인터페이스. `--mention <name>` (반복) + `--mention-group <code>` (반복). 본문 앞 prepend (공백 1칸 구분).

### 먼저 읽을 파일

- `src/commands/post/comment/add.ts`, `edit.ts` — 011/012 적용된 깔끔한 형태
- `src/resolvers/me.ts` (phase 1 산출), `src/resolvers/member.ts` (012), `src/resolvers/member-group.ts` (014 + phase 1 추가)
- `src/utils/comment-enrich.ts` (012 패턴 — 단위 테스트 형식 참고)
- `docs/adr.md` — 자명성 통과 → ADR 신설 안 함, 본 phase 주의사항으로 결정 보존

### 마크업 형식 (skills/dooray-cli/SKILL.md 섹션 #21에서 정의)

- 본인 멤버: `[@이름](dooray://{orgId}/members/{memberId} "me")`
- 타인 멤버: `[@이름](dooray://{orgId}/members/{memberId} "member")`
- 그룹: `[@projectCode/그룹코드](dooray://{orgId}/member-groups/{groupId})` — title 없음

## 작업 목록 (4개)

### 1) `src/utils/mention.ts` — 마크업 빌더 + 테스트

```ts
import type { CachedMe } from "../cache/types.js";

export interface MentionMember {
  memberId: string;
  name: string;
}

export interface MentionGroup {
  groupId: string;
  code: string;
  projectCode: string;
}

export function buildMemberMention(m: MentionMember, me: CachedMe): string {
  const title = m.memberId === me.id ? "me" : "member";
  // 이름에 따옴표·괄호가 들어가도 markdown은 그대로 OK (Dooray 앱이 lenient parse)
  return `[@${m.name}](dooray://${me.orgId}/members/${m.memberId} "${title}")`;
}

export function buildGroupMention(g: MentionGroup, me: CachedMe): string {
  return `[@${g.projectCode}/${g.code}](dooray://${me.orgId}/member-groups/${g.groupId})`;
}

/**
 * 멤버·그룹 멘션을 본문 앞에 prepend.
 * 멤버가 먼저, 그룹이 다음. 각각 공백 1칸 구분. 본문이 비어있어도 형식 유지.
 */
export function prependMentions(
  body: string,
  members: MentionMember[],
  groups: MentionGroup[],
  me: CachedMe,
): string {
  const parts: string[] = [];
  for (const m of members) parts.push(buildMemberMention(m, me));
  for (const g of groups) parts.push(buildGroupMention(g, me));
  if (parts.length === 0) return body;
  return parts.join(" ") + " " + body;
}
```

**`src/utils/mention.test.ts`**:

```ts
import { describe, it, expect } from "vitest";
import { buildMemberMention, buildGroupMention, prependMentions } from "./mention.js";

const ME = { id: "100", name: "본인", orgId: "1" };

describe("buildMemberMention", () => {
  it("본인이면 me title", () => {
    expect(buildMemberMention({ memberId: "100", name: "본인" }, ME))
      .toBe('[@본인](dooray://1/members/100 "me")');
  });
  it("타인이면 member title", () => {
    expect(buildMemberMention({ memberId: "200", name: "홍길동" }, ME))
      .toBe('[@홍길동](dooray://1/members/200 "member")');
  });
});

describe("buildGroupMention", () => {
  it("project/code 형식 + title 없음", () => {
    expect(buildGroupMention({ groupId: "g1", code: "개발", projectCode: "P" }, ME))
      .toBe("[@P/개발](dooray://1/member-groups/g1)");
  });
});

describe("prependMentions", () => {
  it("본문 앞에 prepend, 공백 구분", () => {
    const out = prependMentions(
      "확인 부탁드립니다",
      [{ memberId: "200", name: "홍길동" }],
      [{ groupId: "g1", code: "개발", projectCode: "P" }],
      ME,
    );
    expect(out).toBe(
      '[@홍길동](dooray://1/members/200 "member") [@P/개발](dooray://1/member-groups/g1) 확인 부탁드립니다',
    );
  });
  it("멘션 없으면 본문 그대로", () => {
    expect(prependMentions("본문", [], [], ME)).toBe("본문");
  });
  it("빈 본문 + 멘션만 → trailing 공백", () => {
    expect(prependMentions("", [{ memberId: "200", name: "A" }], [], ME))
      .toBe('[@A](dooray://1/members/200 "member") ');
  });
  it("멤버만 또는 그룹만도 동작", () => {
    expect(prependMentions("X", [{ memberId: "100", name: "본인" }], [], ME))
      .toBe('[@본인](dooray://1/members/100 "me") X');
    expect(prependMentions("X", [], [{ groupId: "g1", code: "개발", projectCode: "P" }], ME))
      .toBe("[@P/개발](dooray://1/member-groups/g1) X");
  });
  it("순서: 멤버 먼저, 그룹 다음", () => {
    const out = prependMentions(
      "X",
      [{ memberId: "200", name: "A" }, { memberId: "300", name: "B" }],
      [{ groupId: "g1", code: "개발", projectCode: "P" }],
      ME,
    );
    expect(out.indexOf("members/200") < out.indexOf("members/300")).toBe(true);
    expect(out.indexOf("members/300") < out.indexOf("member-groups/g1")).toBe(true);
  });
});
```

### 2) `src/commands/post/comment/add.ts` — 옵션 + 통합

기존 흐름 (`bodyContent` 결정 → `resolvePostInput` → `createPostComment`) 사이에 mention 처리 끼워넣기:

```ts
import { resolveMember, buildMemberNameMap } from "../../../resolvers/member.js";
import { resolveMemberGroup } from "../../../resolvers/member-group.js";
import { ensureMe } from "../../../resolvers/me.js";
import { prependMentions } from "../../../utils/mention.js";

// ... commentAddCommand 정의에 추가:
.option(
  "--mention <name>",
  "멤버 멘션 (반복 가능, 이름 부분일치)",
  (value: string, prev: string[]) => [...prev, value],
  [] as string[],
)
.option(
  "--mention-group <code>",
  "그룹 멘션 (반복 가능, code 부분일치)",
  (value: string, prev: string[]) => [...prev, value],
  [] as string[],
)
.action(async (project, postNumberStr, opts) => {
  // 기존 config/client/bodyContent 흐름 그대로

  // bodyContent 결정 후, resolvePostInput 결과 destructure 시 projectCode 함께 추출:
  const { projectId, postId, projectCode } = await resolvePostInput(client, { ... });

  // createPostComment 직전에:
  const mentionInputs: string[] = (opts.mention ?? []).filter((s: string) => s.length > 0);
  const groupInputs: string[] = (opts.mentionGroup ?? []).filter((s: string) => s.length > 0);

  if (mentionInputs.length > 0 || groupInputs.length > 0) {
    const me = await ensureMe(client);
    // 1차: 입력 → memberId resolve
    const memberIds = await Promise.all(
      mentionInputs.map((name) => resolveMember(client, projectId, name)),
    );
    // 2차: id → 정식 name lookup (사용자 입력이 부분일치 raw일 수 있음 → 정식 표시명으로 정규화)
    const nameMap = await buildMemberNameMap(client, projectId, memberIds);
    const members = memberIds.map((memberId) => ({
      memberId,
      name: nameMap.get(memberId) ?? memberId,
    }));

    const groups = await Promise.all(
      groupInputs.map(async (code) => {
        const g = await resolveMemberGroup(client, projectId, code);
        return { groupId: g.id, code: g.code, projectCode };
      }),
    );
    bodyContent = prependMentions(bodyContent, members, groups, me);
  }

  // 기존 createPostComment 호출
});
```

> `resolvePostInput.ResolvedPostInput.projectCode` 존재 확인됨 (`src/resolvers/post-input.ts:18`). destructure만 추가.
> `buildMemberNameMap`은 `src/resolvers/member.ts:89`에 존재 — `ensureMembers` 캐시를 한 번에 활용 (네트워크 추가 호출 없음).

### 3) `src/commands/post/comment/edit.ts` — 동일 패턴

`add.ts`와 같이 옵션 추가. edit는 두 분기:

- **`--body`/`--body-file` 모드** (`readBodyInputOrNull`이 non-null 반환): `edited` 결정 직후 `prependMentions`로 앞에 prepend. add.ts와 동일 패턴.
- **`$EDITOR` 모드** (`readBodyInputOrNull`이 null → `comment.body.content`로 `original` 채움): **`openInEditor(original)` 호출 직전에** `original`에 prepend. 사용자가 EDITOR에서 멘션 마크업을 직접 보고 편집할 수 있도록.

```ts
let edited = await readBodyInputOrNull(opts);

// 멘션 옵션 처리 (add.ts와 동일하게 me/members/groups 준비)
const mentionPrefix = (members.length > 0 || groups.length > 0)
  ? prependMentions("", members, groups, me).trimEnd()
  : "";

if (edited == null) {
  let original = comment.body.content;
  if (mentionPrefix) original = mentionPrefix + " " + original;
  edited = await openInEditor(original);
  if (original === edited) { /* 변경사항 없음 */ }
} else if (mentionPrefix) {
  edited = mentionPrefix + " " + edited;
}
```

> `prependMentions(body="")` 결과는 `"{mentions} "` (trailing 공백) — `trimEnd()`로 한 번 정리. 빈 본문 + 멘션만인 케이스도 일관된 출력.

### 4) commander option key 점검

- `--mention <name>` → `opts.mention: string[]`
- `--mention-group <code>` → `opts.mentionGroup: string[]` (kebab → camelCase 자동 변환)

빈 문자열 입력 방어: `.filter((s) => s.length > 0)` 적용.

## 성공 기준

- [ ] `pnpm run build` 성공
- [ ] `pnpm test` 통과 (mention 단위 테스트 6+ 케이스 추가)
- [ ] `node dist/index.js post comment add --help` → `--mention`, `--mention-group` 노출
- [ ] `node dist/index.js post comment edit --help` → 동일
- [ ] `grep -c "buildMemberMention\|buildGroupMention\|prependMentions" src/utils/mention.ts` → 3 이상
- [ ] `grep -c "ensureMe\|resolveMemberGroup\|resolveMember\|buildMemberNameMap" src/commands/post/comment/add.ts src/commands/post/comment/edit.ts` → 8 이상 (각 명령에 4개씩)
- [ ] `git diff --stat` — `src/utils/mention.ts(.test.ts)`, `src/commands/post/comment/{add,edit}.ts` 변경

## 주의사항

- **prepend 위치**: 본문 앞 + 공백 1칸 구분 (`{mentions} {body}`). 이슈 #25 결정사항
- **멤버 먼저, 그룹 다음** 순서 고정 — 단위 테스트로 가드
- **`add.ts`에서 `--body` 미지정 + 멘션만 지정한 케이스**: `bodyContent==null` → `openInEditor("")` 진입. 멘션 prepend는 EDITOR 진입 **전에** 빈 본문에 적용해서 사용자가 멘션 마크업을 보고 편집하도록 (edit.ts와 동일 정책). 사용자가 EDITOR에서 빈 본문으로 저장하면 기존 abort 로직("빈 댓글은 작성할 수 없습니다") 그대로 — 멘션만으로는 댓글 작성 불가
- **prependMentions의 빈 본문 처리**: `prependMentions("", members, groups, me)`는 `"{mentions} "` (trailing 공백 1) 반환 → 호출자가 `trimEnd()` 또는 그대로 사용. 단위 테스트에 빈 body 케이스 추가
- **`resolveMember` 부분일치 + 모호 에러는 그대로 throw** — 사용자가 정확한 이름 입력 유도
- **`resolveMemberGroup`도 동일 패턴** (014 + phase 1)
- **commander option key**: `--mention-group` → `opts.mentionGroup` (camelCase). README/SKILL.md(phase 3)는 kebab-case로 표기
- **edit의 본문 fetch 흐름**: 기존 본문 + 멘션 prepend로 조립. 본문이 멘션 마크업으로 시작하면 중복 prepend 가능 — 본 task에서 무시(사용자가 옵션을 의식적으로 추가). 후속에서 dedup 로직 가능

## Blocked 조건

- phase 1 산출물(`ensureMe`, `MeDetail`, `resolveMemberGroup`, `CachedMe.orgId`) 부재 → `PHASE_BLOCKED: phase 1 미완료`
- `resolvePostInput`이 `projectCode` 반환 중단 → `PHASE_BLOCKED: post-input 시그니처 변경` (현재는 `src/resolvers/post-input.ts:18`에서 보장됨)
- `buildMemberNameMap` 시그니처 변경 → `PHASE_BLOCKED: member resolver 시그니처 변경`
