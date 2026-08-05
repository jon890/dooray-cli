# Phase 01 — fetchAllMemberGroups flatten + resolveMemberGroup id 분기 + 메시지 정정 + AI agent 동선 docs + 단위 테스트

## 컨텍스트

Issue #76 — `--cc-group` / `--mention-group` 매칭 전면 실패. `dooray project groups <project>` 표가 모든 컬럼 빈값.

**실측으로 발견한 진짜 root cause** (2026-05-22, ADR-028 전면 개정):
- Dooray API `GET /project/v1/projects/{id}/member-groups` 응답이 **nested array** (`result: [[g1, g2]]`) 로 반환
- `fetchAllMemberGroups:13` 의 `for (const g of res.result)` 가 평면 배열 가정 → `g` 가 배열이 되어 `g.id`, `g.code` 모두 undefined → cache 에 빈 객체로 저장
- 구 ADR-028 의 "일부 그룹만 code 누락" 가정은 증상만 본 진단. 실제로는 **모든 그룹이 빈 객체** 가 되는 사고

**3종 fix 동시 적용**:
- **C. 응답 정규화** — `fetchAllMemberGroups` 에 `res.result.flat()` 추가 (root cause fix)
- **A. 메시지 정정** — stderr 경고 `ADR-026` → `ADR-028` + AI 친화 helpHint
- **B2. id 직접 입력 fallback** — numeric 15+자리 → id 직접 매칭 (response shape 가 다시 변할 robustness)

코드 컨텍스트:
- `src/resolvers/member-group.ts:7-21` — `fetchAllMemberGroups` (응답 평면 가정)
- `src/resolvers/member-group.ts:34-61` — `resolveMemberGroup` (matchByName 만)
- `src/resolvers/member.ts:9` — `MEMBER_ID_RE = /^\d{15,}$/` 동일 정규식 재사용
- `src/api/types.ts` — `MemberGroup` 타입 / `MemberGroupListResponse`
- 5 호출자 (commands/post/{create,edit}.ts + commands/post/comment/{add,edit}.ts + resolvers/post-users.ts) 시그니처 불변

## 변경 파일 (정확)

기대 결과 (총 5 파일):
```
src/resolvers/member-group.ts                          (수정 — flatten + id 분기 + 메시지 정정)
src/resolvers/member-group.test.ts                     (신규 — 5+ 케이스)
README.md                                              (수정 — group cc/mention 사용 예 + id 입력)
skills/dooray-cli/SKILL.md                             (수정 — group resolver 표 + AI agent 동선 섹션 신설)
tasks/038-fix-member-group-response-shape/index.json   (완료 마킹)
```

**planning docs (CLAUDE.md / docs/adr.md / docs/code-architecture.md) 는 task 생성 시점에 main 직접 commit 으로 선반영** — phase 안에서 추가 변경 금지.

## 작업 항목 (5개 이하)

### 1. `src/resolvers/member-group.ts` — flatten + id 분기 + 메시지 정정

