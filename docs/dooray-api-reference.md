# Dooray API Reference (발췌)

> 출처: https://helpdesk.dooray.com/share/pages/9wWo-xwiR66BO5LGshgVTg/2939987647631384419
>
> 공식 문서에서 이 프로젝트에 필요한 부분만 발췌·정리. 원본은 SPA라 자동 파싱이 어려워 수동으로 옮긴다.
> 새 제약을 발견하면(400 응답, 공식 문서 업데이트 등) 여기에 추가한다.

## 1. Endpoint (클라우드별)

| 환경 | Base URL |
|---|---|
| 민간 클라우드 | `https://api.dooray.com` |
| 공공 클라우드 | `https://api.gov-dooray.com` |
| 공공 업무망 클라우드 | `https://api.gov-dooray.co.kr` |
| 금융 클라우드 | `https://api.dooray.co.kr` |

## 2. 인증

- 헤더: `Authorization: dooray-api {TOKEN}`
- 토큰 권한 = 발급 계정 권한 (IP/User ACL 포함)
- **TLS 1.2 이상 필수** (1.0, 1.1 미지원)

## 3. 응답 구조

모든 응답은 JSON. 기본 구조:

```json
{
  "header": {
    "isSuccessful": true,
    "resultCode": 0,
    "resultMessage": ""
  },
  "result": { /* or [] */ },
  "totalCount": 0
}
```

