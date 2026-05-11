# Phase 03 — mandatory tag 사전 검증 + task 완료 마킹

## 컨텍스트

GitHub Issue #35 의 3번 항목. mandatory tag group 이 설정된 프로젝트에서 `dooray post create <project> --title "..."` 처럼 `--tag` 없이 호출하면 `오류: API 호출 실패: USER_INVALID_TAG_MANDATORY_PREFIX` 만 노출된다. 어떤 그룹이 mandatory 인지, 후보 태그가 무엇인지 안내가 없어 사용자는 별도로 `dooray project tags <project>` 호출 후 prefix(`0:`/`1:`...) 추측해야 한다.

코드 현황:
- `src/resolvers/tag.ts:45-103` — `resolveTags(client, projectId, inputs)` 가 mandatory 그룹 충족 검증 + 누락 시 `필수 태그 그룹이 누락되었습니다` 에러. 단 후보 태그는 안내하지 않음.
- `src/commands/post/create.ts:72-76` — `tagInputs.length > 0` 인 경우에만 `resolveTags` 호출. 0개면 검증 스킵 → API 가 직접 reject.
- `src/cache/types.ts:40-48` — `CachedTag` 에 `groupName`, `groupMandatory` 포함.

직전 plan 과의 관계:
- 014 (project groups/tags) 가 tag cache 도입.
- 015~018 은 tag resolver 손대지 않음.

```bash
# cwd: /Users/nhn/personal/dooray-cli
git log origin/main --oneline -10 -- src/resolvers/tag.ts src/commands/post/create.ts
# 기대: 6a50072 (project groups/tags) + 0d5ae3d (post create meta) 등
```

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- src/resolvers/tag.ts src/commands/post/create.ts tasks/019-feat-cli-automation-quickwins/index.json
```

기대 결과 (총 3 파일):
```
src/commands/post/create.ts
src/resolvers/tag.ts
tasks/019-feat-cli-automation-quickwins/index.json
```

## 작업 항목

### 1. `src/resolvers/tag.ts` — 후보 태그 안내 + 0-input 검증

`resolveTags` 의 mandatory 미충족 에러 메시지에 그룹별 후보 태그를 포함하도록 변경. 누락 그룹별로 `allTags` 에서 같은 `groupId` 를 가진 태그 이름 목록을 추출.

또한 `inputs` 가 0개여도 mandatory 검증을 수행하도록 별도 export 함수 `validateMandatoryTags(client, projectId)` 신설. 0-input 전용 진입점이라 selectOne 검증 등 불필요한 로직 분기는 피한다.

구현 패턴:

```ts
// 누락 그룹별 후보 태그 추출 헬퍼
function buildMandatoryHint(allTags: CachedTag[], missingGroupIds: string[]): string {
  const lines: string[] = [];
  for (const gid of missingGroupIds) {
    const groupTags = allTags.filter((t) => t.groupId === gid);
    const gname = groupTags[0]?.groupName ?? gid;
    const candidates = groupTags.map((t) => t.name).join(", ");
    lines.push(`  - "${gname}": ${candidates || "(태그 없음)"}`);
  }
  return lines.join("\n");
}

// 0-input 시점에 호출. mandatory 그룹 존재하면 throw.
export async function validateMandatoryTags(
  client: DoorayApiClient,
  projectId: string,
): Promise<void> {
  const allTags = await ensureTags(client, projectId);
  const missingGroupIds: string[] = [];
  const seen = new Set<string>();
  for (const t of allTags) {
    if (t.groupMandatory && t.groupId && !seen.has(t.groupId)) {
      seen.add(t.groupId);
      missingGroupIds.push(t.groupId);
    }
  }
  if (missingGroupIds.length === 0) return;
  throw new DoorayCliError(
    `필수 태그 그룹이 누락되었습니다 (그룹당 1개 이상 필요):\n` +
      buildMandatoryHint(allTags, missingGroupIds) +
      `\n\n다시 시도: --tag "<그룹>: <후보>" 형식으로 추가`,
    EXIT_PARAM_ERROR,
  );
}
```

`resolveTags` 의 기존 missing 검증부도 같은 헬퍼를 호출하도록 정리:

```ts
// 기존 코드:
//   if (missing.length > 0) { throw new DoorayCliError(`필수 태그 그룹이 누락... ${missing.map(...)}`); }
// 신규:
const missingIds: string[] = [];
for (const [gid] of mandatoryGroups) {
  if (!coveredGroups.has(gid)) missingIds.push(gid);
}
if (missingIds.length > 0) {
  throw new DoorayCliError(
    `필수 태그 그룹이 누락되었습니다 (그룹당 1개 이상 필요):\n` +
      buildMandatoryHint(allTags, missingIds),
    EXIT_PARAM_ERROR,
  );
}
```

### 2. `src/commands/post/create.ts` — 0-input 시 사전 검증 호출

`tagInputs.length > 0` 분기 양쪽 모두에서 mandatory 검증을 거치도록 변경:

```ts
import { resolveTags, validateMandatoryTags } from "../../resolvers/tag.js";

// ...
const tagInputs = (opts.tag ?? []).filter((s: string) => s.length > 0);

