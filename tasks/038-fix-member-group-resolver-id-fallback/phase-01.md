# Phase 01 — resolveMemberGroup id 분기 + 메시지 정정 + 단위 테스트 + README/SKILL 한 줄

## 컨텍스트

Issue #76 — 프로젝트 전체 그룹이 `code` 누락 상태일 때 `--cc-group` / `--mention-group` 입력이 모두 매칭 실패. ADR-028 의 silent skip 자체는 정당하나 사용자에게 회피 동선 부재.

**확인된 사실 (planning 단계 실측, 2026-05-22)**:
- 공식 spec / 실제 API 응답 둘 다 MemberGroup 에 `name` 필드 부재 → name fallback 불가
- 정상 그룹은 `{id, code, project, createdAt, updatedAt}` 만 응답. id 는 항상 채워짐
- `resolveMember` 가 이미 동일 패턴 (15자리 numeric → id 직접) 보유. mirror

**결정 (사용자 확정, 2026-05-22)**:
- A. stderr 메시지의 ADR 번호 정정 (`ADR-026` → `ADR-028`)
- B2. 입력 numeric 15+자리 → id 직접 매칭 (code 누락 그룹도 매칭 후보)
- 매칭 실패 stderr 안내에 "id 직접 입력 가능" 추가
- 단위 테스트 신설 (`member-group.test.ts`)

코드 컨텍스트:
- `src/resolvers/member-group.ts:34-61` — 현재 `resolveMemberGroup` (code 매칭만)
- `src/resolvers/member.ts:9` — `MEMBER_ID_RE = /^\d{15,}$/` 동일 정규식 재사용 (또는 별도 GROUP_ID_RE 신설)
- `src/resolvers/member.ts:106-115` — id 분기 패턴 mirror 기준
- `src/resolvers/match.ts` — `helpHint` 옵션 (변경 없음, 기존 사용)
- 5 호출자 (commands/post/{create,edit}.ts + commands/post/comment/{add,edit}.ts + resolvers/post-users.ts) — `resolveMemberGroup(client, projectId, input)` 호출 시그니처 불변 → 호출자 코드 변경 0

## 변경 파일 (정확)

기대 결과 (총 5 파일):
```
src/resolvers/member-group.ts                                    (수정 — id 분기 + 메시지 정정)
src/resolvers/member-group.test.ts                               (신규 — 4 케이스: id 매칭 / code 매칭 / code 누락 그룹 id 매칭 / 전부 실패 안내)
README.md                                                        (수정 — group cc 사용 예에 id 입력 한 줄)
skills/dooray-cli/SKILL.md                                       (수정 — group resolver 표에 id 입력 fallback 1줄)
tasks/038-fix-member-group-resolver-id-fallback/index.json       (완료 마킹)
```

**planning docs (CLAUDE.md / docs/adr.md / docs/code-architecture.md) 는 task 생성 시점에 main 직접 commit 으로 선반영** — phase 안에서 추가 변경 금지.

## 작업 항목 (5개 이하)

### 1. `src/resolvers/member-group.ts` — id 분기 + 메시지 정정

