# Phase 01 — WikiPage 타입 확장 + client getAllWikiPages 재귀 조회

**Model**: sonnet
**Status**: pending

---

## 목표

`dooray wiki tree` 가 페이지 계층 전체를 얻을 수 있도록 데이터 계층을 만든다.
Dooray Wiki 의 페이지 목록 endpoint 는 flat 전체 조회를 제공하지 않는다 (실측, ADR-034 참조):

- `GET /wiki/v1/wikis/{wikiId}/pages` (parentPageId 없이) → **root 페이지만** 반환.
- `GET .../pages?parentPageId=X` → **X 의 직속 자식만** 반환.
- root 응답 항목엔 `parentPageId` 없음. 자식 응답 항목에만 존재 (`root: false` + `parentPageId`).

따라서 root 부터 레벨별로 자식을 재귀 조회해 전체 페이지를 flat 배열로 모은다.

**범위 외**: 포맷터·커맨드·index.ts 등록은 phase-02. 테스트는 phase-03.

---

## 작업 항목 (2)

### 1. `src/api/types.ts` — WikiPage 타입에 계층 필드 추가

현재 `WikiPage` 인터페이스 (491행 부근):

```ts
export interface WikiPage {
  id: string;
  wikiId: string;
  version: number;
  root: boolean;
  creator: Creator;
  subject: string;
}
```

`parentPageId` 필드를 추가한다 (root 응답엔 없으므로 optional):

```ts
  parentPageId?: string;
```

`root: boolean` 은 이미 있으니 그대로 둔다.

### 2. `src/api/client.ts` — `getAllWikiPages` 재귀 메서드 신설

기존 `getWikiPages(wikiId, parentPageId?)` (495행 부근) 는 그대로 두고, 이를 이용하는 재귀 메서드를 추가한다.

시그니처:

```ts
async getAllWikiPages(wikiId: string, maxDepth?: number): Promise<WikiPage[]>
```

동작:

- 레벨 0: `getWikiPages(wikiId)` 로 root 페이지들을 가져온다 (parentPageId 없이 호출).
- 레벨 N → N+1: 현재 레벨 페이지 각각에 대해 `getWikiPages(wikiId, page.id)` 를 **`Promise.all` 로 병렬** 호출해 자식들을 모은다.
- 자식이 없으면(빈 배열) 그 가지는 종료.
- 모든 레벨을 순회하며 만난 페이지를 하나의 flat 배열에 누적해 반환한다 (root 포함).
- `maxDepth` 지정 시: root 를 depth 1 로 보고, `maxDepth` 레벨까지만 자식을 조회한다.
  - `maxDepth === 1` → root 만.
  - `maxDepth === 2` → root + 직속 자식.
  - `maxDepth === undefined` → 제한 없음(전체).
- 개별 `getWikiPages` 호출은 기존과 동일하게 실패 시 `toDoorayCliError` 로 던진다 (client 메서드가 이미 try/catch 함 — 재귀 래퍼는 그 예외를 그대로 전파).

구현 형태 예 (레벨별 BFS):

```ts
async getAllWikiPages(wikiId: string, maxDepth?: number): Promise<WikiPage[]> {
  const all: WikiPage[] = [];
  let level = await this.getWikiPages(wikiId).then((r) => r.result);
  let depth = 1;
  while (level.length > 0) {
    all.push(...level);
    if (maxDepth !== undefined && depth >= maxDepth) break;
    const childBatches = await Promise.all(
      level.map((p) => this.getWikiPages(wikiId, p.id).then((r) => r.result)),
    );
    level = childBatches.flat();
    depth++;
  }
  return all;
}
```

기존 코드 스타일(다른 client 메서드의 `.json<...>()` 패턴)과 일관되게 작성한다.

---

## 회피 항목 (code-review pitfalls self-check)

- `docs/pitfalls/code-review/non-ky-http-client.md` — 반드시 기존 `this.api`(ky) 경유. 새 http 클라이언트 도입 금지. `getWikiPages` 재사용이므로 자동 충족.
- `docs/pitfalls/code-review/map-get-non-null-assertion.md` — 트리 조립은 phase-02 이지만, 여기서도 `Map.get()!` 같은 non-null 단언을 쓰지 않는다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/api/types.ts` | 수정 — `WikiPage.parentPageId?: string` 추가 |
| `src/api/client.ts` | 수정 — `getAllWikiPages(wikiId, maxDepth?)` 추가 |

## 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli/.claude/worktrees/plan048
pnpm tsc --noEmit
# 0 에러

grep -n "parentPageId" src/api/types.ts
# WikiPage 블록 안에 parentPageId 추가 확인

grep -n "getAllWikiPages" src/api/client.ts
# 메서드 존재 확인
```

## 의도 메모 (왜)

- flat endpoint 부재는 ADR-034 실측 근거. 단일 호출 조립이 불가능해 재귀가 유일한 경로.
- `Promise.all` 레벨 병렬화로 대형 위키의 호출 지연을 완화 (형제는 서로 독립).
- `maxDepth` 는 `--depth` 옵션(phase-02)이 소비. root=depth 1 기준을 여기서 확정해 phase-02 가 오프바이원 없이 전달.
- 이 phase 가 phase-02(포맷터·커맨드)의 데이터 소스를 막아준다.