```ts
const GROUP_ID_RE = /^\d{15,}$/;  // resolveMember 의 MEMBER_ID_RE 와 동일 패턴

async function fetchAllMemberGroups(client: DoorayApiClient, projectId: string): Promise<CachedMemberGroup[]> {
  const all: CachedMemberGroup[] = [];
  let page = 0;
  const size = RESOLVER_FETCH_PAGE_SIZE;
  while (true) {
    const res = await client.getProjectMemberGroups(projectId, { page, size });
    // ADR-028: Dooray API 가 nested array (`result: [[g1, g2]]`) 로 반환 — flatten 필수
    // 1 레벨만 평면화. 평면 응답에도 안전 (이미 평면이면 flat() 무동작 — 멱등)
    const groups = (res.result as unknown as MemberGroup[][] | MemberGroup[]).flat() as MemberGroup[];
    for (const g of groups) {
      all.push({ id: g.id, code: g.code });
    }
    const total = res.totalCount ?? all.length;
    if (all.length >= total) break;
    page++;
  }
  return all;
}

export async function resolveMemberGroup(
  client: DoorayApiClient,
  projectId: string,
  input: string,
): Promise<{ id: string; code: string }> {
  const groups = await ensureMemberGroups(client, projectId);

  // 1. id 직접 입력 (numeric 15+자리) — code 누락 그룹도 매칭, response shape robustness
  if (GROUP_ID_RE.test(input)) {
    const found = groups.find((g) => g.id === input);
    if (found) {
      return { id: found.id, code: found.code ?? "" };
    }
    throw new DoorayCliError(
      `그룹 id 를 찾을 수 없습니다: "${input}"\n` +
      `전체 목록은 \`dooray project groups <project>\` 로 확인하세요.`,
      EXIT_PARAM_ERROR,
    );
  }

  // 2. code 매칭 흐름 (기존)
  const valid = groups.filter(hasValidCode);
  const skipped = groups.length - valid.length;
  if (skipped > 0) {
    process.stderr.write(
      // ADR 번호 정정: ADR-026 → ADR-028
      `⚠  ${skipped}개 그룹에 code 가 없어 매칭에서 제외했습니다 (ADR-028).\n` +
      `   id 직접 입력 (15+자리 numeric) 또는 UI 수동 cc / \`--cc <member>\` 우회 가능.\n`,
    );
  }
  const adapter = valid.map((g) => ({ name: g.code, id: g.id, code: g.code }));
  const match = matchByName(adapter, input, "그룹", (g) => `${g.code} (${g.id})`, {
    helpHint:
      "전체 목록: `dooray project groups <project>` / " +
      "id 직접 입력도 가능 (15+자리 numeric — code 누락 그룹도 매칭, ADR-028)",
  });
  return { id: match.id, code: match.code };
}
```

**주의 사항**:
- `MemberGroup` 타입 import 추가 (`src/api/types.ts`)
- `DoorayCliError`, `EXIT_PARAM_ERROR` import 추가
- 타입 캐스팅 `as unknown as ... | ...` — Dooray API 의 런타임 shape mismatch 흡수. ADR-028 본문에 의도 명시
- `flat()` 멱등성 — 평면 응답에도 무동작이라 정상 / 비정상 응답 양쪽 안전
- 빈 string code 반환 — `post-users.ts` 의 group payload 는 `projectMemberGroupId: g.id` 만 사용해 영향 없음 (작업 항목 3 에서 검증)

### 2. `src/resolvers/member-group.test.ts` — 단위 테스트 5+ 케이스

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// fixture: 정규화 후 평면 (cache 거친 상태)
const fixtureGroups = [
  { id: "1111222233334444555", code: "all" },
  { id: "2222333344445555666", code: "개발" },
  { id: "3333444455556666777", code: undefined },
  { id: "4444555566667777888", code: "" },
];

vi.mock("./member-group.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./member-group.js")>();
  return { ...mod, ensureMemberGroups: vi.fn(() => Promise.resolve(fixtureGroups)) };
});

import { resolveMemberGroup } from "./member-group.js";

describe("resolveMemberGroup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("code 부분일치 — 한글 code", async () => {
    const result = await resolveMemberGroup({} as any, "p1", "개발");
    expect(result).toEqual({ id: "2222333344445555666", code: "개발" });
  });

  it("id 직접 입력 — 정상 그룹", async () => {
    const result = await resolveMemberGroup({} as any, "p1", "1111222233334444555");
    expect(result).toEqual({ id: "1111222233334444555", code: "all" });
  });

  it("id 직접 입력 — code 누락 그룹도 매칭 (response shape robustness)", async () => {
    const result = await resolveMemberGroup({} as any, "p1", "3333444455556666777");
    expect(result.id).toBe("3333444455556666777");
    expect(result.code).toBe("");
  });

  it("id 매칭 실패 — 친절한 안내", async () => {
    await expect(resolveMemberGroup({} as any, "p1", "9999999999999999999"))
      .rejects.toThrow(/그룹 id 를 찾을 수 없습니다.*dooray project groups/);
  });

  it("code 매칭 실패 시 helpHint 에 id 입력 안내 포함", async () => {
    await expect(resolveMemberGroup({} as any, "p1", "존재하지않는code"))
      .rejects.toThrow(/dooray project groups|id 직접 입력/);
  });
});
```

**추가 테스트 — `fetchAllMemberGroups` flatten 멱등성**:

`fetchAllMemberGroups` 가 export 안 되어 있다면 `ensureMemberGroups` 로 간접 검증. 또는 internal export 추가 (테스트 전용). 두 응답 shape 모두 통과:

```ts
describe("fetchAllMemberGroups response shape normalization", () => {
  it("nested array 응답을 flatten 해서 처리", async () => {
    // mock client.getProjectMemberGroups → res.result: [[g1, g2]]
    // expect: cache 에 [{id: "a", code: "x"}, {id: "b", code: "y"}] 저장
  });

  it("평면 배열 응답도 정상 처리 (멱등성)", async () => {
    // mock client.getProjectMemberGroups → res.result: [g1, g2]
    // expect: 동일 결과
  });
});
```

