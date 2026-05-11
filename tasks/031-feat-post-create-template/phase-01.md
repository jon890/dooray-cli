# Phase 01 — API client + types + cache + resolvers/template.ts + tests

## 컨텍스트

GitHub Issue #59 — 정형 task 생성 자동화. cmux-browser spike (2026-05-11) 결과 Dooray API 4종 모두 노출:

| Endpoint | 응답 |
|---|---|
| `GET .../templates?page=&size=` | `{ result: TemplateMeta[], totalCount }` — body/guide 미포함 |
| `GET .../templates/{templateId}?interpolation=true\|false` | `{ result: TemplateDetail }` — body/users/tags 포함, `${year}` 등 매크로 치환 |

본 phase 는 코드 인프라만 (명령은 phase-02).

코드 현황 — 패턴 답습 대상:
- `src/resolvers/tag.ts` — `ensureTags` / `resolveTags` 패턴
- `src/cache/store.ts` — `TAGS_DIR` / `getTags` / `setTags` 패턴
- `src/cache/types.ts` — `TAGS_TTL_MS = 86_400_000` (24h), `CachedTag` 인터페이스
- `src/api/client.ts` — `getProjectTags(projectId, params)` 패턴
- `src/api/types.ts:83-95` — `Tag` + `TagListResponse` 형식
- ADR-027: interpolation 기본 true, 캐시 TTL 24h, 19자리 → 직접 / 그 외 → matchByName

직전 plan 과의 관계: 029 (resolveMember email/id 분기) 가 동일 input-form 분기 패턴 도입 — 단 본 plan 의 resolveTemplate 은 더 단순 (19자리 + matchByName 만, 이메일 케이스 없음).

```bash
# cwd: /Users/nhn/personal/dooray-cli
git log origin/main --oneline -10 -- src/resolvers/ src/cache/ src/api/
```

## 변경 파일 (정확)

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- src/api/ src/cache/ src/resolvers/
```

기대 결과 (총 6 파일):
```
src/api/client.ts                       (수정 — 2 메서드 추가)
src/api/types.ts                        (수정 — Template / TemplateDetail 타입 추가)
src/cache/store.ts                      (수정 — TEMPLATES_DIR + getTemplates/setTemplates)
src/cache/types.ts                      (수정 — TEMPLATES_TTL_MS + CachedTemplate)
src/resolvers/template.ts               (신규 — ensureTemplates + resolveTemplate)
src/resolvers/template.test.ts          (신규 — 단위 테스트)
```

## 작업 항목

### 1. `src/api/types.ts` — Template / TemplateDetail / 응답 타입

```ts
// 목록용 (body 미포함)
export interface TemplateMeta {
  id: string;
  templateName: string;
  project: { id: string; code: string };
}

// 단건용 (body/users/tags 포함)
export interface TemplateDetail extends TemplateMeta {
  body: PostBody;
  users?: PostUsers;
  tags?: Tag[];
  // 실측 spike 결과에 따라 추가 필드 보강 (mileStone / priority 등 — executor 가 1회 호출로 확인)
}

export type TemplateListResponse = DoorayApiResponse<TemplateMeta[]>;
export type TemplateDetailResponse = DoorayApiResponse<TemplateDetail>;
```

**중요**: 응답 schema 의 정확한 필드명 (`milestoneId` 형태인지, nested `milestone.id` 인지) 은 executor 가 실증 GET 호출 응답으로 확정. 위 type 은 base 형태 — phase-02 의 사용자 옵션 override 흐름에서 필요한 필드 (subject/body/users/tags/priority/milestone) 만 우선 type 정의.

### 2. `src/cache/types.ts` — TTL + Cached 인터페이스

```ts
export const TEMPLATES_TTL_MS = 86_400_000; // 24h — tag/workflow 답습

export interface CachedTemplate {
  id: string;
  templateName: string;
}
```

### 3. `src/cache/store.ts` — TEMPLATES_DIR + getter/setter

```ts
const TEMPLATES_DIR = path.join(CACHE_DIR, "templates");

export async function getTemplates(projectId: string): Promise<CacheEntry<CachedTemplate[]> | null> {
  // members/{projectId}.json / workflows/{projectId}.json 패턴 답습
}