```ts
const GROUP_ID_RE = /^\d{15,}$/;  // resolveMember 의 MEMBER_ID_RE 와 동일 패턴 — 의도된 mirror

export async function resolveMemberGroup(
  client: DoorayApiClient,
  projectId: string,
  input: string,
): Promise<{ id: string; code: string }> {
  const groups = await ensureMemberGroups(client, projectId);

  // 1. id 직접 입력 (numeric 15+자리) — code 누락 그룹도 매칭 후보 (Issue #76)
  if (GROUP_ID_RE.test(input)) {
    const found = groups.find((g) => g.id === input);
    if (found) {
      // code 누락 그룹도 매칭 — return 시 code 는 빈 문자열 (호출자 side-effect 없음, payload 에는 id 만 사용)
      return { id: found.id, code: found.code ?? "" };
    }
    throw new DoorayCliError(
      `그룹 id 를 찾을 수 없습니다: "${input}"\n전체 목록은 \`dooray project groups <project>\` 로 확인하세요.`,
      EXIT_PARAM_ERROR,
    );
  }

  // 2. code 매칭 흐름 (기존)
  const valid = groups.filter(hasValidCode);
  const skipped = groups.length - valid.length;
  if (skipped > 0) {
    process.stderr.write(
      // ADR 번호 정정: ADR-026 → ADR-028
      `⚠  ${skipped}개 그룹에 code 가 없어 매칭에서 제외했습니다 (Dooray API 응답 mismatch — ADR-028).\n` +
      `   id 직접 입력 (15+자리 numeric) 또는 UI 수동 cc / \`--cc <member>\` 우회 가능.\n`,
    );
  }
  const adapter = valid.map((g) => ({ name: g.code, id: g.id, code: g.code }));
  const match = matchByName(adapter, input, "그룹", (g) => `${g.code} (${g.id})`, {
    helpHint: "dooray project groups <project> — id 직접 입력 (15+자리 numeric) 가능",
  });
  return { id: match.id, code: match.code };
}
```

**주의 사항**:
- import 추가: `DoorayCliError`, `EXIT_PARAM_ERROR` (이미 없으면)
- `code ?? ""` 빈 문자열 return — `post-users.ts` 가 group payload 생성 시 `projectMemberGroupId: g.id` 만 쓰므로 code 빈값 무영향 (확인 필요)

### 2. `src/resolvers/member-group.test.ts` — 4 단위 테스트

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveMemberGroup } from "./member-group.js";

// ensureMemberGroups mock — fixture 4 그룹: 정상 2 + code 누락 2
const fixtureGroups = [
  { id: "1111222233334444555", code: "normal-a" },
  { id: "2222333344445555666", code: "normal-b" },
  { id: "3333444455556666777", code: undefined },        // code 누락
  { id: "4444555566667777888", code: "" },                // code 빈 문자열
];

vi.mock("./member-group.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./member-group.js")>();
  return { ...mod, ensureMemberGroups: vi.fn(() => Promise.resolve(fixtureGroups)) };
});

describe("resolveMemberGroup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("code 매칭 — 정상 흐름", async () => {
    const result = await resolveMemberGroup({} as any, "p1", "normal-a");
    expect(result).toEqual({ id: "1111222233334444555", code: "normal-a" });
  });

  it("id 직접 입력 — 정상 그룹", async () => {
    const result = await resolveMemberGroup({} as any, "p1", "2222333344445555666");
    expect(result).toEqual({ id: "2222333344445555666", code: "normal-b" });
  });

  it("id 직접 입력 — code 누락 그룹도 매칭 (Issue #76 핵심)", async () => {
    const result = await resolveMemberGroup({} as any, "p1", "3333444455556666777");
    expect(result.id).toBe("3333444455556666777");
    expect(result.code).toBe("");  // code 누락 → 빈 문자열
  });

  it("id 매칭 실패 — 친절한 안내", async () => {
    await expect(resolveMemberGroup({} as any, "p1", "9999999999999999999"))
      .rejects.toThrow(/그룹 id 를 찾을 수 없습니다.*dooray project groups/);
  });
});
```

`ensureMemberGroups` mock 방식이 실제 호출 구조와 다를 수 있음 — executor 는 기존 `src/resolvers/post-users.test.ts` 의 mock 패턴 참조해 동등하게 구현. 필요시 `vi.spyOn` 으로 모듈 export 직접 대체.

### 3. `post-users.ts` group payload 영향 확인

`resolveMemberGroup` return type 의 `code` 가 빈 문자열일 수 있음. 호출자 영향 점검:

```bash
grep -nE "resolveMemberGroup\(" src/ | grep -v "\.test\.ts\|member-group.ts"
# 5 호출자 모두 — 반환값의 `code` 를 사용하는지 / `id` 만 사용하는지 확인
```

`post-users.ts:66` 의 group payload 생성:
```ts
// 기대: type: "group", projectMemberGroupId: g.id 만 사용. code 는 안 씀
```

`code` 가 빈 문자열이라도 payload 에 영향 없음을 코드로 확인 + 단위 테스트로 보장. 만약 code 를 어딘가 사용한다면 그 호출자가 `code === ""` 케이스를 graceful 하게 다루는지 추가 검증.

### 4. README + skills/dooray-cli/SKILL.md — id 입력 한 줄

#### README.md — `### 참조자(cc) / 담당자(to) 변경` 섹션 내 group 옵션 설명 직후

```markdown
**그룹 cc / mention — code 누락 시 id 직접 입력** (Issue #76):

```bash
# 일반 (code 매칭)
dooray post create <project> ... --cc-group "<code>"

# code 누락 그룹은 19자리 id 직접 입력
dooray post create <project> ... --cc-group "<19자리 group id>"

# id 는 `dooray project groups <project>` 로 확인
```
```

#### skills/dooray-cli/SKILL.md — group resolver 빠른 참조 표 행 갱신

```markdown
| `--cc-group <code\|id>` / `--mention-group <code\|id>` | 그룹 매칭 — 15+자리 numeric → id 직접 / 그 외 → code matchByName (ADR-028) |
```

### 5. 빌드 + 동작 실증

```bash
# cwd: /Users/nhn/personal/dooray-cli

# tsc + build + test
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
# 기대: 0
pnpm build && pnpm test
# 기대: exit 0 (4 케이스 통과)

# id 직접 입력 동작 확인 (실증)
# 정상 그룹 id 로 시도
node dist/index.js post create <project> --title "test" --cc-group "<19자리 id>" --dry-run --json
# 기대: dry-run JSON 에 cc 그룹 entry 포함

# code 매칭 동작 유지 확인
node dist/index.js post create <project> --title "test" --cc-group "<code>" --dry-run --json
# 기대: dry-run JSON 동일 결과
```

