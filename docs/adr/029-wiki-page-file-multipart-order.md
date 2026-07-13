## ADR-029: wiki page file multipart `type` 필드 순서 의존성

**결정**: `POST /wiki/v1/wikis/{wikiId}/pages/{pageId}/files` 호출 시 multipart form-data 의 `type` 필드를 **`file` 필드보다 먼저** append 한다.
클라이언트 (`uploadWikiPageFile`) 가 순서를 강제, 호출자가 신경 쓰지 않도록 캡슐화.

**맥락**: Dooray 공식 문서 ([share 페이지](https://helpdesk.dooray.com/share/pages/9wWo-xwiR66BO5LGshgVTg/2939987647631384419)) 명시:

> form-data 필드 순서가 중요합니다. 반드시 type 필드를 먼저 보내고, 그 다음에 file 필드를 보내야 정상 동작합니다.

RFC 7578 (multipart/form-data) 는 필드 순서 무관을 기본으로 하지만, Dooray 서버는 `type` 을 먼저 파싱해 분기하는 듯 (silent fail or 400 가능).
`post file upload` (ADR-015) 는 `file` 만 보내 이슈가 없었으나 wiki 는 `type=general|inline_image` 분기가 필수.

**대안 기각**:
- 호출자가 직접 순서 책임 — 4 개 명령 (upload + 향후 inline 자동삽입 등) 에서 같은 함정 반복 위험. 클라이언트 캡슐화가 단일 소스
- `type` 필드 생략 + Dooray 의 default 동작 기대 — 문서가 required 명시. silent fail 시 디버깅 비용 ↑
- 307 redirect 후 본 요청에서만 순서 보장 — 307 의 location 도 동일 endpoint, 그러나 fetch 의 재시도 시 FormData 순서가 보장되는지 환경 의존. 307 + 본 요청 모두에서 명시적으로 append 순서를 보장

**적용 범위**:
- `src/api/client.ts` `uploadWikiPageFile(wikiId, pageId, filePath, type)` — `formData.append("type", type)` 를 `formData.append("file", ...)` 보다 **반드시 먼저** 호출
- 307 redirect 처리 (ADR-015 패턴 재사용) 시 동일한 FormData 객체 재사용으로 순서 보존
- `type` 값은 `"general" | "inline_image"` 만 허용 (TypeScript literal type)

**적용 외**:
- `wiki page file download` / `delete` 는 multipart 무관
- 본문 markdown 자동 삽입 (`updateWikiPageContent` 호출) 은 본 task scope 제외 (사용자 결정 — upload 출력에 `attachFileId` + snippet 만 제공, 사용자가 직접 본문에 박음)