executor 가 기존 `post-users.test.ts` mock 패턴 답습. mock 정확도가 어렵다면 통합 테스트 (실 API 호출) 대신 단위 테스트의 fixture 만으로 충분 — 핵심은 `resolveMemberGroup` 의 id 분기 / matchByName 흐름 검증.

### 3. `post-users.ts` group payload 영향 확인

`resolveMemberGroup` 반환 타입 / 시그니처 불변 → 호출자 영향 0. 확인용 grep:

```bash
grep -nE "resolveMemberGroup\(" src/ | grep -v "\.test\.ts\|member-group.ts"
# 기대: 5 호출자 모두 `resolveMemberGroup(client, projectId, input)`

# 그룹 반환값의 .code 사용 여부
grep -nE "\.code" src/resolvers/post-users.ts | grep -iE "group|cc|to"
# 기대: payload 생성에 .code 사용 없음 (projectMemberGroupId: g.id 만)
```

### 4. README + skills/dooray-cli/SKILL.md — 사용 예 + AI agent 동선

#### README.md — `### 참조자(cc) / 담당자(to) 변경` 섹션 내 group 옵션 직후

```markdown
**그룹 cc / mention 사용 예 (Issue #76 fix)**:

```bash
# code 부분일치
dooray post create <project> ... --cc-group "개발"

# code 정확 일치
dooray post create <project> ... --mention-group "all"

# 19자리 id 직접 입력 (response shape robustness 또는 code 누락 그룹 회피)
dooray post create <project> ... --cc-group "<19자리 group id>"

# 후보 탐색
dooray project groups <project>
```
```

#### skills/dooray-cli/SKILL.md — 빠른 참조 표 + AI agent 동선 섹션 신설

**빠른 참조 표 갱신** (line 111-113 근처):

```markdown
| `--cc-group <code\|id>` / `--mention-group <code\|id>` | 그룹 매칭 — 15+자리 numeric → id 직접 / 그 외 → code matchByName (부분일치, ADR-028) |
```

**신규 섹션 — `## 멘션·링크 자동 삽입 (first-class)` 직후**:

```markdown
## 그룹 멘션 / cc 시 AI agent 동선 (Issue #76, ADR-028)

자연어 그룹명을 사용자가 지칭했을 때 AI agent 의 의사결정 순서:

1. **사용자가 명확한 code 를 줬으면 바로 시도**
   ```bash
   dooray post create <project> --mention-group "<code>"
   ```
   부분일치 가능 (예: "AI-Data" → "AI-Data파트" 매칭).

2. **부분일치 모호 / 매칭 실패 시 후보 탐색**
   ```bash
   dooray project groups <project>
   ```
   ID + Code 표 출력. AI agent 가 자연어 의도와 가장 가까운 code 선택 후 재시도.

3. **모든 컬럼이 빈값일 때 (response shape 이상) 회피**
   - ADR-028 fix 이후 거의 발생 안 함 (`fetchAllMemberGroups` 가 nested array 정규화)
   - 만약 발생 시: 사용자에게 그룹 id (UI 의 그룹 URL 에서 19자리 numeric) 확인 요청
   - `--cc-group <id>` / `--mention-group <id>` 직접 입력
   - 또는 그룹 멤버를 개별 `--cc <member>` / `--mention <member>` 로 지정

4. **모호한 자연어 매핑은 사용자에게 확인**
   - 후보가 여러 개일 때 임의 선택 금지 — 사용자에게 선택지 제시
   - 예: "AI-Data파트 / AI-Data실험팀 — 어느 그룹인가요?"

순서 고정 — 멤버 먼저, 그룹 다음 (기존 정책 유지).
```

### 5. 빌드 + 실증 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli

pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
# 기대: 0
pnpm build && pnpm test
# 기대: exit 0 (5+ 케이스 통과)

# 실증 1: <project> 그룹 정상 표시 (fix 의 핵심 효과)
node dist/index.js cache clear  # 또는 ~/.dooray/cache/member-groups/<projectId>.json 삭제
node dist/index.js project groups <project>
# 기대: ID + Code 컬럼에 모두 값 표시
#   1111222233334444555  all
#   2222333344445555666  개발

# 실증 2: 자연어 그룹 멘션
node dist/index.js post create <project> --title "테스트" --mention-group "개발" --dry-run --json
# 기대: dry-run JSON 에 멘션 prepend 결과 + group resolve 성공