const [tagIds, parentPostId, milestoneId] = await Promise.all([
  tagInputs.length > 0
    ? resolveTags(client, projectId, tagInputs)
    : validateMandatoryTags(client, projectId).then(() => undefined),
  // ...
]);
```

`validateMandatoryTags` 는 통과 시 void 반환. throw 가 발생하지 않으면 `tagIds` 는 undefined 그대로 → 기존 `...(tagIds && tagIds.length > 0 && { tagIds })` 분기와 호환.

### 3. `src/resolvers/tag.test.ts` — `validateMandatoryTags` 단위 테스트 (신규 또는 기존 확장)

mocked client 로 mandatory 그룹 검증 분기를 회귀 가드. 최소 3 케이스:

```ts
import { describe, it, expect, vi } from "vitest";
import { validateMandatoryTags } from "./tag.js";
import type { DoorayApiClient } from "../api/client.js";

function mockClient(tags: Array<{ id: string; name: string; tagGroupId?: string; groupMandatory?: boolean }>): DoorayApiClient {
  return { listProjectTags: vi.fn().mockResolvedValue({ result: tags }) } as unknown as DoorayApiClient;
}

describe("validateMandatoryTags", () => {
  it("mandatory 그룹 0개면 throw 없이 통과", async () => {
    const client = mockClient([{ id: "1", name: "bug" }]);
    await expect(validateMandatoryTags(client, "<project>")).resolves.toBeUndefined();
  });

  it("mandatory 그룹 다중 — 메시지에 그룹별 후보 포함", async () => {
    const client = mockClient([
      { id: "1", name: "p0", tagGroupId: "g1", groupMandatory: true },
      { id: "2", name: "p1", tagGroupId: "g1", groupMandatory: true },
      { id: "3", name: "fix", tagGroupId: "g2", groupMandatory: true },
    ]);
    await expect(validateMandatoryTags(client, "<project>")).rejects.toThrow(/p0|p1|fix/);
  });

  it("groupId 없는 mandatory 태그는 무시 (false-positive 방지)", async () => {
    const client = mockClient([{ id: "1", name: "x", groupMandatory: true }]);
    await expect(validateMandatoryTags(client, "<project>")).resolves.toBeUndefined();
  });
});
```

(정확한 함수 시그니처·throw 형태는 작업 1·2 의 구현에 맞춰 케이스 본문 조정.)

### 4. 마지막 phase — index.json 완료 마킹

phase-03 가 마지막이므로 본 phase commit 에 `tasks/019-feat-cli-automation-quickwins/index.json` 의 모든 status 를 `completed` 로 변경 포함.

`sed -i ''` 는 BSD 전용이라 GNU sed (Linux) 에서 실패. **권장**: Edit 도구로 4개 위치 직접 치환. 또는 portable node 한 줄:

```bash
# cwd: /Users/nhn/personal/dooray-cli
node -e "const fs=require('fs');const f='tasks/019-feat-cli-automation-quickwins/index.json';const d=JSON.parse(fs.readFileSync(f,'utf8'));d.status='completed';d.current_phase=3;d.phases.forEach(p=>p.status='completed');d.updated_at=new Date().toISOString();fs.writeFileSync(f,JSON.stringify(d,null,2)+'\n');"

# 검증: status: completed 가 4개 (index 1 + phases 3)
grep -c '"status": "completed"' tasks/019-feat-cli-automation-quickwins/index.json
# 기대: 4
```

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. 빌드 + 테스트 통과
pnpm build && pnpm test
# 기대: exit 0

# 2. validateMandatoryTags export 추가
grep -n "export async function validateMandatoryTags" src/resolvers/tag.ts
# 기대: 1줄 매칭

# 3. post create 가 0-input 분기에서 validateMandatoryTags 호출
grep -n "validateMandatoryTags" src/commands/post/create.ts
# 기대: 2줄 (import + 호출)

# 4. mandatory 에러 메시지에 후보 태그가 포함되도록 변경
grep -n "buildMandatoryHint" src/resolvers/tag.ts
# 기대: 3줄 이상 (정의 + resolveTags 호출 + validateMandatoryTags 호출)

# 5. validateMandatoryTags 단위 테스트 추가
grep -cE 'validateMandatoryTags.*resolves|validateMandatoryTags.*rejects' src/resolvers/tag.test.ts
# 기대: 3 이상 (3 케이스)

# 6. index.json 완료 마킹
grep -c '"status": "completed"' tasks/019-feat-cli-automation-quickwins/index.json
# 기대: 4
```

## 작업 외 금지

- `--interactive-tags` 같은 신규 옵션 도입 금지 (이번 phase scope 외)
- `post edit` 시 mandatory 검증 추가 금지 (post create 만)
- tag cache TTL 변경 금지
- ADR 추가 금지 (ADR 작성 전 점검 통과 못 함 — 일반적 UX 개선)

## 커밋

phase 작업 완료 후 단일 commit (코드 + index.json 함께):

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/019-feat-cli-automation-quickwins
git add src/resolvers/tag.ts src/commands/post/create.ts tasks/019-feat-cli-automation-quickwins/index.json
git commit -m "feat(resolvers): pre-validate mandatory tag groups with candidate hints

Issue #35 item 3: USER_INVALID_TAG_MANDATORY_PREFIX from API was opaque.
Add validateMandatoryTags() called when no --tag is given; enrich error
with group name + candidate tags. Mark task 019 completed."
```
