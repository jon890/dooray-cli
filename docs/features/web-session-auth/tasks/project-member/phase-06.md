# Phase 06. API 영역별 계약과 웹 구현을 나눈다

**Execution profile**: standard

## 목표

사용자 결정(2026-11-14)의 API 영역별 구조로 바꿔 뒤 PR 이 다른 영역을 동시에 구현할 수 있게 한다.

**범위 외**: 뒤 PR 웹 메서드 구현.

## 컨텍스트

**요구사항**: REQ1, REQ6, REQ8, REQ17

**근거 문서**: `docs/features/web-session-auth/spec.md`, `docs/features/web-session-auth/design.md`

## 작업 항목

### 1. 영역 인터페이스

api/<영역>/types.ts 에 공개 메서드 시그니처를 영역별로 옮기고 DoorayClient 는 교집합으로 정의한다. DTO 는 api/types.ts 에 둔다. 단일 영역 resolver·service 는 해당 계약만 받는다. 여러 영역을 조합하는 경로의 DoorayClient 는 후속으로 남긴다.

### 2. 영역 웹 구현과 `src/api/dooray-client.test.ts`

project·member 의 web.ts 는 각 영역 인터페이스를 반환해 누락을 tsc 가 잡게 한다. Pick 메서드 이름을 직접 나열하지 않는다. web/index.ts 는 영역 구현과 미지원 기본값을 모은다. Proxy 는 then 을 제외하며 미지원 호출에 요청이 없는 것과 Promise.resolve 동작을 테스트한다. 기존 변환 테스트도 각 영역으로 이동한다.
wiki 실측에서 확인한 HTTP 200 실패 본문과 header 없는 Spring 404 의 path·message 비노출을 web-http.test.ts 로 검증한다.

### 3. 독립 검토 반영과 공용 전송 기반

API 방식에서 생략한 쿠키를 웹 복귀 때도 보존한다. 목록 이름·상세 캐시를 분리하고 숫자 시각·세션 만료 상수 비교·잘못된 쿠키 헤더·공개 API 설정 호환·삭제 확인 순서·매개변수 DTO 의 타입 순환 지적을 반영한다.
WebHttp 를 web/http.ts 로 옮기고 requestBytes·multipart upload·허용한 파일 서버의 단일 307 을 공용으로 제공한다. 로그인 HTML 200 은 세션 만료로 처리하고 파일로 반환하지 않는다. 파일 전송은 fake fetch 로 직접 200·307·거부·연쇄·로그인·시간 제한을 검증한다.
뒤 영역의 빈 지원 목록과 영역별 가이드·웹 경로 문서를 준비한다. 공통 테스트는 실제 목록과 web.ts 가 없는 영역에서 사례를 계산해 다음 영역 구현 때 고칠 필요가 없게 한다. 함수·객체 리터럴로 영역을 조립하는 계약을 index 맨 위 설명에 둔다.

### 4. 문서

design.md·ADR-081·code-architecture.md 를 실제 경로와 공통 경계에 맞춘다. 매개변수 DTO 의 api/types.ts 이동을 반영한다.

## 검증

```bash
# cwd: 저장소 루트
pnpm test
pnpm tsc --noEmit
pnpm run build
pnpm verify:package
node scripts/check-pii.mjs
node scripts/check-public-refs.mjs
```

## 변경 파일

이 표는 추가 독립 검토 지적을 반영하는 현재 커밋 범위다. 앞선 영역 분리·공용 기반 파일 목록은 이 계획의 이전 커밋에 남아 있다.

| 파일 | 변경 |
| --- | --- |
| `docs/adr/081-web-session-auth.md` | 수정 |
| `docs/api/web-endpoints.md` | 수정 |
| `docs/code-architecture.md` | 수정 |
| `docs/features/web-session-auth/design.md` | 수정 |
| `src/api/dooray-client.test.ts` | 수정 |
| `src/api/web/file-transfer.test.ts` | 수정 |
| `src/api/web/http.test.ts` | 수정 |
| `src/api/web/http.ts` | 수정 |
| `src/api/web/index.ts` | 수정 |
| `src/commands/web-support.test.ts` | 수정 |
| `src/commands/web-support.ts` | 수정 |
| `src/commands/web-support/calendar.ts` | 수정 |
| `src/commands/web-support/member.ts` | 수정 |
| `src/commands/web-support/messenger.ts` | 수정 |
| `src/commands/web-support/post.ts` | 수정 |
| `src/commands/web-support/project.ts` | 수정 |
| `src/commands/web-support/stream.ts` | 수정 |
| `src/commands/web-support/wiki.ts` | 수정 |
| `src/config/store.test.ts` | 수정 |
| `src/config/store.ts` | 수정 |


### 추가 독립 검토 권장 반영

228aa44 기준 Claude 추가 검토는 차단 0건·권장 9건으로 머지 가능이었다. HTML 첨부는 본문 로그인 단어와 무관하게 보존한다. 첨부 307 은 웹 origin 또는 같은 클라우드의 정확한 https file-api origin 만 허용하고 새 Cookie 헤더만 보낸다. 공개 클라이언트의 호스트 규칙은 유지한다.
선택 메서드가 없는 Proxy 는 undefined 를 반환한다. 오류의 bare 클라우드 호스트를 가리고, 웹 전환의 주소 설정 오류는 안내와 종료 코드 3 을 반환한다. 객체 리터럴·메서드 충돌 검사를 추가했다. 가이드 검사에서 영역별 한국어 이름을 가져오며 파일명 helper·메서드 검색 명령·import 배치를 맞췄다.
