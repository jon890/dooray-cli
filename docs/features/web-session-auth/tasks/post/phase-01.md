# Phase 01. 업무와 댓글을 웹 경로에 연결한다

**Execution profile**: standard

## 목표

업무와 댓글의 요청·응답을 변환해 기존 CLI 출력과 쓰기 동작을 유지한다.

**범위 외**: PR1 인증·프로젝트·멤버·템플릿 구현, 첨부 바이트 전송, 다른 영역의 구현.

## 컨텍스트

**요구사항**: REQ6, REQ7, REQ9

**근거 문서**: `docs/features/web-session-auth/spec.md`, `docs/features/web-session-auth/design.md`, `docs/api/web-endpoints/post.md`, `docs/adr/081-web-session-auth.md`

이 계획은 기반 PR의 문서 커밋 위에서 작성했다.
최근 커밋의 인증 스펙·설계·실측 기록을 이어 쓰며 비밀 파일 보호 변경을 되돌리지 않는다.
사용자 결정(2026-11-14)은 영역 구현을 `src/api/post/web.ts`, 영역 인터페이스를 `src/api/post/types.ts`의 `PostClient`로 정했다.
PR1이 머지되었다는 코디네이터의 메시지를 받기 전에는 구현하지 않는다.
메시지를 받은 뒤 `origin/main`을 합치고 실제 인터페이스·등록 함수·웹 HTTP 층을 읽는다.
정확한 함수 모양이 계획과 다르면 계획을 먼저 맞추며, 이 구조 안의 조정은 다시 묻지 않는다.

기존 시그니처는 `src/api/client.ts`의 업무·댓글 공개 메서드가 기준이다.
`src/resolvers/post-input.ts`는 standalone 응답에서 프로젝트와 번호를 얻는다.
`src/resolvers/post.ts`는 `getPosts({postNumber})` 결과를 사용한다.
`src/commands/post/comment/list.ts`는 페이지를 반복 호출하므로 웹 댓글의 page 무시를 그대로 노출하면 무한 조회가 된다.

## 의도 메모

- 공개 클라이언트를 상속하지 않는다. 붙이지 않은 메서드가 공개 API를 부르는 것을 막는다.
- `Pick`으로 메서드 이름을 다시 나열하지 않고 PR1의 `PostClient`를 구현한다.
- 업무 번호를 알아내는 상세 조회 결과는 프로세스 메모리에 재사용한다. 별도 디스크 캐시와 로그를 만들지 않는다.
- 댓글 커서로 읽은 목록은 프로세스 안에서만 재사용하고 댓글 쓰기 성공 직후 지운다.
- 실제 응답을 파일로 저장하지 않는다. 고정 응답은 실측한 구조를 본떠 가짜 값으로 직접 작성한다.

## Blocked 조건

- PR1 머지 알림이 없으면 `PHASE_BLOCKED: PR1 머지 대기`로 멈춘다.
- PR1 웹 HTTP 층으로 담당 영역의 동작을 구현할 수 없어 공용 파일을 고쳐야 하면 코디네이터에게 묻는다.
- 실측 중 401·429가 나오면 웹 요청을 멈추고 코디네이터에게 묻는다.

## 작업 항목

### 1. `src/api/post/web.ts`에서 업무 메서드를 구현한다

`getPosts`, `getPost`, `getPostStandalone`, `createPost`, `updatePost`, `setPostWorkflow`, `setPostDone`, `setPostParent`를 구현한다.
실측 기록의 경로와 응답 필드 표를 그대로 적용한다.
상세는 `fields=me,body`로 읽고 업무 ID·번호·프로젝트 ID의 관계를 메모리에 둔다.
프로젝트 지정 메서드는 상세의 프로젝트 ID를 검사해 다른 프로젝트를 조작하지 않는다.

목록의 `postWorkflowClasses`를 `workflowClass`, `postWorkflowIds`를 `workflowIds`로 바꾼다.
프로젝트·워크플로·태그·단계·그룹 참조를 공식 객체로 바꾸고 웹 내부 필드는 제외한다.
필수 ID·번호·제목·배열·페이지 수가 깨지면 웹 HTTP 층과 같은 API 오류로 끝낸다.
본문의 mimeType을 유지하며 사용자·그룹 내부 필드도 공식 형태로 바꾼다.

생성은 요청 객체를 배열로 감싸고 결과 배열에서 `{id}`를 반환한다.
상위 지정은 상위 상세의 번호를 `parent.number`로 보낸다.
태그 ID는 웹의 `tagIdList`로 바꾸고, 템플릿 합성 결과도 같은 생성 요청을 거친다.
수정 결과의 `{id, number, version}`는 공식 단위 응답으로 바꾼다.
완료 처리는 프로젝트 워크플로 목록에서 순서상 대표 완료 상태를 선택해 전체 상태 변경 경로로 보낸다.
완료 상태가 없거나 워크플로 응답이 깨지면 쓰기 전에 오류로 끝낸다.
기존 업무의 상위 변경은 실측 기록에 따라 미지원 오류로 끝낸다.

### 2. 댓글 메서드를 구현한다

`getPostComments`, `getPostComment`, `createPostComment`, `updatePostComment`, `deletePostComment`를 구현한다.
작성은 `sendMailFlag:false`와 본문을 배열로 감싸고 이메일을 발송하지 않는다.
단건 조회는 응답의 postId가 대상 업무와 같은지 확인한다.
본문·creator·post·첨부 참조를 공식 필드로 바꾼다.
mailUsers가 없으면 키를 생략한다.

목록은 `eventType=comment`와 커서를 사용한다.
최신 묶음에서 가장 오래된 ID를 다음 요청의 `baseEventId`, `direction=<`로 보낸다.
완전히 읽은 뒤 공개 메서드의 order로 정렬하고 요청 페이지를 자른다.
반복 커서·중복 페이지·잘못된 totalCount·빈 페이지의 종료 조건을 테스트한다.
쓰기 성공 뒤 해당 업무의 메모리 목록을 지워 같은 프로세스의 다음 조회에 변경이 보이게 한다.

### 3. 가짜 웹 응답으로 공식 응답 구조를 검사한다

`src/api/post/web-post.test.ts`, `src/api/post/web-comment.test.ts`에 가짜 HTTP 응답을 넣는다.
테스트 데이터에는 실제 쿠키·호스트·개인 이름·실제 ID를 쓰지 않는다.
공식 필드 목록을 기준으로 키·중첩 구조·ID 문자열·날짜 형식을 비교한다.
웹 전용 필드가 JSON에 남지 않는지 검사한다.
각 메서드의 정상 경로와 필수 필드 누락·실패 헤더를 함께 검사한다.
401·403은 PR1 HTTP 층의 종료 코드와 안내를 보존한다.
상태 필터 이름을 그대로 보내거나 댓글 page를 그대로 보내는 회귀를 잡는다.

## 검증

```bash
# cwd: 저장소 루트
pnpm exec vitest run src/api/post/web-post.test.ts src/api/post/web-comment.test.ts
pnpm tsc --noEmit
node scripts/check-pii.mjs
```

정상·오류 변환 테스트가 통과하고 TypeScript 오류가 없어야 한다.
실제 웹을 바꾸는 검증은 인수 검증 계획에서만 실행한다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/api/post/web.ts` | 신규 (PostClient의 업무·댓글 구현) |
| `src/api/post/web-post.test.ts` | 신규 (업무 요청·응답·필터 검사) |
| `src/api/post/web-comment.test.ts` | 신규 (댓글 커서·변환 검사) |
