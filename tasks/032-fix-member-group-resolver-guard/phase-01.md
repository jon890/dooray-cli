# Phase 01 — match.ts 가드 + member-group.ts adapter + 타입 완화 + 테스트 + docs

## 컨텍스트

Issue #65: `dooray post edit --cc-group "team-name/sub-team"` 호출 시 `Cannot read properties of undefined (reading 'includes')` 로 추락.

**진짜 원인** (코드 분석 결과):
- `src/resolvers/match.ts:33` — `i.name.includes(input)` 에서 `i.name` 이 undefined
- `src/resolvers/member-group.ts:42` — adapter 가 `{name: g.code}` 형태. 일부 응답 그룹의 `g.code` 가 undefined.

**cmux-browser spike (2026-05-18)** 결과 공식 API 스키마는 `code: string` (required) 이지만 실제 응답에서 누락 — ADR-026 wiki 함정과 동일한 mismatch. 슬래시 자체는 무관 (`"a/b".includes("a")` 정상).

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only
```

기대 결과 (총 5 파일 — planning docs 는 별도 commit 으로 선반영):
```
src/resolvers/match.ts                              (수정 — 가드 + helpHint + 후보 출력)
src/resolvers/member-group.ts                       (수정 — adapter 필터 + helpHint 전달)
src/api/types.ts + src/cache/types.ts               (수정 — MemberGroup.code / CachedMemberGroup.code optional)
src/resolvers/match.test.ts                         (신규 — 가드/후보/helpHint 케이스)
tasks/032-fix-member-group-resolver-guard/index.json (완료 마킹)
```

**planning docs (CLAUDE.md / docs/adr.md / docs/code-architecture.md) 는 task 생성 시점에 별도 commit 으로 선반영** — planning SKILL 의 "갱신 시점 분리" 룰 준수. phase 안에서 추가 변경 금지.

## 작업 항목 (5개 이하)

### 1. `src/resolvers/match.ts` — 가드 + helpHint 옵션 + not-found 후보 출력

#### 1.1 시그니처 확장

```ts
export function matchByName<T extends NameRecord>(
  items: T[],
  input: string,
  label: string,
  renderCandidate: (item: T) => string,
  options?: { helpHint?: string },
): T
```

#### 1.2 line 33 가드

```ts
// before
const partial = items.filter((i) => i.name.includes(input));
// after
const partial = items.filter((i) => i.name?.includes(input) ?? false);
```

`name` 이 string 이 아닌 경우 (undefined/null) 는 매칭 후보에서 제외.

#### 1.3 not-found 메시지 (line 43~46)

```ts
const SAMPLE_LIMIT = 5;
const sampleLines = items
  .slice(0, SAMPLE_LIMIT)
  .map((i) => `  - ${renderCandidate(i)}`)
  .join("\n");
const hint = options?.helpHint
  ? `\n전체 목록: ${options.helpHint}`
  : "";
const counter = items.length > 0
  ? `\n사용 가능한 ${label} (${Math.min(SAMPLE_LIMIT, items.length)}/${items.length}):\n${sampleLines}`
  : "";
throw new DoorayCliError(
  `${label}을(를) 찾을 수 없습니다: ${input}${counter}${hint}`,
  EXIT_PARAM_ERROR,
);
```

items 가 빈 배열이면 counter 도 hint 도 출력하지 않음 (현재 메시지 그대로).

### 2. `src/resolvers/member-group.ts` — adapter 사전 필터 + helpHint 전달

```ts
export async function resolveMemberGroup(
  client: DoorayApiClient,
  projectId: string,
  input: string,
): Promise<{ id: string; code: string }> {
  const groups = await ensureMemberGroups(client, projectId);
  const valid = groups.filter((g) => typeof g.code === "string" && g.code.length > 0);
  const skipped = groups.length - valid.length;
  if (skipped > 0) {
    process.stderr.write(
      `⚠  ${skipped}개 그룹에 code 가 없어 매칭에서 제외했습니다 (Dooray API 응답 mismatch — ADR-026).\n`,
    );
  }
  const adapter = valid.map((g) => ({ name: g.code, id: g.id, code: g.code }));
  const match = matchByName(
    adapter,
    input,
    "그룹",
    (g) => `${g.code} (${g.id})`,
    { helpHint: "dooray project groups <project>" },
  );
  return { id: match.id, code: match.code };
}
```

### 3. `src/api/types.ts` — `MemberGroup.code` optional 완화

```ts
export interface MemberGroup {
  id: string;
  code?: string;  // ← optional 로 변경 (실제 API 가 누락 케이스 — ADR-026)
  project: ProjectInfo;
  createdAt: string;
  updatedAt: string;
}
```

`CachedMemberGroup.code` 도 동일 (`src/cache/types.ts` line 58) — `code?: string` 으로 완화. resolver/cache 둘 다 일관.

### 4. `src/resolvers/match.test.ts` — vitest 단위 테스트 (신규)

```ts
import { describe, it, expect } from "vitest";
import { matchByName } from "./match.js";
import { DoorayCliError } from "../utils/errors.js";

interface TestItem { name: string; id: string; }
const render = (i: TestItem) => `${i.name} (${i.id})`;