- `header.resultMessage`는 **사람용 텍스트** — 예고 없이 변경될 수 있으며, 로직 분기에 사용하지 말 것
- CLI는 출력 전 `normalizeDoorayMessage`(src/utils/dooray-message.ts)로 URL-encoded 메시지 정규화 (Issue #6)
- 스펙에 없는 추가 필드가 응답에 포함될 수 있음 — 무시

### HTTP Status Codes

| 코드 | 의미 |
|---|---|
| 200 | 성공 |
| 301/302/303/307 | 리소스 위치 변경 (파일 API 등에서 사용) |
| 400 | 사용자 입력 오류 |
| 401 | 인증 실패 (토큰 없음/폐기/오류) |
| 403 | 권한 없음 |
| 404 | 리소스 없음 (권한 없음도 404로 나올 수 있음) |
| 409 | 중복 리소스 생성 |
| 415 | Content-Type 불일치 |
| 429 | Rate limit 초과 |
| 500 | 서버 오류 |

## 4. Rate Limiter (Token Bucket)

1초마다 토큰 보충, 응답 헤더로 상태 제공:

| 헤더 | 의미 |
|---|---|
| `X-RateLimit-Remaining` | 남은 토큰 |
| `X-RateLimit-Requested-Tokens` | 이번 요청 사용 |
| `X-RateLimit-Burst-Capacity` | 최대 버스트 |
| `X-RateLimit-Replenish-Rate` | 초당 보충 |

- 값은 예고 없이 변경 가능 — 고정값 가정 금지, 응답 헤더 값 사용
- 429 응답 시 잠시 후 재시도

> CLI에서 재시도/백오프 로직은 현재 미구현. 추후 필요 시 별도 ADR.

## 5. 페이지네이션 제약

모든 GET 목록 API의 기본 파라미터:
- `page` = 0 base, 기본 0
- `size` = 기본 20

**대부분 엔드포인트 `size` 최댓값 = 100.** 예외만 별도 표기.

### 우리가 사용하는 엔드포인트

| Endpoint | size max | 비고 |
|---|---|---|
| `GET /common/v1/members` | 100 | `externalEmailAddresses` 필수 |
| `GET /project/v1/projects` | 100 | `member=me`로 내 프로젝트만 |
| `GET /project/v1/projects/{projectId}/members` | 100 | |
| `GET /project/v1/projects/{projectId}/posts` | 100 | |
| `GET /project/v1/projects/{projectId}/posts/{postId}/logs` | 100 | comment list |
| `GET /project/v1/projects/{projectId}/workflows` | 페이지네이션 없음 | 단일 응답 |
| `GET /wiki/v1/wikis` | **명시되지 않음** | 공식 문서에 기본 20만 기재, 최댓값 미명시. 실측 전까진 100을 상한으로 간주 |
| `GET /wiki/v1/wikis/{wikiId}/pages` | 페이지네이션 없음 | `parentPageId`로 sibling 조회 |

### 예외 (size max ≠ 100)

| Endpoint | size max |
|---|---|
| `GET /wiki/v1/wikis/{wikiId}/pages/{pageId}/shared-links` | 200 |
| `GET /drive/v1/drives/{driveId}/changes` | 200 |
| `GET /reservation/v1/resource-categories` | 20 (!) |
| `GET /reservation/v1/resource-reservations` | 20 (!) |

## 6. CLI 내부 size 결정

| Caller | 값 | 근거 |
|---|---|---|
| `wiki list` | 사용자 지정 (기본 20) | 쿼리 기본 |
| `resolveWikiHomePageId` | **100** | 공식 문서 wiki list max 미명시. 다른 endpoint 관례인 100 채택. 상한 확인되면 재검토 |

## 7. 알려진 동작 특이점

### `POST /wiki/v1/wikis/{wikiId}/pages`
- `parentPageId`: 공식 문서에는 "wiki 부모 페이지를 지정"이라 optional처럼 보이지만, **빈 문자열/미지정 시 400 반환**. 사실상 필수
- CLI는 `--parent` 생략 시 해당 위키의 `home.pageId`로 자동 폴백 (Issue #5, `resolveWikiHomePageId`)

### 에러 응답 `header.resultMessage`
- URL-encoded(form-encoded) 상태로 내려오는 경우가 있음
- 예: `%EC%9E%85%EB%A0%A5%ED%95%9C+%EB%82%B4%EC%9A%A9%EC%97%90+...` → "입력한 내용에 오류가 있습니다."
- CLI는 출력 전 `normalizeDoorayMessage`로 정규화 (Issue #6)

### Wiki `subject`/`title` 네이밍
- API body 필드는 `subject` (업무·위키 공통)
- CLI는 `wiki page create/edit` 에서 `--title` 플래그 사용 — API 매핑 시점에서 `subject`로 변환

### Wiki 페이지 수정 엔드포인트 3종
Dooray는 위키 페이지 수정을 3개 엔드포인트로 분리 제공:

| Endpoint | 용도 | Body |
|---|---|---|
| `PUT /wiki/v1/wikis/{wikiId}/pages/{pageId}` | 제목+본문 동시 수정 | `{ subject?, body?, referrers? }` |
| `PUT /wiki/v1/wikis/{wikiId}/pages/{pageId}/title` | 제목만 수정 | `{ subject }` |
| `PUT /wiki/v1/wikis/{wikiId}/pages/{pageId}/content` | 본문만 수정 | `{ body: { mimeType, content } }` |

CLI `wiki page edit` 분기 (Issue #4):
- 플래그 없음 → `$EDITOR` 열고 제목+본문 동시 수정 (`/pages/{pageId}`)
- `--title X` 단독 → `/title`
- `--body` or `--body-file` 단독 → `/content`
- `--title` + body 플래그 → `/pages/{pageId}` (동시 수정)

단일 필드 수정 시 main PUT에 partial body를 보내는 대신 dedicated endpoint를 쓴다 — 공식 문서 의도와 일치, 서버 partial 수용 여부 불확실성 제거.

### 파일 API (307 redirect)
- 파일 업로드/다운로드는 `api.dooray.com` 대신 `file-api.dooray.com`으로 라우팅 필요
- 첫 요청이 307 응답 → Location 헤더의 실제 파일 서버로 재요청 (클라이언트에서 `redirect: "manual"` 후 처리)

## 8. 유지보수 규칙

- size 최댓값이 확인되면 "명시되지 않음" → 실제 값 교체
- 새 endpoint를 사용하기 시작하면 §5 표에 한 줄 추가
- 제약/동작이 변경된 것으로 관찰되면 §7에 관찰 날짜와 상황 기록
- 공식 문서에서 **명시되지 않은 사항은 "미명시"로 표기하고, 실측/추측은 주석으로 분리**
