# Phase 01 — `resolveMember` 입력 자동 분기 + 단위 테스트

## 컨텍스트

GitHub Issue #58 — `--to`/`--cc` 가 이름 부분일치만 지원해 동명이인은 cli 로 지정 불가. 이메일 / organizationMemberId 입력 시 "멤버을(를) 찾을 수 없습니다" 에러. `member search --email` 인프라는 이미 존재.

코드 현황:
- `src/resolvers/member.ts:101-114` — `resolveMember(client, projectId, input)` 가 `ensureMembers` + `matchByName` 만. 이메일/id 미지원
- `src/api/client.ts:363` — `getMemberDetail(memberId)` — 단일 id 검증 (404 가능)
- `src/api/client.ts:373` — `searchMembers(params)` — `{ externalEmailAddresses }` 로 이메일 exact lookup (이미 `member search --email` 이 사용)
- `src/commands/member/search.ts:46` — searchMembers 호출 패턴 답습
- `src/resolvers/post-users.ts` (task 027) — `resolveUserAdditions` 가 `resolveMember` 호출 → 자동 혜택
- 영향 받는 옵션 (resolveMember 호출 사이트): `--to` (post create/edit), `--cc` (post create/edit), `--mention` (post create/edit/comment add/edit) — 일관 적용

직전 plan 과의 관계: 027 (post cc/to + group) 이 `resolveUserAdditions` 도입. 본 plan 은 그 안의 `resolveMember` 만 확장 — 호출자 변경 0.

