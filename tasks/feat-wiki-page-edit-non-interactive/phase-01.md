# Phase 1: API client 메서드 + types (updateWikiPageTitle/Content)

## 컨텍스트

Dooray는 위키 페이지 수정에 3개 엔드포인트를 제공 (`docs/dooray-api-reference.md` §7 "Wiki 페이지 수정 엔드포인트 3종" 참조):
- `PUT /wiki/v1/wikis/{wikiId}/pages/{pageId}` — 제목+본문 동시 (기존 `updateWikiPage` 존재)
- `PUT .../pages/{pageId}/title` — 제목만 (신규 추가)
- `PUT .../pages/{pageId}/content` — 본문만 (신규 추가)

Issue #4에서 `wiki page edit`의 플래그 분기(`--title` 단독, `--body` 단독, 둘 다)에 각 엔드포인트를 매핑한다. 이 phase는 API 레이어만 준비 — unused이지만 빌드 통과해야 함.

### 먼저 읽을 파일

- `src/api/types.ts` L410-435 — 기존 `WikiPageBody`, `UpdateWikiPageRequest`, `CreateWikiPageRequest` 주변 구조
- `src/api/client.ts` L390-398 — 기존 `updateWikiPage` 메서드 시그니처·패턴
- `docs/dooray-api-reference.md` §7 — 3개 엔드포인트 spec

### 이전 커밋 상호작용

```bash
# cwd: /Users/nhn/personal/dooray-cli
git log --oneline -5
```

최근 main (작성 시점 기준):
```
9a685cb docs(api): document wiki page update 3-endpoint split for issue #4
d9c1687 docs(skill): adopt PR-branch completion flow in build-with-teams
a8abe19 chore(task): mark fix-wiki-page-create-parent-fallback as completed
dea29fb docs(task): add fix-wiki-page-create-parent-fallback task for issue #5
50f8c61 docs(api): flesh out dooray-api-reference from official docs
```

`9a685cb`에서 세 엔드포인트를 docs에 문서화. 이 phase는 그 문서의 §7 "Wiki 페이지 수정 엔드포인트 3종" 표의 Body 스펙을 TypeScript로 옮기는 작업.

## 목표

1. `src/api/types.ts`에 `UpdateWikiPageTitleRequest`, `UpdateWikiPageContentRequest` 인터페이스 추가
2. `src/api/client.ts`에 `updateWikiPageTitle`, `updateWikiPageContent` 메서드 추가
3. 빌드 통과 (unused 메서드지만 타입 에러 없이 컴파일)

## 작업 목록

### 1) `src/api/types.ts` 확장

기존 `UpdateWikiPageRequest` 블록(L424-428) **다음 줄**에 append:

```ts
export interface UpdateWikiPageTitleRequest {
  subject: string;
}

export interface UpdateWikiPageContentRequest {
  body: WikiPageBody;
}
```

### 2) `src/api/client.ts` 확장

(a) top import 블록 `types.js` 에서 새 타입 2개 추가:

```ts
  UpdateWikiPageRequest,
  UpdateWikiPageTitleRequest,
  UpdateWikiPageContentRequest,
```

(b) 기존 `updateWikiPage` 메서드(L390-398) **바로 아래**에 append:

```ts
  async updateWikiPageTitle(
    wikiId: string,
    pageId: string,
    body: UpdateWikiPageTitleRequest,
  ): Promise<DoorayApiUnitResponse> {
    try {
      return await this.api
        .put(`wiki/v1/wikis/${wikiId}/pages/${pageId}/title`, { json: body })
        .json<DoorayApiUnitResponse>();
    } catch (e) {
      return toDoorayCliError(e);
    }
  }

  async updateWikiPageContent(
    wikiId: string,
    pageId: string,
    body: UpdateWikiPageContentRequest,
  ): Promise<DoorayApiUnitResponse> {
    try {
      return await this.api
        .put(`wiki/v1/wikis/${wikiId}/pages/${pageId}/content`, { json: body })
        .json<DoorayApiUnitResponse>();
    } catch (e) {
      return toDoorayCliError(e);
    }
  }
```

기존 `updateWikiPage`의 try/catch + `toDoorayCliError` 패턴과 동일 스타일 유지.

### 3) 빌드 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm run build
```

### 4) 정적 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 타입 추가 확인
grep -n "export interface UpdateWikiPageTitleRequest\|export interface UpdateWikiPageContentRequest" src/api/types.ts

# client 메서드 추가 확인
grep -n "async updateWikiPageTitle\|async updateWikiPageContent" src/api/client.ts

# import 업데이트 확인
grep -n "UpdateWikiPageTitleRequest\|UpdateWikiPageContentRequest" src/api/client.ts

# 번들 반영 확인 (URL path로 확인)
grep -c "/title\|/content" dist/index.js
```

## 성공 기준

- [ ] `pnpm run build` 성공 (exit 0)
- [ ] `grep "export interface UpdateWikiPageTitleRequest" src/api/types.ts` → 1줄
- [ ] `grep "export interface UpdateWikiPageContentRequest" src/api/types.ts` → 1줄
- [ ] `grep "async updateWikiPageTitle" src/api/client.ts` → 1줄
- [ ] `grep "async updateWikiPageContent" src/api/client.ts` → 1줄
- [ ] `grep -c "UpdateWikiPageTitleRequest\|UpdateWikiPageContentRequest" src/api/client.ts` → 2 이상 (import + 메서드 시그니처)
- [ ] `grep -c "pages/.*/title\|pages/.*/content" dist/index.js` → 1 이상 (번들에 URL 포함)
- [ ] `git diff --stat src/api/` → 2 파일 수정

## 주의사항

- **기존 `updateWikiPage` 메서드 건드리지 말 것** — editor flow는 그대로 이 메서드를 사용 (phase 3에서 재확인)
- **`WikiPageBody` 재사용** — 새 `UpdateWikiPageContentRequest`는 기존 타입 import, 재정의 금지
- **try/catch + `toDoorayCliError` 패턴 필수** — 다른 메서드와 일관, 에러 메시지 정규화(`normalizeDoorayMessage`)도 자동 적용됨 (Issue #6에서 도입)
- **`.js` 확장자 import** — 기존 컨벤션 (`./types.js`) 유지

## Blocked 조건

- `src/api/types.ts`에서 `UpdateWikiPageRequest` 블록을 못 찾음 → `PHASE_BLOCKED: types.ts 구조 변경 감지`
- `src/api/client.ts`에서 기존 `updateWikiPage` 메서드를 못 찾음 → `PHASE_BLOCKED: client.ts 구조 변경 감지`
- 빌드 실패가 새 타입/메서드 때문이 아닌 사전 존재한 에러 → `PHASE_BLOCKED: 사전 존재한 빌드 에러`