describe("matchByName", () => {
  it("정확일치 1건 반환", () => {
    const items: TestItem[] = [{ name: "foo", id: "1" }, { name: "bar", id: "2" }];
    expect(matchByName(items, "foo", "그룹", render).id).toBe("1");
  });

  it("name 이 undefined 인 항목은 매칭에서 제외 (가드)", () => {
    // @ts-expect-error — 의도적 undefined 주입 (실제 API 응답 시뮬레이션)
    const items: TestItem[] = [{ name: undefined, id: "1" }, { name: "foo", id: "2" }];
    expect(matchByName(items, "foo", "그룹", render).id).toBe("2");
  });

  it("not-found 시 후보 5개 + 전체 수 + helpHint 출력", () => {
    const items: TestItem[] = Array.from({ length: 7 }, (_, i) => ({ name: `g${i}`, id: `${i}` }));
    try {
      matchByName(items, "missing", "그룹", render, { helpHint: "dooray project groups <project>" });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(DoorayCliError);
      const msg = (e as DoorayCliError).message;
      expect(msg).toContain("그룹을(를) 찾을 수 없습니다: missing");
      expect(msg).toContain("사용 가능한 그룹 (5/7):");
      expect(msg).toContain("전체 목록: dooray project groups <project>");
    }
  });

  it("items 빈 배열은 후보/hint 없이 기본 not-found", () => {
    try {
      matchByName([], "x", "그룹", render, { helpHint: "..." });
    } catch (e) {
      const msg = (e as DoorayCliError).message;
      expect(msg).toBe("그룹을(를) 찾을 수 없습니다: x");
    }
  });
});
```

### 5. index.json 완료 마킹

phase 작업 완료 후:

```bash
# cwd: /Users/nhn/personal/dooray-cli
sed -i '' 's/"status": "pending"/"status": "completed"/g' tasks/032-fix-member-group-resolver-guard/index.json
grep -c '"status": "completed"' tasks/032-fix-member-group-resolver-guard/index.json
# 기대: 2 (index + phase)
```

## code-review-pitfalls 회피 항목

- **1-1 (validation 전 spinner)**: 본 phase 는 spinner 추가 없음 — N/A
- **1-2 (spinner leak)**: N/A
- **2-2 (catch 분기)**: `resolveMemberGroup` 의 stderr warn 은 catch 가 아니라 사전 필터 — non-fatal. `matchByName` 가 not-found 일 때 throw 는 기존 동작 그대로
- **3-3 (테스트 mock mirror)**: `match.test.ts` 는 pure function 단위 테스트 — mock 불요
- **4-1 (sed self-referential)**: docs 변경은 ADR-026 본문 끝에 새 줄 1줄 추가 — sed 사용 안 함

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. tsc + build + test
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
# 기대: 0
pnpm build && pnpm test
# 기대: exit 0

# 2. 가드 적용
grep -nE "i\.name\?\.includes" src/resolvers/match.ts
# 기대: 1줄

# 3. helpHint 옵션
grep -nE "helpHint" src/resolvers/match.ts src/resolvers/member-group.ts
# 기대: 3건 이상 (signature + 사용 + 호출)

# 4. adapter 필터
grep -nE "typeof g\.code === \"string\"" src/resolvers/member-group.ts
# 기대: 1줄

# 5. 타입 완화
grep -nE "^\s+code\?\: string" src/api/types.ts src/cache/types.ts
# 기대: 2줄

# 6. 신규 테스트 통과
pnpm test src/resolvers/match.test.ts 2>&1 | grep -E "Test Files|passed"
# 기대: passed 4

# 7. index.json 완료 마킹
grep -c '"status": "completed"' tasks/032-fix-member-group-resolver-guard/index.json
# 기대: 2 (index + phase)

# 9. 동작 실증 (사용자 환경 — 옵션)
node dist/index.js post edit --id <postId> --body-file <path> --cc-group "team-name/sub-team"
# 기대: 정상 동작 또는 후보 5개 + 안내 메시지 출력 (이전: undefined 추락)
```

## 작업 외 금지

- 다른 호출자 (`tag.ts` / `template.ts` / `workflow.ts`) 에 `helpHint` 전달 추가 금지 — 본 task scope 는 #65 회피 한정. 후속 외과적 변경
- 신규 ADR 작성 금지 — ADR-026 한 줄 확장만 (사용자 결정)
- API 스키마 자체 변경 시도 금지 — Dooray 측 책임
- planning docs (prd.md / flow.md / data-schema.md) 변경 금지 — 사용자 흐름 / 스키마 / MVP 범위 영향 없음

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: fix/032-member-group-resolver-guard
git add src/resolvers/match.ts src/resolvers/member-group.ts \
        src/api/types.ts src/cache/types.ts \
        src/resolvers/match.test.ts \
        CLAUDE.md docs/adr.md docs/code-architecture.md \
        tasks/032-fix-member-group-resolver-guard/index.json
git commit -m "$(cat <<'EOF'
fix(resolvers): guard undefined name + add helpHint to matchByName (Issue #65)

- match.ts: i.name?.includes 가드 + helpHint 옵션 + not-found 후보 5개 출력
- member-group.ts: adapter 가 code 누락 그룹 사전 필터 + helpHint 전달
- types.ts / cache/types.ts: MemberGroup.code optional 완화 (실제 API mismatch)
- match.test.ts 신규 (4 케이스)
- docs: CLAUDE.md / adr.md (ADR-026 확장) / code-architecture.md 갱신
EOF
)"
```
