## ADR-032: wiki page delete — 비공식(미문서화) DELETE endpoint

**결정**: `dooray wiki page delete` 를 `DELETE /wiki/v1/wikis/{wikiId}/pages/{pageId}` 로 구현한다.
Dooray 공식 API 문서에 없는 **비공식 endpoint** 이며, 이 점을 명령 도움말과 클라이언트 메서드 주석에 표기해 이후 API 변경 시 추적을 돕는다.
파괴적 명령이라 confirm 을 기본 적용하고 `--yes`(`-y`) 로 생략한다.

**맥락**: `wiki page create` / `edit` 는 있으나 `delete` 가 없어 위키 재구성 자동화에서 페이지 삭제만 수동이었다 (Issue #87).
공식 문서에 삭제 endpoint 가 없지만 위 경로가 동작함을 실측 확인:

- 응답 `{"header":{"isSuccessful":true,"resultCode":0},"result":null}`.
- 이후 페이지 목록 조회에서 해당 페이지 사라짐 (단건 3건 반복 재현).
- **하위 페이지 재부착**(실측 관찰): 하위 페이지를 가진 페이지를 삭제하면 하위 페이지들이 삭제된 페이지의 부모(조부모)의 자식으로 재부착된다 — orphan 발생 안 함. 따라서 삭제 전 하위 페이지 사전 조회·차단은 두지 않는다.

**미확인**: 완전 삭제인지 휴지통 이동인지 (콘솔 휴지통 미대조). 비공식이라 서버 정책 변경 가능.

**대안 기각**:
- 삭제 미지원 유지 — 자동화에서 페이지 삭제만 수동이라 반쪽. 실측으로 안정 동작 확인돼 도입 가치가 미문서화 리스크를 상회.
- 하위 페이지 있으면 차단 + `--recursive` — 하위가 orphan 없이 재부착되므로 차단은 과보호. 플래그·서버 동작 가정만 늘림.
- confirm 없이 즉시 (`wiki page file delete` mirror) — 파일 1개 삭제보다 페이지(+하위 트리 재구성) 영향이 커 confirm 기본이 안전.

**적용 범위**:
- `src/api/client.ts` `deleteWikiPage(wikiId, pageId)` — plain `.delete()` (파일 API 의 307 처리 불요, post log delete 와 동일 패턴).
- 입력 해석은 `resolveWikiPageInput` 재사용 (`<project> <page-id>` / `--id`+`--project` / `--url` / positional URL).
- confirm: 기본 y/N, non-TTY abort, `--yes`/`-y` 로 생략.
- 출력: `--json {pageId, status:"deleted"}` / `--quiet pageId` / 기본 prose.

**참고**: 위키 페이지 "이동"(parentPageId 변경)은 API 로 불가 — 수정 PUT 이 `parentPageId` 를 무시하고 `/move` 류 endpoint 없음 (Issue #87 제보). 삭제와 무관하나 wiki API 제약으로 함께 기록.
