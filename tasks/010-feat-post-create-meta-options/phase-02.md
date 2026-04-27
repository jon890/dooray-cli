# Phase 2: resolver 신설 + 기존 매칭 정책 통일

## 컨텍스트

Phase 1에서 마련한 client/cache 위에 resolver 레이어를 추가. 기존 `resolveWorkflow`도 새 매칭 정책(정확→부분→모호)으로 통일 — ADR-019 결정사항.

### 먼저 읽을 파일

- `src/resolvers/member.ts` — 매칭 정책 표준 (정확일치는 없고 부분일치만, 모호시 후보 + 에러). 본 task는 "정확일치 우선" 추가.
- `src/resolvers/workflow.ts` — 정확일치만 있음, 본 phase에서 통일 정책 적용
- `src/resolvers/post.ts` — `resolvePost(projectId, postNumber)` 시그니처 (postRef 구현시 활용)
- `src/resolvers/project.ts` — `resolveProject` 시그니처 (postRef에서 사용)
- `docs/adr.md` ADR-008 (모호 매칭 정책 근거), ADR-019 (mandatory 검증)

## 표준 매칭 헬퍼

`src/resolvers/match.ts` 신설 — 모든 resolver가 공유:

```ts
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

export interface NameRecord {
  name: string;
  // 다른 식별 필드는 caller가 후처리
}

/**
 * 정확일치 → 부분일치(includes) → 모호시 에러 + 후보 목록.
 * 0개 매칭이면 not-found 에러.
 *
 * @param items 후보 목록
 * @param input 사용자 입력
 * @param label 에러 메시지에 들어갈 도메인 명 (예: "태그", "멤버")
 * @param renderCandidate 후보 한 줄 표현 (예: m => `${m.name} (${m.id})`)
 */
export function matchByName<T extends NameRecord>(
  items: T[],
  input: string,
  label: string,
  renderCandidate: (item: T) => string,
): T {
  const exact = items.filter((i) => i.name === input);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    throw new DoorayCliError(
      `복수의 ${label}가 매칭됩니다(정확일치): "${input}"\n` +
        exact.map((i) => `  - ${renderCandidate(i)}`).join("\n"),
      EXIT_PARAM_ERROR,
    );
  }

  const partial = items.filter((i) => i.name.includes(input));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new DoorayCliError(
      `복수의 ${label}가 매칭됩니다: "${input}"\n` +
        partial.map((i) => `  - ${renderCandidate(i)}`).join("\n"),
      EXIT_PARAM_ERROR,
    );
  }

  throw new DoorayCliError(
    `${label}을(를) 찾을 수 없습니다: ${input}`,
    EXIT_PARAM_ERROR,
  );
}
```

## 작업 목록 (5개)

### 1) `src/resolvers/match.ts` — 표준 헬퍼 신설

위 코드 그대로 작성.

### 2) `src/resolvers/tag.ts` — 신규