```bash
# cwd: /Users/nhn/personal/dooray-cli
git log origin/main --oneline -10 -- src/resolvers/member.ts src/api/client.ts
```

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- src/resolvers/member.ts src/resolvers/member.test.ts
```

기대 결과 (총 2 파일, member.ts 수정 + test 신규):
```
src/resolvers/member.test.ts        (신규)
src/resolvers/member.ts             (수정 — 분기 추가)
```

## 작업 항목

### 1. `src/resolvers/member.ts` — `resolveMember` 분기 추가

```ts
const MEMBER_ID_RE = /^\d{15,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function resolveMember(
  client: DoorayApiClient,
  projectId: string,
  input: string,
): Promise<string> {
  // 1. 19자리 이상 숫자 → organizationMemberId 직접 (getMemberDetail 로 존재 검증)
  if (MEMBER_ID_RE.test(input)) {
    try {
      await client.getMemberDetail(input);
      return input;
    } catch {
      throw new DoorayCliError(
        `organizationMemberId 를 찾을 수 없습니다: ${input}`,
        EXIT_PARAM_ERROR,
      );
    }
  }

  // 2. 이메일 형식 → searchMembers exact
  if (EMAIL_RE.test(input)) {
    const res = await client.searchMembers({ externalEmailAddresses: input });
    const hits = res.result;
    if (hits.length === 0) {
      throw new DoorayCliError(
        `이메일로 멤버를 찾을 수 없습니다: ${input}`,
        EXIT_PARAM_ERROR,
      );
    }
    if (hits.length > 1) {
      const candidates = hits.map((m) => `${m.name} (${m.id})`).join(", ");
      throw new DoorayCliError(
        `이메일 매칭이 모호합니다: ${input}\n후보: ${candidates}`,
        EXIT_PARAM_ERROR,
      );
    }
    return hits[0]!.id;
  }

  // 3. 그 외 → 기존 matchByName
  const members = await ensureMembers(client, projectId);
  const match = matchByName(
    members,
    input,
    "멤버",
    (m) => `${m.name} (${m.organizationMemberId})`,
  );
  return match.organizationMemberId;
}
```

**중요 — `searchMembers` 반환 객체**: `MemberSearchResponse.result: MemberDetail[]` 이고 `MemberDetail.id` 가 organizationMemberId. executor 가 phase 시작 시 정확 필드 확인:

```bash
grep -nE "interface MemberDetail|interface MemberSearchResponse" src/api/types.ts
```

**import 보강 필요**:
```ts
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
```

### 2. `src/resolvers/member.test.ts` — 단위 테스트 (총 6 케이스)

`DoorayApiClient` mock 으로 3 분기 검증 + edge case:

```ts
import { describe, it, expect, vi } from "vitest";
import { resolveMember } from "./member.js";
import type { DoorayApiClient } from "../api/client.js";

function mockClient(opts: {
  getMemberDetail?: (id: string) => Promise<any>;
  searchMembers?: (p: any) => Promise<any>;
  getProjectMembers?: (...args: any[]) => Promise<any>;
  ensureMembers?: any;
}): DoorayApiClient {
  return {
    getMemberDetail: opts.getMemberDetail ?? vi.fn(),
    searchMembers: opts.searchMembers ?? vi.fn(),
    getProjectMembers: opts.getProjectMembers ?? vi.fn().mockResolvedValue({ result: [], totalCount: 0 }),
  } as unknown as DoorayApiClient;
}

describe("resolveMember 입력 자동 분기", () => {
  it("19자리 숫자 → getMemberDetail 호출 후 input 반환", async () => {
    const id = "1234567890123456789";
    const client = mockClient({ getMemberDetail: vi.fn().mockResolvedValue({ result: { id, name: "X" } }) });
    expect(await resolveMember(client, "proj", id)).toBe(id);
  });
  it("19자리 숫자 + getMemberDetail 404 → DoorayCliError", async () => {
    const client = mockClient({ getMemberDetail: vi.fn().mockRejectedValue(new Error("404")) });
    await expect(resolveMember(client, "proj", "1234567890123456789")).rejects.toThrow();
  });
  it("이메일 형식 → searchMembers 1건 시 id 반환", async () => {
    const client = mockClient({
      searchMembers: vi.fn().mockResolvedValue({ result: [{ id: "9876543210987654321", name: "X" }], totalCount: 1 }),
    });
    expect(await resolveMember(client, "proj", "user@example.com")).toBe("9876543210987654321");
  });
  it("이메일 형식 + 0건 → DoorayCliError", async () => {
    const client = mockClient({ searchMembers: vi.fn().mockResolvedValue({ result: [], totalCount: 0 }) });
    await expect(resolveMember(client, "proj", "missing@example.com")).rejects.toThrow();
  });
  it("이메일 형식 + 2건 이상 → 모호 에러", async () => {
    const client = mockClient({
      searchMembers: vi.fn().mockResolvedValue({
        result: [{ id: "1", name: "A" }, { id: "2", name: "B" }],
        totalCount: 2,
      }),
    });
    await expect(resolveMember(client, "proj", "dup@example.com")).rejects.toThrow(/모호/);
  });
  it("이름 입력 (기존 matchByName 분기) → ensureMembers 경로 사용", async () => {
    const client = mockClient({
      getProjectMembers: vi.fn().mockResolvedValue({
        result: [{ organizationMemberId: "1234567890123456789" }],
        totalCount: 1,
      }),
      getMemberDetail: vi.fn().mockResolvedValue({ result: { name: "홍길동" } }),
    });
    // matchByName 까지 도달해야 — 본 케이스는 ensureMembers 호출 검증 위주
    // 실 매칭은 matchByName 의 단위 테스트가 별도로 커버
    await expect(resolveMember(client, "proj", "홍길동")).resolves.toBeDefined();
  });
});
```

**테스트 의존성 주의**: `ensureMembers` 가 cache (`getMembers`/`setMembers`) 를 호출 — mock 회피를 위해 `vi.mock("../cache/store.js")` 필요 또는 cache 무관 경로 (이메일/id 분기) 만 mock 으로 검증하는 게 안전. 이름 분기 1건은 기존 ensureMembers 흐름 통합 테스트로 갈음 (executor 가 phase 작성 시 cache mock 도입 여부 판단).

### 3. 인접 함수 영향 점검

```bash
# cwd: /Users/nhn/personal/dooray-cli
grep -rn "resolveMember\b" src/ | head -10
# 기대: 호출 사이트 — post create/edit, post-users.ts, comment add/edit 등
# 본 phase 는 본체만 변경, 호출 사이트 변경 0 (시그니처 유지)
```

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. tsc + build + test (CI 게이트 동일)
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
# 기대: 0
pnpm build && pnpm test
# 기대: exit 0

# 2. 분기 regex 정의 추가
grep -nE "MEMBER_ID_RE|EMAIL_RE" src/resolvers/member.ts
# 기대: 2줄 이상

# 3. getMemberDetail / searchMembers 호출 추가
grep -cnE "getMemberDetail\(|searchMembers\(" src/resolvers/member.ts
# 기대: 2 이상 (각 1회 호출)

# 4. 단위 테스트 케이스
grep -cE "^\s*it\(" src/resolvers/member.test.ts
# 기대: 6

# 5. 시그니처 보존 — resolveMember 가 string 반환 (Promise<string>)
grep -nE "export async function resolveMember.*Promise<string>" src/resolvers/member.ts
# 기대: 1줄
```

## 작업 외 금지

- `resolveMember` 의 호출 사이트 변경 금지 (시그니처 보존)
- `matchByName` / `ensureMembers` 본체 변경 금지
- 새 API 메서드 (`client.*`) 추가 금지 (기존 `getMemberDetail`/`searchMembers` 재사용)
- README / SKILL.md 갱신 금지 — phase-02
- ADR / planning docs 변경 금지 (planning 단계에서 `782543b` 으로 반영됨)

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/029-feat-member-resolver-email-id
git add src/resolvers/member.ts src/resolvers/member.test.ts
git commit -m "feat(resolvers): resolveMember 입력 자동 분기 (email / memberId / name)

Issue #58 (phase 1/2):
- 19자리 숫자 → getMemberDetail 로 존재 검증 후 그대로 사용
- 이메일 (정규형 매칭) → searchMembers({externalEmailAddresses}) exact
- 그 외 → 기존 matchByName (이름 부분일치)

시그니처 (Promise<string>) 보존 — 호출 사이트 (--to/--cc/--mention, post-users.ts) 변경 0.
6 unit tests (mock 기반 3 분기 + edge case)."
```
