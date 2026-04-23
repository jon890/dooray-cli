# Phase 2: resolveWikiHomePageId + page-create 연동 + 빌드 검증

## 컨텍스트

Phase 1에서 wiki 캐시 인프라(`CachedWiki`, `WIKIS_TTL_MS`, `getWikis`/`setWikis` in cache/store)가 추가됐다. 이 phase에서는 (a) home pageId를 캐시와 함께 조회하는 resolver를 추가하고, (b) `wiki page create` 커맨드가 `--parent` 미지정 시 그 resolver로 폴백하도록 연결한다.

### 먼저 읽을 파일

- `src/resolvers/wiki.ts` — 기존 `resolveWiki(client, projectCode)` 구조
- `src/commands/wiki/page-create.ts` — 현재 `parentPageId: opts.parent ?? ""` 로 빈 문자열 fallback되어 400 유발
- `src/api/types.ts` L354-373 — Wiki.home.pageId 필드 구조
- `src/api/client.ts` L341-354 — `getWikis({ page?, size? })` 메서드
- `src/cache/store.ts` — Phase 1에서 추가된 `getWikis`/`setWikis` (cache side)
- `src/cache/types.ts` — Phase 1에서 추가된 `CachedWiki`, `WIKIS_TTL_MS`
- `docs/dooray-api-reference.md` — size=100 결정 및 근거

### 이전 phase 상호작용

Phase 1의 `CachedWiki`, `WIKIS_TTL_MS`, cache 측 `getWikis`/`setWikis`가 이 phase의 전제. Phase 1이 먼저 완료되어야 빌드 통과.

### 설계 원칙

