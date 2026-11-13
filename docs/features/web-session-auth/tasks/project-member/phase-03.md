# Phase 03. Project·member 를 웹 클라이언트에 연결한다

**Execution profile**: standard

## 목표

지원 명령을 웹 클라이언트에 연결하고 아직 옮기지 않은 명령을 호출 전에 막는다.

**범위 외**: 뒤 PR 영역의 웹 메서드 구현, 머지·배포·릴리스.

## 컨텍스트

**요구사항**: REQ6, REQ7

**근거 문서**: `docs/features/web-session-auth/spec.md`, `docs/features/web-session-auth/design.md`

## 작업 항목

### 1. 인터페이스·웹 클라이언트

DoorayClient 인터페이스와 createClient 를 만들고 공개 클라이언트는 implements 선언만 더한다. web-http·web-client 는 client.js 의 런타임 값에 의존하지 않는다. client.js 를 생성자만 가진 mock 으로 쓰는 기존 테스트를 지킨다.
공식 필드를 변환하고 기본 구조·필수 필드를 검사한다. getProjectMembers 의 member 를 프로세스 메모리에 재사용한다. getProjectMemberGroups 의 project.code 는 먼저 getProjects 메모리를 보고 없으면 승인된 GET /v2/wapi/projects/!{projectId} 로 조회해 재사용한다.

### 2. 생성자와 타입 교체

명령 생성자는 createClient, resolver·services 의 매개변수는 DoorayClient 로 바꾼다. 명령 안 helper 매개변수도 바꾼다: post/edit.ts, post/get.ts, post/create.ts, post/list.ts, post/comment/list.ts, calendar/event-delete.ts, calendar/event-write.ts, stream/list.ts, messenger/channels.ts. 클라이언트를 참조하지 않는 src/editor/index.ts 는 바꾸지 않는다.

### 3. `src/api/dooray-client.test.ts`, `src/api/web-client.test.ts`

방식 없음은 공개 클라이언트, web 은 웹 클라이언트, 잘못된 주소는 요청 전 4 를 확인한다. 실제 응답을 저장하지 않고 직접 쓴 가짜 fixture 로 변환·누락·페이지·쓰기·멤버 재사용을 확인한다. 실명·실제 ID·프로젝트 코드가 고정 파일에 없는지 직접 읽는다(PII 검사기로 한국어 이름을 모두 찾을 수 없다).

### 4. 승인된 설계 보완 문서

design.md·ADR-081·web-endpoints.md 를 이 구현 커밋에서 고친다. 프로젝트 참조 보강, --with-org 미지원, web-support 경로 오기를 함께 반영한다. REQ6 의 빠지는 필드는 setup 가이드의 명령별 표에 기록하는 다음 문서 작업으로 연결한다.

## 검증

```bash
# cwd: 저장소 루트
pnpm test
pnpm tsc --noEmit
pnpm run build
node scripts/check-pii.mjs
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/api/dooray-client.ts` | 신규 |
| `src/api/dooray-client.test.ts` | 신규 |
| `src/api/web-client.ts` | 신규 |
| `src/api/web-client.test.ts` | 신규 |
| `src/api/client.ts` | 수정 |
| `src/commands/**/*.ts` | 수정 |
| `src/resolvers/*.ts` | 수정 |
| `src/services/tag.ts` | 수정 |
| `docs/features/web-session-auth/design.md` | 수정 |
| `docs/adr/081-web-session-auth.md` | 수정 |
| `docs/api/web-endpoints.md` | 수정 |