```ts
import { DoorayApiClient } from "../api/client.js";
import type { CachedTag } from "../cache/types.js";
import { getTags, setTags, isExpired } from "../cache/store.js";
import { TAGS_TTL_MS } from "../cache/types.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import { matchByName } from "./match.js";

async function fetchAllTags(client: DoorayApiClient, projectId: string): Promise<CachedTag[]> {
  const all: CachedTag[] = [];
  let page = 0;
  const size = 100;
  while (true) {
    const res = await client.getProjectTags(projectId, { page, size });
    for (const t of res.result) {
      all.push({
        id: t.id,
        name: t.name,
        groupId: t.tagGroup?.id ?? null,
        groupName: t.tagGroup?.name ?? null,
        groupMandatory: t.tagGroup?.mandatory ?? false,
        groupSelectOne: t.tagGroup?.selectOne ?? false,
      });
    }
    const total = res.totalCount ?? all.length;
    if (all.length >= total) break;
    page++;
  }
  return all;
}

export async function ensureTags(client: DoorayApiClient, projectId: string): Promise<CachedTag[]> {
  const entry = await getTags(projectId);
  if (entry && !isExpired(entry.updatedAt, TAGS_TTL_MS)) return entry.data;
  const items = await fetchAllTags(client, projectId);
  await setTags(projectId, items);
  return items;
}

/**
 * 입력된 태그 이름들을 CachedTag로 lookup하고 mandatory/selectOne 정책을 검증.
 * 반환값은 tagIds (post create body용).
 */
export async function resolveTags(
  client: DoorayApiClient,
  projectId: string,
  inputs: string[],
): Promise<string[]> {
  const allTags = await ensureTags(client, projectId);

  // 1. 각 input → CachedTag (matchByName 사용, 모호시 에러)
  const selected: CachedTag[] = inputs.map((input) =>
    matchByName(
      allTags,
      input,
      "태그",
      (t) => (t.groupName ? `${t.groupName} / ${t.name} (${t.id})` : `${t.name} (${t.id})`),
    ),
  );

  // 2. mandatory 그룹 충족 검증
  const mandatoryGroups = new Map<string, string>(); // groupId -> groupName
  for (const t of allTags) {
    if (t.groupMandatory && t.groupId) mandatoryGroups.set(t.groupId, t.groupName ?? t.groupId);
  }
  const coveredGroups = new Set(selected.map((t) => t.groupId).filter((g): g is string => !!g));
  const missing: string[] = [];
  for (const [gid, gname] of mandatoryGroups) {
    if (!coveredGroups.has(gid)) missing.push(gname);
  }
  if (missing.length > 0) {
    throw new DoorayCliError(
      `필수 태그 그룹이 누락되었습니다 (그룹당 1개 이상 필요):\n` +
        missing.map((g) => `  - ${g}`).join("\n"),
      EXIT_PARAM_ERROR,
    );
  }

  // 3. selectOne 그룹에 2개 이상 선택 시 에러
  const selectOneGroups = new Map<string, { name: string; tags: string[] }>();
  for (const t of selected) {
    if (!t.groupSelectOne || !t.groupId) continue;
    const entry = selectOneGroups.get(t.groupId) ?? { name: t.groupName ?? t.groupId, tags: [] };
    entry.tags.push(t.name);
    selectOneGroups.set(t.groupId, entry);
  }
  const violators: string[] = [];
  for (const [, info] of selectOneGroups) {
    if (info.tags.length > 1) {
      violators.push(`${info.name} (선택: ${info.tags.join(", ")})`);
    }
  }
  if (violators.length > 0) {
    throw new DoorayCliError(
      `다음 태그 그룹은 1개만 선택 가능합니다:\n` +
        violators.map((v) => `  - ${v}`).join("\n"),
      EXIT_PARAM_ERROR,
    );
  }

  return selected.map((t) => t.id);
}
```

### 3) `src/resolvers/milestone.ts` — 신규

```ts
import { DoorayApiClient } from "../api/client.js";
import type { CachedMilestone } from "../cache/types.js";
import { getMilestones, setMilestones, isExpired } from "../cache/store.js";
import { MILESTONES_TTL_MS } from "../cache/types.js";
import { matchByName } from "./match.js";

async function fetchAllMilestones(client: DoorayApiClient, projectId: string): Promise<CachedMilestone[]> {
  const all: CachedMilestone[] = [];
  let page = 0;
  const size = 100;
  while (true) {
    const res = await client.getProjectMilestones(projectId, { page, size });
    for (const m of res.result) all.push({ id: m.id, name: m.name });
    const total = res.totalCount ?? all.length;
    if (all.length >= total) break;
    page++;
  }
  return all;
}

export async function ensureMilestones(
  client: DoorayApiClient,
  projectId: string,
): Promise<CachedMilestone[]> {
  const entry = await getMilestones(projectId);
  if (entry && !isExpired(entry.updatedAt, MILESTONES_TTL_MS)) return entry.data;
  const items = await fetchAllMilestones(client, projectId);
  await setMilestones(projectId, items);
  return items;
}

export async function resolveMilestone(
  client: DoorayApiClient,
  projectId: string,
  input: string,
): Promise<string> {
  const all = await ensureMilestones(client, projectId);
  const match = matchByName(all, input, "마일스톤", (m) => `${m.name} (${m.id})`);
  return match.id;
}
```

### 4) `src/resolvers/postRef.ts` — 신규

