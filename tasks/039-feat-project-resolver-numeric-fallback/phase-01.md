# Phase 01 — resolveProject numeric 분기 + 단위 테스트 + README/SKILL 사용 예

## 컨텍스트

Issue #78 — `dooray post search <project>` (외 12 호출자) 가 `member=me` 응답에 없는 프로젝트의 업무를 못 찾음.
사용자가 projectId 를 알고 있어도 cache 매칭 실패로 차단.

**해결 (ADR-030)**:
- `resolveProject` 입력이 numeric 15+자리이면 cache 우회 + 그대로 projectId 반환
- 권한 검증은 후속 API 호출의 4xx 에 위임
- 12 호출자 시그니처 불변 — 자동 혜택

코드 컨텍스트:
- `src/resolvers/project.ts:54-72` — `resolveProject` (현재 cache 매칭만)
- `src/resolvers/member.ts:9` — `MEMBER_ID_RE = /^\d{15,}$/` 패턴 mirror
- `src/resolvers/member-group.ts` — `GROUP_ID_RE` 동일 패턴
- 12 호출자 (`grep -rn "resolveProject\b" src/`):
  - `src/resolvers/wiki.ts:13` (freshness 트리거 — wiki 도 numeric 허용으로 결정)
  - `src/resolvers/post-input.ts:96`
  - `src/resolvers/postRef.ts:22`
  - `src/commands/post/{create,list,search}.ts`
  - `src/commands/member/list.ts`
  - `src/commands/project/{templates,tags,groups,members,workflows}.ts`

## 변경 파일 (정확)

기대 결과 (총 4 파일):
```
src/resolvers/project.ts                                       (수정 — PROJECT_ID_RE 분기 + ADR-030 주석)
src/resolvers/project.test.ts                                  (신규 — 4 단위 테스트)
README.md                                                      (수정 — projectId 직접 입력 사용 예 추가)
skills/dooray-cli/SKILL.md                                     (수정 — 빠른 참조 표 + AI agent 자동화 시나리오)
tasks/039-feat-project-resolver-numeric-fallback/index.json    (완료 마킹)
```

**planning docs (CLAUDE.md / docs/adr.md / docs/code-architecture.md / docs/flow.md) 는 task 생성 시점에 main 직접 commit 으로 선반영** — phase 안에서 추가 변경 금지.

## 작업 항목 (5개 이하)

### 1. `src/resolvers/project.ts` — PROJECT_ID_RE 분기 추가

```ts
// resolveMember 의 MEMBER_ID_RE 와 동일 패턴 — ADR-030
const PROJECT_ID_RE = /^\d{15,}$/;

export async function resolveProject(
  client: DoorayApiClient,
  input: string,
): Promise<string> {
  // 1. numeric 15+자리 — cache 우회 (ADR-030, Issue #78)
  // member=me 응답에 없는 프로젝트도 projectId 만 있으면 후속 API 호출 가능.
  // 권한 검증은 후속 호출의 4xx 에 위임.
  if (PROJECT_ID_RE.test(input)) {
    return input;
  }

  // 2. cache 매칭 (기존 흐름)
  const projects = await ensureProjects(client);
  const match = projects.find((p) => p.code === input || p.id === input);
  if (match) return match.id;

  // private 캐시가 있으면 추가 검색 (캐시 미스 시 API 호출 없음)
  const privateCached = await getPrivateProjects();
  if (privateCached && !isExpired(privateCached.updatedAt, PROJECTS_TTL_MS)) {
    const privateMatch = privateCached.data.find((p) => p.code === input || p.id === input);
    if (privateMatch) return privateMatch.id;
  }

  throw new DoorayCliError(
    `프로젝트를 찾을 수 없습니다: ${input}\n  개인 프로젝트라면: dooray project list --type private 로 캐시를 갱신하세요\n  member=me 응답에 없는 프로젝트는 projectId (15+자리 numeric) 직접 입력으로 우회 가능 (ADR-030)`,
    EXIT_PARAM_ERROR,
  );
}
```

**주의 사항**:
- numeric 분기가 cache 매칭보다 먼저 — cache 에 있는 projectId 라도 numeric 입력이면 cache 조회 skip. 성능상 이점 (API 호출 0)
- 에러 메시지에 ADR-030 회피책 한 줄 추가 — AI agent / 사용자에게 다음 행동 안내

### 2. `src/resolvers/project.test.ts` — 4 단위 테스트

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveProject } from "./project.js";
import type { DoorayApiClient } from "../api/client.js";

// fixture: cache 안의 정상 프로젝트
const fixtureProjects = [
  { id: "1111222233334444555", code: "project-a", wikiId: undefined },
  { id: "2222333344445555666", code: "project-b", wikiId: undefined },
];

