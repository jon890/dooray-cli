# Phase 1: Wiki 캐시 인프라 확장 (CachedWiki + store)

## 컨텍스트

dooray-cli는 `~/.dooray/cache/` 디렉터리에 파일별로 캐시를 저장한다 (projects.json, members/{id}.json 등). 현재 **wiki 캐시는 없음**. Issue #5 해결을 위해 wiki 메타(특히 `home.pageId`)를 캐시할 인프라를 먼저 준비한다.

### 먼저 읽을 파일

- `src/cache/types.ts` — 기존 TTL 상수 + CachedX 타입 정의
- `src/cache/store.ts` — 기존 Projects/Members/Workflows 섹션 패턴
- `src/api/types.ts` L354-373 — Wiki/WikiHome/WikiProject 응답 타입
- `docs/dooray-api-reference.md` — size=100 결정 근거

### 이전 커밋 상호작용

```bash
# cwd: /Users/nhn/personal/dooray-cli
git log --oneline -5
```

최근 main:
```
4ab2709 docs(api): add dooray-api-reference.md for endpoint constraints
04fdf7e docs(task): add fix-dooray-error-decode task for issue #6
42bb4fe Merge pull request #3 from jon890/feat/insight-import
...
```

이 phase는 `docs/dooray-api-reference.md`(방금 커밋)의 size 정책을 전제로 진행.

### 설계 원칙

- 기존 Projects 섹션 패턴과 일관 (WIKIS_PATH, getWikis/setWikis, TTL)
- 캐시 저장 단위는 "전체 위키 목록" — wiki list API가 유저 소유 전부를 한번에 반환하므로 단일 파일(`wikis.json`)이 자연
- TTL은 24h (WORKFLOWS_TTL_MS와 동일) — wiki home.pageId는 거의 변하지 않음

## 목표

1. `src/cache/types.ts`에 `WIKIS_TTL_MS` 상수 + `CachedWiki` 인터페이스 추가
2. `src/cache/store.ts`에 wikis 섹션(`WIKIS_PATH`, `getWikis`, `setWikis`) 추가
3. 빌드 통과 (호출자 없어도 OK — 무해한 인프라)

## 작업 목록

### 1) `src/cache/types.ts` 확장

파일 끝에 append. 기존 export들과 동일 스타일 유지.

```ts
export const WIKIS_TTL_MS = 86_400_000; // 24h — wiki home은 거의 불변

export interface CachedWiki {
  id: string;
  projectId: string;
  name: string;
  homePageId: string;
}
```

### 2) `src/cache/store.ts` 확장

(a) top import 블록에서 `CachedWiki` 추가:

```ts
import type {
  CacheEntry,
  CachedMe,
  CachedProject,
  CachedMember,
  CachedWorkflow,
  CachedWiki,
} from "./types.js";
```

(b) CACHE_DIR 상수 블록에 `WIKIS_PATH` 추가:

```ts
const WIKIS_PATH = join(CACHE_DIR, "wikis.json");
```

(c) Workflows 섹션 아래, Clear 섹션 위에 Wikis 섹션 추가:

```ts
// ─── Wikis ────────────────────────────────────────────────

export async function getWikis(): Promise<CacheEntry<CachedWiki[]> | null> {
  return readJson<CacheEntry<CachedWiki[]>>(WIKIS_PATH);
}

export async function setWikis(items: CachedWiki[]): Promise<void> {
  await writeJson(WIKIS_PATH, { updatedAt: now(), data: items } satisfies CacheEntry<CachedWiki[]>);
}
```

**주의**: `getWikis`는 이 파일에 새로 추가되는 export. 기존 `DoorayApiClient.getWikis()`(인스턴스 메서드)와 이름이 겹치지만 호출 경로가 다르므로 충돌 없음.

### 3) 빌드 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm run build
```

### 4) 정적 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 타입 추가 확인
grep -n "WIKIS_TTL_MS\|CachedWiki" src/cache/types.ts

# store 추가 확인
grep -n "WIKIS_PATH\|export async function getWikis\|export async function setWikis" src/cache/store.ts

# import 업데이트 확인
grep -n "CachedWiki" src/cache/store.ts

# 빌드 산출물에 반영 확인 (CachedWiki는 type-only라 dist에 안 나올 수 있음 — WIKIS_PATH 존재 여부만 확인)
grep -c "wikis.json" dist/index.js
```

## 성공 기준

- [ ] `pnpm run build` 성공 (exit 0)
- [ ] `grep "export const WIKIS_TTL_MS" src/cache/types.ts` → 1줄
- [ ] `grep "export interface CachedWiki" src/cache/types.ts` → 1줄
- [ ] `grep "export async function getWikis" src/cache/store.ts` → 1줄
- [ ] `grep "export async function setWikis" src/cache/store.ts` → 1줄
- [ ] `grep "WIKIS_PATH" src/cache/store.ts` → 2줄 이상 (선언 + 사용)
- [ ] `grep -c "wikis.json" dist/index.js` → 1 이상
- [ ] `git diff --stat src/cache/` → 2 파일 수정

## 주의사항

- **cache/store.ts의 섹션 순서 유지** — `Wikis` 섹션은 `Workflows` 다음, `Clear` 앞에 위치
- **import에 .js 확장자** — 기존 컨벤션 (`./types.js`) 유지
- **TTL 값 변경 금지** — 24h 유지 (wiki home은 거의 불변, 하루 한 번 갱신으로 충분)
- **size 관련 코드 없음** — size=100은 Phase 2의 resolver에서 처리. 이 phase는 순수 인프라

## Blocked 조건

- `src/cache/types.ts` 또는 `src/cache/store.ts` 파일이 존재하지 않음 → `PHASE_BLOCKED: cache 파일 구조 변경 감지 — 수동 확인 필요`
- 빌드 실패가 CachedWiki 추가로 인한 타입 에러가 아닌 다른 원인 → `PHASE_BLOCKED: 사전 존재한 타입/빌드 에러`