- **cache-first**: cache miss or stale(24h 경과) 시에만 `client.getWikis({ size: 100 })` 호출
- **매핑 단순화**: Wiki 응답 → CachedWiki (id, project.id, name, home.pageId)
- **에러 명확화**: 대상 wikiId가 응답에 없거나 `home.pageId`가 비어있으면 CLI 단에서 명시적 에러 (Issue #5 Acceptance 3번)
- **기존 동작 보존**: `--parent <id>` 지정 시 기존 로직 그대로

## 목표

1. `src/resolvers/wiki.ts`에 `resolveWikiHomePageId(client, wikiId): Promise<string>` 신설
2. `src/commands/wiki/page-create.ts` 의 `parentPageId` 계산을 fallback 로직으로 교체
3. 빌드 통과 + smoke test (`--help` 출력)

## 작업 목록

### 1) `src/resolvers/wiki.ts` 확장

(a) top import 블록 확장 — 기존 import에 추가:

```ts
import { DoorayApiClient } from "../api/client.js";
import { getProjects, getWikis, setWikis, isExpired } from "../cache/store.js";
import { PROJECTS_TTL_MS, WIKIS_TTL_MS, type CachedWiki } from "../cache/types.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_API_ERROR, EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import { resolveProject } from "./project.js";
```

(b) 파일 하단에 새 함수 export:

```ts
export async function resolveWikiHomePageId(
  client: DoorayApiClient,
  wikiId: string,
): Promise<string> {
  const cached = await getWikis();
  const fresh = cached && !isExpired(cached.updatedAt, WIKIS_TTL_MS);

  let wikis: CachedWiki[];
  if (fresh) {
    wikis = cached.data;
  } else {
    const res = await client.getWikis({ size: 100 });
    wikis = res.result.map((w) => ({
      id: w.id,
      projectId: w.project.id,
      name: w.name,
      homePageId: w.home.pageId,
    }));
    await setWikis(wikis);
  }

  const wiki = wikis.find((w) => w.id === wikiId);
  if (!wiki?.homePageId) {
    throw new DoorayCliError(
      `위키의 home 페이지를 찾을 수 없습니다 (wikiId: ${wikiId})`,
      EXIT_API_ERROR,
    );
  }
  return wiki.homePageId;
}
```

**주의**: `getWikis` import는 `cache/store.js`에서만. `client.getWikis({ size: 100 })`는 인스턴스 메서드 호출이므로 별도 import 없음.

### 2) `src/commands/wiki/page-create.ts` 수정

(a) resolver import 확장 — 기존 줄 교체:

```ts
import { resolveWiki, resolveWikiHomePageId } from "../../resolvers/wiki.js";
```

(b) action 내부 `parentPageId` 계산 로직 교체 — 현재 L54-60 블록:

```ts
    startSpinner("위키 페이지 생성 중...");
    const wikiId = await resolveWiki(client, project);
    const parentPageId = opts.parent ?? (await resolveWikiHomePageId(client, wikiId));

    const res = await client.createWikiPage(wikiId, {
      subject: opts.title,
      body: { mimeType: "text/x-markdown", content: bodyContent },
      parentPageId,
    });
```

변경점:
- 기존: `parentPageId: opts.parent ?? ""` (빈 문자열)
- 신규: `parentPageId: opts.parent ?? (await resolveWikiHomePageId(...))`
- fallback 호출은 `client.createWikiPage` 이전에 수행 — spinner 동작 중

### 3) 빌드 + smoke 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm run build
node dist/index.js wiki page create --help
```

smoke 기대 출력: `--parent <page-id>` 옵션 표시, exit 0.

### 4) 정적 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli

# resolver 함수 추가 확인
grep -n "export async function resolveWikiHomePageId" src/resolvers/wiki.ts

# command에서 resolver 사용 확인
grep -n "resolveWikiHomePageId" src/commands/wiki/page-create.ts

# 기존 빈 문자열 fallback이 사라졌는지 확인
grep -n 'opts.parent ?? ""' src/commands/wiki/page-create.ts || echo "OK_REMOVED"

# size=100 번들 포함 확인
grep -c '"size":100\|size: 100' dist/index.js

# EXIT_API_ERROR import 확인 (resolver에서 사용)
grep -n "EXIT_API_ERROR" src/resolvers/wiki.ts
```

## 성공 기준

- [ ] `pnpm run build` 성공 (exit 0)
- [ ] `node dist/index.js wiki page create --help` exit 0 + `--parent` 옵션 출력에 존재
- [ ] `grep "export async function resolveWikiHomePageId" src/resolvers/wiki.ts` → 1줄
- [ ] `grep "resolveWikiHomePageId" src/commands/wiki/page-create.ts` → 2줄 (import + 호출)
- [ ] `grep 'opts.parent ?? ""' src/commands/wiki/page-create.ts` → 0줄 (매치 없음)
- [ ] `grep -c "size.*100\|size:100" dist/index.js` → 1 이상 (번들 난독화 대비 유연한 매치)
- [ ] `git diff --stat src/resolvers/wiki.ts src/commands/wiki/page-create.ts` → 2 파일 수정

## 주의사항

- **size=100 고정** — `docs/dooray-api-reference.md`의 결정 사항. 변경 금지
- **spinner 상태 유지** — fallback 호출(`resolveWikiHomePageId`)이 spinner 시작 후, `createWikiPage` 이전에 들어가야 실패 시 spinner가 에러로 stop됨
- **`EXIT_API_ERROR` 선택 근거** — home pageId 조회 실패는 API 결과의 부재(API 호출은 성공했지만 원하는 wiki가 없음)에 해당 → API_ERROR. 사용자 입력 문제가 아니므로 PARAM_ERROR 아님
- **기존 `resolveWiki` 건드리지 말 것** — 반환 타입(`string`)과 캐싱 로직 변경 없음. 새 함수는 parallel로 추가만

## Blocked 조건

- Phase 1에서 `CachedWiki`/`getWikis`/`setWikis`/`WIKIS_TTL_MS`가 실제로 추가되지 않음 → `PHASE_BLOCKED: Phase 1 산출물 누락`
- `src/commands/wiki/page-create.ts`에 `parentPageId: opts.parent ?? ""` 패턴이 더 이상 존재하지 않음 (누군가 먼저 수정) → `PHASE_BLOCKED: page-create.ts 구조 변경 감지`
- smoke test에서 `wiki page create --help` exit != 0 → `PHASE_BLOCKED: help 커맨드 회귀`