// cache store mock — ensureProjects 내부에서 호출하는 함수들을 mock
// self-mock (vi.mock("./project.js")) 는 동일 파일 내부 함수 참조를 교체 못함 → 사용 금지
vi.mock("../cache/store.js", () => ({
  getProjects: vi.fn().mockResolvedValue({
    data: fixtureProjects,
    updatedAt: Date.now(),
  }),
  setProjects: vi.fn().mockResolvedValue(undefined),
  getPrivateProjects: vi.fn().mockResolvedValue(null),
  isExpired: vi.fn().mockReturnValue(false),
}));

describe("resolveProject", () => {
  beforeEach(() => vi.clearAllMocks());

  it("code 매칭 — 기존 흐름", async () => {
    const result = await resolveProject({} as unknown as DoorayApiClient, "project-a");
    expect(result).toBe("1111222233334444555");
  });

  it("numeric 15+자리 — cache 우회 (ADR-030)", async () => {
    const result = await resolveProject({} as unknown as DoorayApiClient, "9999888877776666555");
    expect(result).toBe("9999888877776666555");
  });

  it("numeric 15+자리 — cache 에 있어도 그대로 반환 (성능 우선)", async () => {
    const result = await resolveProject({} as unknown as DoorayApiClient, "1111222233334444555");
    expect(result).toBe("1111222233334444555");
  });

  it("code 매칭 실패 — 친절한 안내 (ADR-030 회피책 포함)", async () => {
    await expect(resolveProject({} as unknown as DoorayApiClient, "nonexistent-code"))
      .rejects.toThrow(/프로젝트를 찾을 수 없습니다.*ADR-030/);
  });
});
```

mock 패턴은 기존 `src/resolvers/member-group.test.ts` (task 038 산출물) 동일 패턴 적용.
self-mock (`vi.mock("./project.js")`) 는 동일 파일 내부 함수 참조를 교체하지 못하므로 사용 금지.
대신 `../cache/store.js` mock 으로 `getProjects` + `setProjects` + `isExpired` 를 교체해 `ensureProjects` 가 네트워크/파일시스템 호출 없이 fixture 반환하도록 한다.

### 3. 12 호출자 시그니처 무변경 검증

```bash
grep -rnE "resolveProject\(client, " src/ | grep -v "\.test\.ts\|src/resolvers/project\.ts"
# 기대: 12 호출자 모두 `resolveProject(client, <input>)` 시그니처 그대로
# 동작 변경: numeric 입력 시 cache 우회만 (반환 타입 / 호출 시그니처 불변)
```

### 4. README + skills/dooray-cli/SKILL.md

#### README.md — `### 위키` 직전 또는 `### 업무` 섹션 안에 추가

위치: `### 업무` 섹션의 "업무 식별 방식" 직후 또는 검색 사용 예 옆.

```markdown
**projectId 직접 입력** (Issue #78, ADR-030):

`member=me` 응답에 없는 프로젝트 (다른 팀 / 권한만 있는 프로젝트) 도 projectId (19자리 numeric) 를 직접 입력하면 자동으로 cache 우회.

```bash
# 코드 매칭 (기존)
dooray post search my-project "keyword"

# projectId 직접 입력 — member 아닌 프로젝트도 자동화 가능
dooray post search 1234567890123456789 "keyword"
dooray post list 1234567890123456789
dooray member list 1234567890123456789
```

권한 검증은 후속 API 호출 시점 — 권한 없으면 4xx.
```

#### skills/dooray-cli/SKILL.md — 빠른 참조 표 행 + AI agent 시나리오

**빠른 참조 표 행 갱신**:

기존 `dooray post search <project>` 같은 표 행에 추가 설명:

```markdown
| `dooray post search <project|projectId>` | 업무 검색 — projectId (15+자리 numeric) 직접 입력 시 cache 우회 (ADR-030) |
```

**AI agent 시나리오 추가** (member 아닌 프로젝트 자동화):

```markdown
## projectId 직접 입력 시나리오 (Issue #78, ADR-030)

AI agent 가 `member=me` 응답에 없는 프로젝트의 업무를 다뤄야 할 때:

1. **사용자가 projectId (19자리 numeric) 를 줬으면 그대로 명령에 사용**:
   ```bash
   dooray post search 1234567890123456789 "keyword"
   ```

2. **사용자가 코드만 줬고 cache 매칭 실패 (member 아닌 프로젝트)**:
   - 에러 메시지의 ADR-030 안내 확인
   - 사용자에게 "프로젝트 ID 가 필요합니다 — Dooray UI 의 프로젝트 URL 에서 확인 가능" 요청
   - 또는 `dooray project list --type private` 로 private 캐시 갱신 시도

3. **권한 없는 projectId 입력 시**: resolver 통과 후 후속 API 4xx 발생 — 에러 메시지에서 권한 부재 확인 후 사용자에게 보고

권한 검증이 resolver 단보다 한 단계 지연되는 trade-off — AI 친화적 자동화 우선 (ADR-030).
```