```ts
import { DoorayApiClient } from "../api/client.js";
import { resolveProject } from "./project.js";
import { resolvePost } from "./post.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

/**
 * 입력 형식:
 *  - "<projectCode>/<postNumber>"  → resolveProject + resolvePost
 *  - 그 외(슬래시 없음)            → raw postId로 간주, 그대로 반환
 */
export async function resolvePostRef(client: DoorayApiClient, ref: string): Promise<string> {
  if (ref.includes("/")) {
    const [code, numStr] = ref.split("/", 2);
    const num = Number(numStr);
    if (!code || !Number.isFinite(num) || num <= 0) {
      throw new DoorayCliError(
        `--parent 형식이 올바르지 않습니다: "${ref}" (예: "tc-ocr/337" 또는 raw postId)`,
        EXIT_PARAM_ERROR,
      );
    }
    const projectId = await resolveProject(client, code);
    return resolvePost(client, projectId, num);
  }
  return ref;
}
```

### 5) `src/resolvers/workflow.ts` 및 `member.ts` — 매칭 정책 통일

**workflow.ts**: `resolveWorkflow`를 `matchByName`으로 교체. 단 `class` 키워드 (`registered`/`working`/`closed`/`backlog`) 매칭은 별도 처리 — 이름이 아닌 class 매칭이므로 `matchByName` 호출 *전*에 시도:

```ts
import { matchByName } from "./match.js";

export async function resolveWorkflow(
  client: DoorayApiClient,
  projectId: string,
  input: string,
): Promise<string> {
  const workflows = await ensureWorkflows(client, projectId);

  // class 정확일치 우선 (registered/working/closed/backlog)
  const byClass = workflows.filter((w) => w.class === input);
  if (byClass.length === 1) return byClass[0].id;

  const match = matchByName(workflows, input, "워크플로우", (w) => `${w.name} [${w.class}] (${w.id})`);
  return match.id;
}
```

**member.ts**: 정확일치 우선 분기 추가. 단 멤버는 `name + id`를 후보 표시에 사용 — `matchByName` 호출. 단 멤버는 이메일 매칭도 있을 수 있으니 기존 `byName` 변수 흐름 보존하며 `matchByName`으로 교체.

```ts
// resolveMember 본문에서:
import { matchByName } from "./match.js";

const match = matchByName(
  members,
  input,
  "멤버",
  (m) => `${m.name} (${m.organizationMemberId})`,
);
return match.organizationMemberId;
```

기존 멤버 매칭이 이메일/email-like 입력을 어떻게 처리하는지 확인 후, 그 분기는 보존해야 함. 만약 `member.ts`에 이메일 분기가 있다면 `matchByName` 호출 전에 처리.

## 성공 기준

- [ ] `pnpm build` 성공
- [ ] `grep -l "matchByName" src/resolvers/*.ts` → `match.ts` + `tag.ts` + `milestone.ts` + `workflow.ts` + `member.ts` (5개)
- [ ] `ls src/resolvers/` → `match.ts`, `tag.ts`, `milestone.ts`, `postRef.ts` 추가됨
- [ ] 기존 매칭 정책의 모호 케이스가 여전히 에러 + 후보 목록 출력 (수동 확인 — 빌드만 통과시키면 phase 5에서 검증)
- [ ] resolveWorkflow의 class 매칭(`registered` 등)이 보존

## 주의사항

- **`post create` 명령 수정은 phase 3에서** — resolver만 작성
- **`matchByName` 헬퍼는 부분일치 = `includes()`**, 정규식 X
- 멤버 resolver의 기존 이메일/특수 분기가 있다면 보존
- workflow의 `class` 매칭 우선순위는 변경 금지 (기존 동작 호환)
- Tag mandatory 검증 메시지는 사용자 친화적으로 — 어느 그룹이 누락인지 그룹명 노출
- `DoorayCliError(message, EXIT_PARAM_ERROR)` 일관 사용

## Blocked 조건

- `member.ts` 또는 `workflow.ts`에 이메일/특수 매칭 흐름이 복잡해 `matchByName`으로 단순 교체 불가 → `PHASE_BLOCKED: resolver 통일 위험`
- `Tag` 타입에 `tagGroup` 필드 없음 (phase 1 누락) → `PHASE_BLOCKED: phase 1 미완료`
