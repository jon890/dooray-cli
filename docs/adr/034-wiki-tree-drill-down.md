## ADR-034: wiki tree 레벨별 drill-down 재귀 조립 (flat list endpoint 부재)

**결정**: `dooray wiki tree` 는 root 페이지부터 레벨별 재귀로 전체 페이지를 모아 트리를 그린다.
- 클라이언트에 `getAllWikiPages(wikiId, maxDepth?)` 신설 — 레벨별 BFS + 같은 부모 형제는 `Promise.all` 병렬 조회.
- `--depth N` 으로 재귀 상한 지정, 미지정 시 전체.
- `--json` 은 flat 배열 (`parentPageId` 포함) — 기존 `wiki pages --json` 스키마와 동일. 트리는 text 출력에만 적용.

**맥락**: Dooray Wiki 의 페이지 목록 endpoint 는 flat 전체 조회를 제공하지 않는다 (실측, 공식 문서에 없는 동작).

- `GET /wiki/v1/wikis/{wikiId}/pages` (parentPageId 없이) → **root 페이지만** 반환. 전체 flat 아님.
- `GET .../pages?parentPageId=X` → **X 의 직속 자식만** 반환.
- root 응답 항목엔 `parentPageId` 필드 없음. 자식 응답 항목에만 존재 (`root: false` + `parentPageId`).

따라서 전체 트리를 얻으려면 root → 자식 → 손자 순으로 레벨을 내려가며 페이지 수만큼 API 를 호출해야 한다.
단일 호출 + 클라이언트 조립은 불가능하다.

**대안 기각**:
- `wiki pages --tree` 플래그 확장 — `pages` 는 root-only(또는 특정 parent) 단일 레벨 조회가 본래 역할. 전체 재귀는 성격이 달라 별 명령이 의미를 명확히 함.
- flat 단일 호출로 조립 — endpoint 가 flat 을 반환하지 않아 원천 불가.
- `--json` 을 children 중첩 트리로 — 기존 `wiki pages --json` flat 스키마와 어긋나 자동화 파싱 호환이 깨짐.

**트레이드오프**: 대형 위키는 페이지 수만큼 호출이 발생한다.
레벨별 `Promise.all` 병렬화로 완화하고, `--depth` 로 사용자가 범위를 좁힐 수 있게 한다.

> 페이지 create/edit 쪽 함정은 ADR-026 으로 분리 (읽기 drill-down 과 무관한 별 관심사).