### 5. 빌드 + 실증 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli

pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
# 기대: 0
pnpm build && pnpm test
# 기대: exit 0 (4 케이스 통과)

# 실증 1: 코드 매칭 (기존 동작 유지)
node dist/index.js post list my-project --quiet | head -3
# 기대: 정상

# 실증 2: numeric projectId 직접 입력
# (사용자 환경의 member=me 응답에 없는 프로젝트 projectId 사용)
node dist/index.js post search 1234567890123456789 "test"
# 기대: 후속 API 호출. 권한 있으면 검색 결과, 없으면 4xx
```

## code-review-pitfalls 회피 항목

- **1-x (spinner 순서)**: resolver 함수만 수정 — spinner 무관
- **3-3 (테스트 mock mirror)**: `member-group.test.ts` 패턴 답습
- **4-x (외과적 변경)**: `resolveProject` 함수 본체만 수정. 시그니처 / 반환 타입 불변 → 12 호출자 코드 변경 0
- **CLI23 (이중 단언)**: 본 phase 는 type 단언 없음 — 무관
- **에러 메시지 일관성**: 기존 "프로젝트를 찾을 수 없습니다" 톤 유지 + ADR-030 회피책 한 줄만 추가

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
pnpm build && pnpm test
# 둘 다 exit 0

grep -nE "PROJECT_ID_RE|/\^\\\\d\{15,\}\$/" src/resolvers/project.ts
# 기대: 1줄 이상

grep -nE "ADR-030" src/resolvers/project.ts
# 기대: 1 이상 (주석 + 에러 메시지)

grep -nE "resolveProject\(client, " src/ | grep -v "\.test\.ts\|src/resolvers/project\.ts" | wc -l
# 기대: 12 (호출자 시그니처 무변경)

grep -c "projectId 직접 입력" README.md
# 기대: 1 이상

grep -c "projectId 직접 입력 시나리오" skills/dooray-cli/SKILL.md
# 기대: 1
```

### index.json 완료 마킹 (마지막 phase 의무)

`tasks/039-feat-project-resolver-numeric-fallback/index.json` 의 다음 필드를 갱신:
- `status`: `"completed"`
- `current_phase`: `2` (total_phases + 1)
- `phases[0].status`: `"completed"`

## 작업 외 금지

- planning docs (CLAUDE.md / docs/adr.md / docs/code-architecture.md / docs/flow.md) 변경 금지 — task 생성 시점 main commit 으로 반영됨
- `resolveProject` 시그니처 / 반환 타입 변경 금지 — 13 호출자 영향
- `ensureProjects` / `ensurePrivateProjects` / cache 스키마 변경 금지
- 새 ADR 추가 금지 — ADR-030 만
- 다른 resolver 동작 변경 금지

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/039-feat-project-resolver-numeric-fallback (main 에서 분기)
git add src/resolvers/project.ts src/resolvers/project.test.ts \
        README.md skills/dooray-cli/SKILL.md \
        tasks/039-feat-project-resolver-numeric-fallback/index.json
git commit -m "$(cat <<'EOF'
feat(resolvers): add numeric input fallback to resolveProject (Issue #78, ADR-030)

문제: `ensureProjects` 가 `GET /project/v1/projects?member=me` 응답 기반으로
cache 채워서 member 가 아닌 프로젝트는 cache 에 없음. 자동화 스크립트가
멤버 아닌 프로젝트의 업무 검색 / 조회 불가.

수정:
- resolveProject 에 PROJECT_ID_RE (numeric 15+자리) 분기 추가
  → cache 우회 + 그대로 projectId 반환
- 권한 검증은 후속 API 호출 (getPosts 등) 의 4xx 에 위임
- 에러 메시지에 ADR-030 회피책 안내 추가
- resolveMember / resolveMemberGroup 의 numeric 분기 패턴 mirror
- 12 호출자 시그니처 불변 → 자동 혜택
- 단위 테스트 4 케이스 (code 매칭 / numeric 우회 / cache hit numeric / 매칭 실패)

planning docs (CLAUDE.md / adr.md ADR-030 / code-arch / flow.md) 는
task 생성 시점 main commit 으로 선반영.

closes #78
EOF
)"
```
