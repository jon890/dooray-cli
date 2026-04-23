# Dooray API Reference (발췌)

> 출처: https://helpdesk.dooray.com/share/pages/9wWo-xwiR66BO5LGshgVTg/2939987647631384419
>
> 원본이 SPA로 렌더되어 자동 파싱 불가 — 수동 확인한 제약만 이 문서에 기록한다.
> 작업 중 새로운 제약을 발견하면(400 응답, 명시적 문서 확인 등) 여기에 추가할 것.

## 페이지네이션 파라미터 제약

| Endpoint | page 기본 | size 기본 | size 최대 | 비고 |
|---|---|---|---|---|
| `GET /wiki/v1/wikis` | 0 | 20 | **미확인** | 공식 문서 확인 필요 |
| `GET /wiki/v1/wikis/{wikiId}/pages` | 0 | 20 | **미확인** | 공식 문서 확인 필요 |
| `GET /project/v1/projects` | 0 | 20 | **미확인** | - |
| `GET /project/v1/projects/{projectId}/posts` | 0 | 20 | **미확인** | - |
| `GET /project/v1/projects/{projectId}/members` | 0 | 20 | **미확인** | - |
| `GET /project/v1/projects/{projectId}/posts/{postId}/logs` | 0 | 20 | **미확인** | comment list |

## CLI 내부 size 기본값 / 결정

| Caller | size 값 | 근거 |
|---|---|---|
| `wiki list` 커맨드 | 사용자 지정 (기본 20) | 쿼리 기본 |
| `resolveWikiHomePageId` | **100** | 단일 세션 사용자 소유 위키를 전부 캐시하려는 버퍼. 상한 미확인이라 안전빵으로 100 고정. 상한이 확인되면 재검토 |

## 알려진 동작 특이점

- **`wiki page create` — `parentPageId`**: 빈 문자열 또는 미지정 시 400 반환. 사실상 필수. CLI는 `--parent` 생략 시 해당 위키의 `home.pageId`로 자동 폴백 (Issue #5, `resolveWikiHomePageId`).
- **에러 응답 `header.resultMessage`**: URL-encoded(form-encoded) 상태로 내려오는 경우가 있음. CLI 출력 전 `normalizeDoorayMessage`(src/utils/dooray-message.ts)로 정규화 (Issue #6).

## 유지보수 규칙

- size 상한이 확인되면 "미확인" → 실제 값 교체
- 새 endpoint를 사용하기 시작하면 표에 한 줄 추가
- 제약이 바뀐 것으로 관찰되면 "비고"에 관찰 날짜와 상황 기록
