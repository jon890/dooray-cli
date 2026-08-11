## ADR-026: Wiki API 호출 패턴 함정 (parentPageId 필수 + subject/title 네이밍 + 페이지 수정 3종 endpoint)

**결정**: Wiki API 호출 시 다음 3개 함정을 클라이언트 레이어에서 흡수:
- `parentPageId` 자동 폴백 (`resolveWikiHomePageId`)
- `--title` → `subject` 매핑
- 수정 동작별 endpoint 분기 (`/pages/{id}`, `/title`, `/content`)

**맥락**: Dooray Wiki API 의 다음 동작은 공식 문서에 없거나 직관에 반함:

- **`parentPageId` 사실상 필수** — `POST /wiki/v1/wikis/{wikiId}/pages` 의 `parentPageId` 가 공식적으로는 optional 처럼 보이나 미지정/빈 문자열 시 400.
  사용자 UX 보존 위해 CLI 가 `home.pageId` 로 자동 폴백 (Issue #5)
- **`subject` vs `title` 네이밍 불일치** — API body 필드는 `subject` (업무·위키 공통). 사용자 친화 위해 CLI 는 `--title` 플래그로 노출, 매핑
- **페이지 수정 endpoint 3종 분리** — Dooray 가 제목+본문 동시, 제목만, 본문만을 별도 endpoint 로 제공.
  CLI `wiki page edit` 가 플래그 조합으로 라우팅 분기 (Issue #4)

**대안 기각**:
- `parentPageId` 미지정 허용 (서버 에러 그대로 노출) — UX 회귀, 사용자가 wiki home 개념 몰라도 동작해야 함
- API 필드명 그대로 `--subject` 노출 — post 명령군이 `--title` 로 통일됐는데 wiki 만 다른 이름이면 일관성 깨짐 (Issue #8 의 통합 결정과 모순)
- 단일 PUT 으로 partial body 시도 — 서버의 partial 수용 여부 불확실. dedicated endpoint 사용이 공식 의도와 일치

**페이지 수정 endpoint 분기 규칙**:

| Endpoint | 용도 | CLI 트리거 |
|---|---|---|
| `PUT .../pages/{pageId}` | 제목+본문 동시 | 플래그 없음 (`$EDITOR`) 또는 `--title`, body 둘 다 |
| `PUT .../pages/{pageId}/title` | 제목만 | `--title X` 단독 |
| `PUT .../pages/{pageId}/content` | 본문만 | `--body` 또는 `--body-file` 단독 |

> member-group `code` 누락은 ADR-028 로 분리 (wiki 도메인과 무관한 별 함정).