export async function setTemplates(projectId: string, templates: CachedTemplate[]): Promise<void> {
  // atomic write (temp + rename — ADR-010)
}
```

기존 `getMemberGroups` / `setMemberGroups` 와 동일 구조. executor 는 `setMemberGroups` 함수 본문 복사 → 식별자만 templates 로 교체.

### 4. `src/api/client.ts` — 2 메서드 추가

```ts
async getProjectTemplates(
  projectId: string,
  params?: { page?: number; size?: number },
): Promise<TemplateListResponse> {
  try {
    return await this.api
      .get(`project/v1/projects/${projectId}/templates`, {
        searchParams: {
          ...(params?.page !== undefined && { page: params.page }),
          ...(params?.size !== undefined && { size: params.size }),
        },
      })
      .json<TemplateListResponse>();
  } catch (e) {
    return await toDoorayCliError(e);
  }
}

async getProjectTemplateDetail(
  projectId: string,
  templateId: string,
  interpolation: boolean = true,   // ADR-027: 기본 true
): Promise<TemplateDetailResponse> {
  try {
    return await this.api
      .get(`project/v1/projects/${projectId}/templates/${templateId}`, {
        searchParams: { interpolation: String(interpolation) },
      })
      .json<TemplateDetailResponse>();
  } catch (e) {
    return await toDoorayCliError(e);
  }
}
```

**Why default `interpolation: boolean = true`**: ADR-027 — 자동화 파이프라인이 `${year}` 등 매크로를 매번 수동 처리 안 해도 되도록.

### 5. `src/resolvers/template.ts` — ensureTemplates + resolveTemplate

```ts
import { DoorayApiClient } from "../api/client.js";
import type { CachedTemplate } from "../cache/types.js";
import { getTemplates, setTemplates, isExpired } from "../cache/store.js";
import { TEMPLATES_TTL_MS, RESOLVER_FETCH_PAGE_SIZE } from "../cache/types.js";
import { matchByName } from "./match.js";

const TEMPLATE_ID_RE = /^\d{15,}$/;

async function fetchAllTemplates(client: DoorayApiClient, projectId: string): Promise<CachedTemplate[]> {
  // page/size 페이지네이션 (tag.ts 의 fetchAllTags 답습)
  const all: CachedTemplate[] = [];
  let page = 0;
  const size = RESOLVER_FETCH_PAGE_SIZE;
  while (true) {
    const res = await client.getProjectTemplates(projectId, { page, size });
    for (const t of res.result) {
      all.push({ id: t.id, templateName: t.templateName });
    }
    const total = res.totalCount ?? all.length;
    if (all.length >= total) break;
    page++;
  }
  return all;
}

export async function ensureTemplates(client: DoorayApiClient, projectId: string): Promise<CachedTemplate[]> {
  const entry = await getTemplates(projectId);
  if (entry && !isExpired(entry.updatedAt, TEMPLATES_TTL_MS)) return entry.data;
  const items = await fetchAllTemplates(client, projectId);
  await setTemplates(projectId, items);
  return items;
}

// 19자리 숫자 → 그대로 id 반환 (단건 GET 으로 phase-02 에서 검증). 그 외 → matchByName 부분일치.
export async function resolveTemplate(
  client: DoorayApiClient,
  projectId: string,
  input: string,
): Promise<string> {
  if (TEMPLATE_ID_RE.test(input)) return input;
  const templates = await ensureTemplates(client, projectId);
  const match = matchByName(
    templates.map((t) => ({ name: t.templateName, id: t.id })),
    input,
    "템플릿",
    (t) => `${t.name} (${t.id})`,
  );
  return match.id;
}
```

**Why id 직접 반환 + 단건 GET 으로 검증은 caller**: 19자리 id 가 다른 프로젝트 / 잘못된 id 일 가능성은 phase-02 의 `getProjectTemplateDetail` 호출이 404 로 잡음 (toDoorayCliError 자연 흐름). resolveTemplate 본체는 단순 dispatcher.

### 6. `src/resolvers/template.test.ts` — 단위 테스트 (총 4 케이스)

`resolveMember.test.ts` 패턴 답습 — `DoorayApiClient` mock. 4 케이스:

1. 19자리 숫자 입력 → 그대로 반환 (API 호출 0)
2. 부분일치 1건 → 해당 id 반환
3. 부분일치 0건 → DoorayCliError (matchByName 의 "찾을 수 없음" 에러)
4. 부분일치 복수 → DoorayCliError (matchByName 의 "모호" 에러)

```ts
import { describe, it, expect, vi } from "vitest";
import { resolveTemplate } from "./template.js";
import type { DoorayApiClient } from "../api/client.js";

