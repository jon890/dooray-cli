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
import { resolveMember } from "../../../resolvers/member.js";
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

  // bodyContent 결정 후, resolvePostInput 후, createPostComment 직전에:
  const mentionInputs: string[] = (opts.mention ?? []).filter((s: string) => s.length > 0);
  const groupInputs: string[] = (opts.mentionGroup ?? []).filter((s: string) => s.length > 0);

  if (mentionInputs.length > 0 || groupInputs.length > 0) {
    const me = await ensureMe(client);
    const members = await Promise.all(
      mentionInputs.map(async (name) => {
        const memberId = await resolveMember(client, projectId, name);
        // resolveMember는 ID만 반환 — name은 입력값 그대로 마크업 표시
        return { memberId, name };
      }),
    );
    // 그룹 코드 resolve — projectCode는 입력값(부분일치 매칭된 code)으로 표시
    const groups = await Promise.all(
      groupInputs.map(async (code) => {
        const g = await resolveMemberGroup(client, projectId, code);
        // projectCode는 명령 첫 인자 또는 resolvePostInput.projectCode (011 결과)
        return { groupId: g.id, code: g.code, projectCode: resolved.projectCode };
      }),
    );
    bodyContent = prependMentions(bodyContent, members, groups, me);
  }

  // 기존 createPostComment 호출
});
```

> `resolved.projectCode`: `resolvePostInput`(011) 반환값에 `projectCode` 있는지 확인. 없으면 `resolveProject` 결과 또는 첫 positional 그대로 사용. 본 phase 작성 시 phase 1과 011 산출물 시그니처 정확히 점검.

### 3) `src/commands/post/comment/edit.ts` — 동일 패턴

`add.ts`와 같이 옵션 추가 + body 결정 직후 prepend. 기존 `--title`/`--body`/`--body-file` 흐름은 무변경. edit가 `--body` 미지정 시 기존 본문 fetch하는 흐름이 있으면, fetch된 본문 앞에 prepend (사용자 의도: "기존 본문에 멘션 추가").

> edit 본문 fetch 흐름 정확한 형태는 코드 확인 후 결정.

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
- [ ] `grep -c "ensureMe\|resolveMemberGroup\|resolveMember" src/commands/post/comment/{add,edit}.ts` → 6 이상 (각 명령에 3개씩)
- [ ] `git diff --stat` — `src/utils/mention.ts(.test.ts)`, `src/commands/post/comment/{add,edit}.ts` 변경

## 주의사항

- **prepend 위치**: 본문 앞 + 공백 1칸 구분 (`{mentions} {body}`). 이슈 #25 결정사항
- **멤버 먼저, 그룹 다음** 순서 고정 — 단위 테스트로 가드
- **본문 비어있으면 기존 에러**: 멘션만 있고 body 없으면 add는 에러 ("빈 댓글은 작성할 수 없습니다"). 멘션은 본문에 부수 효과만
- **`resolveMember` 부분일치 + 모호 에러는 그대로 throw** — 사용자가 정확한 이름 입력 유도
- **`resolveMemberGroup`도 동일 패턴** (014 + phase 1)
- **commander option key**: `--mention-group` → `opts.mentionGroup` (camelCase). README/SKILL.md(phase 3)는 kebab-case로 표기
- **edit의 본문 fetch 흐름**: 기존 본문 + 멘션 prepend로 조립. 본문이 멘션 마크업으로 시작하면 중복 prepend 가능 — 본 task에서 무시(사용자가 옵션을 의식적으로 추가). 후속에서 dedup 로직 가능

## Blocked 조건

- phase 1 산출물(`ensureMe`, `MeDetail`, `resolveMemberGroup`, `CachedMe.orgId`) 부재 → `PHASE_BLOCKED: phase 1 미완료`
- 011의 `resolvePostInput` 반환값에 `projectCode` 부재 → `PHASE_BLOCKED: projectCode 획득 경로 결정 필요` (대안: 첫 positional 그대로 사용)
- comment edit의 본문 fetch 흐름이 미존재(`--body` 필수)면 → 동일 패턴 적용, 본 phase에서 별도 분기 불필요