# 실증 3: id 직접 입력
node dist/index.js post create <project> --title "테스트" --mention-group "2222333344445555666" --dry-run --json
# 기대: 동일 결과 (id 매칭 흐름)
```

## code-review-pitfalls 회피 항목

- **1-x (spinner 순서)**: resolver 함수 수정 — spinner 호출 없음
- **2-x (catch 분기)**: id 매칭 실패는 `DoorayCliError` throw — 호출자 상위 catch (기존 패턴)
- **3-3 (테스트 mock mirror)**: 기존 `post-users.test.ts` / `member.test.ts` 패턴 답습
- **4-x (외과적 변경)**: `resolveMemberGroup` + `fetchAllMemberGroups` 만 수정. 시그니처 불변, 5 호출자 영향 0
- **타입 캐스팅 안전성**: `as unknown as MemberGroup[][] | MemberGroup[]` 은 unsafe cast 처럼 보이나 — Dooray 런타임 shape mismatch 흡수 의도. ADR-028 본문 명시 + 단위 테스트가 두 shape 모두 검증
- **id 입력 우선순위**: code 가 19자리 numeric 인 사용자가 있다면 id 로 오해석. 현실적 발생 불가 (code 는 alphanumeric/한글). ADR-028 trade-off 명시

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
pnpm build && pnpm test
# 둘 다 exit 0

grep -nE "\.flat\(\)" src/resolvers/member-group.ts
# 기대: 1줄 이상

grep -nE "GROUP_ID_RE|/\^\\\\d\{15,\}\$/" src/resolvers/member-group.ts
# 기대: 1줄 이상

grep -cE "ADR-026" src/resolvers/member-group.ts
# 기대: 0
grep -cE "ADR-028" src/resolvers/member-group.ts
# 기대: 1 이상

grep -c "그룹 멘션 / cc 시 AI agent 동선" skills/dooray-cli/SKILL.md
# 기대: 1

grep -cE "resolveMemberGroup\(client, projectId, " src/
# 기대: 5

# 실증
node dist/index.js cache clear 2>/dev/null || true
node dist/index.js project groups <project> | grep -E "[0-9]{10,}|개발|all"
# 기대: 값이 출력됨 (빈 컬럼 아님)
```

## 작업 외 금지

- planning docs (CLAUDE.md / docs/adr.md / docs/code-architecture.md) 변경 금지 — task 생성 시점 main commit 으로 반영됨
- `resolveMemberGroup` / `fetchAllMemberGroups` 의 시그니처 / 반환 타입 변경 금지
- `CachedMemberGroup` 타입 변경 금지 — cache 스키마 불변
- 새 ADR 추가 금지 — ADR-028 전면 개정만
- API client (`client.ts`) 변경 금지 — 정규화는 resolver 단에서 (raw HTTP 래퍼 원칙)
- 다른 resolver 동작 변경 금지

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: fix/038-fix-member-group-response-shape (main 에서 분기)
git add src/resolvers/member-group.ts src/resolvers/member-group.test.ts \
        README.md skills/dooray-cli/SKILL.md \
        tasks/038-fix-member-group-response-shape/index.json
git commit -m "$(cat <<'EOF'
fix(resolvers): unwrap nested member-group response + id direct input fallback (Issue #76, ADR-028)

진짜 root cause: Dooray API `GET .../member-groups` 가 nested array
(`result: [[g1, g2]]`) 로 반환되는데 fetchAllMemberGroups 가 평면 가정으로
처리해 모든 그룹이 빈 객체로 cache 되는 사고. 구 ADR-028 의 'code 누락
사전 필터' 진단은 증상만 본 것 — 전면 개정.

3종 fix 동시 적용:
- C. fetchAllMemberGroups 에 `res.result.flat()` 정규화 (root cause fix)
- A. stderr 경고 ADR 번호 오기 (ADR-026 → ADR-028) 정정 + AI 친화 helpHint
- B2. resolveMemberGroup 의 numeric 15+자리 → id 직접 매칭 fallback
  (response shape 가 다시 변할 robustness)

- 단위 테스트 5+ 케이스 (nested 정규화 / code 매칭 / id 매칭 / code 누락
  그룹 id 매칭 / 매칭 실패 안내)
- README: 그룹 cc/mention 사용 예 + id 입력 안내
- skills/dooray-cli/SKILL.md: 그룹 멘션 AI agent 동선 섹션 신설
- 5 호출자 시그니처 불변 → 자동 혜택

closes #76
EOF
)"
```