function mockClient(opts: { getProjectTemplates?: any }): DoorayApiClient {
  return {
    getProjectTemplates: opts.getProjectTemplates ?? vi.fn().mockResolvedValue({ result: [], totalCount: 0 }),
  } as unknown as DoorayApiClient;
}

describe("resolveTemplate", () => {
  it("19자리 숫자 → 그대로 반환 + API 호출 0", async () => {
    const fn = vi.fn();
    expect(await resolveTemplate(mockClient({ getProjectTemplates: fn }), "p", "1234567890123456789")).toBe("1234567890123456789");
    expect(fn).not.toHaveBeenCalled();
  });
  it("이름 부분일치 1건 → id 반환", async () => { /* ... */ });
  it("이름 부분일치 0건 → DoorayCliError throw", async () => { /* ... */ });
  it("이름 부분일치 2건 이상 → 모호 에러", async () => { /* ... */ });
});
```

cache mock (vi.mock("../cache/store.js")) 도입 vs ad-hoc client mock 만 — executor 가 phase 실행 시 단순한 client mock 만으로 가능한 케이스 분리. 19자리 분기는 cache 호출 0이라 mock 불요. 이름 분기는 ensureTemplates 가 cache 호출 → `vi.mock("../cache/store.js")` 필요.

## code-review-pitfalls 회피 항목

- **2-2 / 2-3**: `resolveTemplate` 의 catch 블록은 없음 — matchByName 이 throw 만. 단 phase-02 의 caller (post create) 에서 ensureTemplates 의 404 케이스 (잘못된 projectId) 처리가 필요할 수 있음 — phase-02 에서 점검
- **1-1 / 1-2**: 본 phase 는 spinner 없음 (resolver 본체만). phase-02 의 명령 작성 시 점검

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. tsc + build + test (CI 게이트 동일)
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
# 기대: 0
pnpm build && pnpm test
# 기대: exit 0

# 2. 신규 client 메서드 2개
grep -nE "async (getProjectTemplates|getProjectTemplateDetail)\(" src/api/client.ts
# 기대: 2줄

# 3. 신규 cache helper 2개 (templates)
grep -nE "(getTemplates|setTemplates)\b" src/cache/store.ts
# 기대: 2 이상 (정의 + 가능 시 export)

# 4. 신규 resolver export 2개
grep -nE "export (async )?function (ensureTemplates|resolveTemplate)" src/resolvers/template.ts
# 기대: 2 줄

# 5. 단위 테스트 케이스 수
grep -cE "^\s*it\(" src/resolvers/template.test.ts
# 기대: 4

# 6. TTL 상수
grep -nE "TEMPLATES_TTL_MS\s*=\s*86_400_000" src/cache/types.ts
# 기대: 1줄

# 7. CachedTemplate 타입
grep -nE "interface CachedTemplate" src/cache/types.ts
# 기대: 1줄
```

## 작업 외 금지

- `dooray project templates` 명령 / `post create --template` 옵션 추가 금지 — phase-02
- README / SKILL.md 갱신 금지 — phase-03
- 신규 API 메서드 추가 금지 (`getProjectTemplates` + `getProjectTemplateDetail` 만)
- ADR / planning docs 변경 금지 (planning 단계 commit `8603e64` 으로 이미 반영)
- 단위 테스트의 mock reject value 는 code-review-pitfalls 2-3 따라 production path mirror — 본 phase 의 테스트는 ensureTemplates 의 cache mock 만 다루므로 영향 작음

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/031-feat-post-create-template
git add src/api/client.ts src/api/types.ts src/cache/store.ts src/cache/types.ts src/resolvers/template.ts src/resolvers/template.test.ts
git commit -m "feat(api,resolvers): add templates API + resolver + cache (Issue #59 phase 1/3, ADR-027)

- API: getProjectTemplates (목록) + getProjectTemplateDetail (단건, interpolation 기본 true)
- types: TemplateMeta / TemplateDetail / 응답 타입
- cache: TEMPLATES_DIR + TEMPLATES_TTL_MS (24h, tag/workflow 답습)
- resolvers/template.ts: ensureTemplates + resolveTemplate (19자리 → 직접 / 그 외 → matchByName)
- 4 unit tests (resolveTemplate 분기 케이스)

명령 통합 / 사용자 옵션 override 는 phase-02."
```