executor 메모: 실증은 사용자 환경 의존. 실제 깨진 프로젝트는 현재 0건 (서버 측 수정됨 — planning 실측 결과) → 정상 그룹의 id 로 매칭 우회 동작이 정상인지 확인.

## code-review-pitfalls 회피 항목

- **1-1 (validation 전 spinner)**: 본 phase 는 resolver 함수 1개 수정. spinner 호출 없음 — 무관
- **1-2 (spinner 시작 후 try/catch)**: 무관 — spinner 미사용
- **2-x (catch 분기)**: id 매칭 실패는 `DoorayCliError` throw — 호출자가 상위에서 처리 (기존 패턴 동일)
- **3-3 (테스트 mock mirror)**: `member-group.test.ts` 의 ensureMemberGroups mock 은 기존 `post-users.test.ts` 패턴 답습
- **4-x (외과적 변경)**: `resolveMemberGroup` 함수 본체만 수정. 시그니처 / 반환 타입 불변 → 5 호출자 코드 변경 0
- **id 입력 fallback ↔ code 매칭 우선순위**: numeric 15+자리는 항상 id 로 해석 → 만약 code 이름이 "12345678901234567" 같이 19자리 numeric 인 사용자가 있다면 id 로 오해석. **현실적으로 발생 불가** (code 는 보통 alphanumeric/한글) — 단 ADR-028 확장 본문에 trade-off 명시했으니 OK

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. tsc + build + test
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
# 기대: 0
pnpm build && pnpm test
# 기대: exit 0 (member-group.test.ts 4 케이스 통과)

# 2. id 분기 로직 존재
grep -nE "GROUP_ID_RE|/\^\\\\d\{15,\}\$/" src/resolvers/member-group.ts
# 기대: 1줄 이상

# 3. ADR 번호 정정 확인
grep -cE "ADR-026" src/resolvers/member-group.ts
# 기대: 0 (모두 ADR-028 로 교체)
grep -cE "ADR-028" src/resolvers/member-group.ts
# 기대: 1 이상

# 4. README + SKILL 갱신
grep -cE "id 직접 입력|--cc-group.*id" README.md
# 기대: 1 이상
grep -cE "id 직접|code\\\\\\|id" skills/dooray-cli/SKILL.md
# 기대: 1 이상

# 5. 5 호출자 시그니처 무변경
grep -cE "resolveMemberGroup\(client, projectId, " src/
# 기대: 5 (post-users / post create / post edit / comment add / comment edit)
```

## 작업 외 금지

- planning docs (CLAUDE.md / docs/adr.md / docs/code-architecture.md) 변경 금지 — task 생성 시점에 main commit 으로 이미 반영됨
- `resolveMemberGroup` 시그니처 / 반환 타입 변경 금지 — 5 호출자 영향
- `CachedMemberGroup` 타입 변경 금지 — cache 스키마 불변 (name 필드 추가 안 함)
- 새 ADR 추가 금지 — ADR-028 확장만
- 다른 resolver (`resolveMember` 등) 동작 변경 금지

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: fix/038-fix-member-group-resolver-id-fallback (main 에서 분기)
git add src/resolvers/member-group.ts src/resolvers/member-group.test.ts \
        README.md skills/dooray-cli/SKILL.md \
        tasks/038-fix-member-group-resolver-id-fallback/index.json
git commit -m "$(cat <<'EOF'
fix(resolvers): add id direct input fallback to resolveMemberGroup (Issue #76, ADR-028 확장)

문제: 프로젝트 전체 그룹이 code 누락 상태일 때 모든 --cc-group/--mention-group
입력이 매칭 실패. 사용자 회피 동선 부재.

수정:
- resolveMemberGroup 에 numeric 15+자리 → id 직접 매칭 분기 추가
  (resolveMember 의 동일 패턴 mirror, code 누락 그룹도 매칭 후보)
- stderr 경고의 ADR 번호 오기 (ADR-026 → ADR-028) 정정
- not-found 안내에 "id 직접 입력 가능" 추가
- 5 호출자 (post create/edit cc-group + mention-group + comment add/edit + post-users)
  시그니처 불변 — 자동 혜택
- 단위 테스트 4 케이스 (code 매칭 / id 매칭 / code 누락 그룹 id 매칭 / 매칭 실패 안내)

planning docs: CLAUDE.md / adr.md (ADR-028 확장 단락) / code-architecture.md
는 task 생성 시점 main commit 으로 선반영.

closes #76
EOF
)"
```
