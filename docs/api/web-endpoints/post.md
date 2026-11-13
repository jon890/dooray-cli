# 웹 세션으로 업무·댓글·첨부를 다루는 경로

2026-11-14 로그인된 ego 브라우저의 `SESSION` 하나를 읽어 Node 요청으로 확인했다.
요청은 직렬로 보내고 시작 간격을 1초보다 길게 뒀다.
공식 응답 필드는 [공식 서비스 API 문서](https://helpdesk.dooray.com/share/pages/9wWo-xwiR66BO5LGshgVTg/2939987647631384419)의 Project > Projects > Posts, Files, Logs 절을 브라우저로 열어 대조했다.
인증·보안 규칙은 [기술 설계](../../features/web-session-auth/design.md), 공통 프로젝트·멤버·템플릿 응답은 [PR1 실측 기록](../web-endpoints.md)이 소유한다.

`{projectId}`, `{postId}`, `{eventId}`, `{fileId}`는 문자열 식별자다.
`{number}`는 업무 번호이며 업무 ID와 다르다.
아래 경로의 `!`는 프로젝트 ID 바로 앞에 붙인다.

## 메서드별 경로

| 공개 클라이언트 메서드 | 확인한 웹 경로 | 요청·응답 차이 |
| --- | --- | --- |
| `getPosts` | GET `/wapi/task/v1/projects/!{projectId}/tasks` | `result` 배열, 최상위 `totalCount`, `references`. 페이지가 바뀌면 다른 업무를 돌려준다 |
| `getPost` | GET `/wapi/task/v1/tasks/{postId}?fields=me,body` | `result` 객체, 최상위 `references`. 받은 `projectId`와 요청 프로젝트가 같은지도 검사한다 |
| `getPostStandalone` | 위 상세 경로 | 프로젝트를 먼저 조회하지 않는다. 상세의 `projectId`와 `references.projectMap`으로 프로젝트를 얻는다 |
| `createPost` | POST `/v2/wapi/projects/!{projectId}/posts` | 요청은 객체 배열. `result: [{id, number, version}]`에서 공식 필드 `id`만 낸다 |
| `updatePost` | PUT `/v2/wapi/projects/!{projectId}/posts/{number}` | 요청은 객체. `result: {id, number, version}`를 공식 `null`로 바꾼다 |
| `setPostWorkflow` | POST `/v2/wapi/projects/!{projectId}/posts/{number}/change-workflow` | `{workflowId}`. `result: null`. 변경 뒤 상세의 전체 상태와 담당자 상태가 바뀐 것을 확인했다 |
| `setPostDone` | 위 전체 상태 변경 경로와 프로젝트 워크플로 조회 | 완료 클래스의 대표 워크플로 ID를 구해 보낸다. 완료 상태와 `endedAt` 생성 확인. 대표 선택은 프로젝트 워크플로 순서를 따른다 |
| `setPostParent` | 대응 경로 미확인 | 아래 미지원 항목을 따른다. 새 업무를 상위 업무 아래에 만드는 경로는 별도로 확인했다 |
| `getPostComments` | GET `/wapi/task/v1/projects/!{projectId}/tasks/{number}/events` | `result` 배열, 최상위 `totalCount`, `references`. 댓글만 요청한다. 페이지 번호를 그대로 보내면 안 된다 |
| `getPostComment` | GET `/wapi/task/v1/tasks/{postId}/events/{eventId}` | `result` 객체, 최상위 `references`. 업무 소속을 검사한다 |
| `createPostComment` | POST `/v2/wapi/projects/!{projectId}/posts/{number}/events` | 요청은 배열. `{body, sendMailFlag:false, fileIdList:[]}`. `result: [{id}]`에서 한 항목을 꺼낸다 |
| `updatePostComment` | PUT `/v2/wapi/projects/!{projectId}/posts/{number}/events/{eventId}` | `{body, fileIdList}`. `result: null`. 수정 후 내용과 첨부 연결 확인 |
| `deletePostComment` | DELETE `/v2/wapi/projects/!{projectId}/posts/{number}/events/{eventId}` | `result: null`. 직접 만든 댓글 삭제 성공 |
| `getPostFiles` | GET `/v2/wapi/projects/!{projectId}/posts/{number}/files` | `result.content` 배열이다. `contents`가 아니다 |
| `getPostFileMeta` | 위 첨부 목록에서 해당 ID를 찾는다 | 파일별 웹 메타 경로는 성공하지 않았다. 목록의 해당 항목에 공식 메타 필드가 있다 |
| `downloadPostFile` | GET `/files/{fileId}?disposition=attachment` | 직접 200과 파일 바이트를 받았다. `Content-Disposition` 있음. 보낸 텍스트와 받은 바이트가 같았다 |
| `uploadPostFile` | POST `/wapi/task/v1/tasks/{postId}/files?type=general` | multipart의 `file`. 직접 200, `result: [{id, ...}]`. 공식 응답은 `{id}`만 낸다 |
| `deletePostFile` | DELETE `/v2/wapi/projects/!{projectId}/posts/{number}/files/{fileId}` | `result: null`. 삭제 후 목록이 비었다 |
| `getProjectTemplates` | GET `/v2/wapi/projects/!{projectId}/templates?page=&size=` | PR1 소유. 이 영역에서도 목록 성공 확인. 공식 변환은 PR1 구현을 재사용한다 |
| `getProjectTemplateDetail` | GET `/v2/wapi/projects/!{projectId}/templates/{templateId}?interpolation=true` | PR1 소유. 이 영역에서도 상세 성공 확인. 템플릿 적용은 기존 명령의 합성 로직을 유지한다 |

프로젝트·참여자·태그·단계·워크플로·그룹 이름을 찾는 resolver는 PR1 구현을 재사용한다.
웹 요청에 다른 쿠키나 추가 인증 헤더는 필요하지 않았다.

## 쿼리와 페이지 넘기기

### 업무 목록

| 공개 메서드의 매개변수 | 웹 쿼리 | 확인한 내용 |
| --- | --- | --- |
| `page`, `size` | 그대로 | size=1의 page=0/1이 서로 다른 업무를 반환 |
| `postNumber` | 그대로 | 임시 업무 번호는 한 업무, 존재하지 않는 번호는 빈 목록 |
| `subjects` | 그대로 | 실측 제목 접두사는 임시 업무들, 존재하지 않는 검색어는 빈 목록 |
| `fromMemberIds`, `toMemberIds`, `ccMemberIds` | 그대로 | 자기 ID로 조회 성공. 존재하지 않는 ID로 빈 목록 |
| `tagIds`, `milestoneIds` | 그대로 | 존재하지 않는 ID로 빈 목록. 필터를 무시하지 않음 |
| `parentPostId` | 그대로 | 지정한 상위 ID로 조회 성공. 양성 사례는 새 하위 업무를 만든 뒤 구현 단계에서 다시 검증한다 |
| `postWorkflowClasses` | `workflowClass` | 공개 이름은 무시되어 필터 없는 목록과 같은 수를 반환. 웹 이름으로 완료·백로그 결과가 구분됨 |
| `postWorkflowIds` | `workflowIds` | 공개 이름은 무시됨. 웹 이름으로 완료 상태 조회, 존재하지 않는 ID로 빈 목록 |
| `createdAt`, `updatedAt`, `dueAt` | 그대로 | `today` 조회 성공. 등록·수정 결과 수가 전체와 다름. 만기 없는 임시 업무는 오늘 만기 결과에 없음 |
| `order` | 그대로 | `-createdAt`에서 새 임시 업무가 먼저 나옴 |

여러 ID는 기존 공개 클라이언트와 같이 쉼표로 연결한다.
열린 날짜 구간과 다중 상태 조합은 구현 뒤 실제 CLI 검증에서 확인한다.

### 댓글 목록

`eventType=comment`, `fields=me`, `size`, `order=createdAt|-createdAt`를 보낸다.
웹 UI의 기본 `direction=:`는 최신 구간을 반환한다.
`page=0/1`을 바꿔도 같은 댓글이 반환됐다.
최신 구간의 가장 오래된 댓글을 `baseEventId`로 보내고 `direction=<`로 요청하면 그보다 오래된 다른 댓글을 받았다.
`direction=>`로 최신 댓글 이후를 요청하면 빈 목록이었다.

공개 메서드의 오름차순·내림차순 페이지를 유지하려면 커서로 댓글을 모은 뒤 정렬하고 `page * size`에서 자른다.
큰 댓글 목록에서는 첫 조회 비용이 커진다.
반복 커서·중복 ID를 감지하고, 같은 페이지를 무한히 요청하지 않는다.
프로세스 안에서 완전히 읽은 결과를 재사용하고, 댓글을 쓰면 해당 결과를 지운다.

## 요청 변환과 미지원 항목

- 생성 요청의 `parentPostId`는 상위 업무 상세를 읽어 `parent: {number}`로 바꾼다. 이 형태로 하위 업무를 만들고 상위 ID가 연결된 것을 확인했다.
- 수정 요청의 `parent: {id}`와 `parent: {number}`는 HTTP 200·성공 헤더를 반환해도 상위를 바꾸지 않았다. 이를 성공으로 취급하지 않는다.
- 기존 업무의 상위 변경은 현재 실측에서 대응 경로를 확인하지 못했다. `post edit --parent`는 지원 목록에서 막고 `setPostParent`도 같은 미지원 오류를 낸다. 경로를 추가로 확인하면 이 기록·지원 목록·가이드를 함께 갱신한다.
- 공개 경로를 그대로 옮긴 `/posts/{id}/set-workflow`, `/set-parent-post`, `/change-parent-post`, `/parent`는 404였다. `/v2/wapi/projects/!{projectId}/posts/{postId}`도 업무 번호 대신 ID를 넣으면 실패했다.
- 댓글의 공개 첨부 필드를 추가로 받게 된다면 웹 요청에서는 `fileIdList`로 바꾼다. 첨부 연결 후 상세의 `fileIdList`와 `references.fileMap`에서 연결을 확인했다. 현재 공개 요청 타입에 없는 옵션을 이번 PR에서 새로 만들지 않는다.
- 파일 다운로드·업로드의 실측은 직접 200이었다. 307을 받는 환경은 설계의 신뢰 호스트 검사와 한 번만 따라가는 규칙을 그대로 적용하고 가짜 HTTP 응답으로 검사한다.

## 공식 응답 필드와 변환

공통 헤더는 `isSuccessful`, `resultCode`, `resultMessage`를 유지한다.
아래 목록은 공식 문서에서 확인한 필드다.
웹 내부 필드를 통째로 펼치지 않고 필요한 필드를 선택한다.
웹에서 얻지 못한 값은 키를 생략하고, 실제로 받은 `null`과 누락을 구분한다.
ID는 문자열이다. 날짜는 시간대가 있는 ISO 8601 문자열을 유지한다.
업무 목록의 `createdAt`, `updatedAt`가 이 형식임을 확인했다.

| 메서드 | 공식 result 필드 | 웹 변환 |
| --- | --- | --- |
| `getPosts` | id, subject, project(id, code), taskNumber, closed, createdAt, dueDate, dueDateFlag, startedAt, endedAt, updatedAt, number, priority, parent(id, number, subject), workflowClass, workflow(id, name), milestone(id, name), tags(id), users(from, to, cc) | `projectId`와 `projectMap`으로 project와 taskNumber를 만든다. closed는 workflowClass가 closed인지로 얻는다. `tagIdList`, `milestoneId`, `workflowId`를 참조 객체로 바꾼다 |
| `getPost`, `getPostStandalone` | 목록 필드와 body(mimeType, content), files(id, name, size) | `fields=body`가 없으면 본문이 빠진다. `fileIdList`와 fileMap에서 files를 만든다. body의 version·emptyContent는 제외한다 |
| `createPost`, `createPostComment`, `uploadPostFile` | id | 생성 결과 배열의 해당 항목만 꺼낸다 |
| `updatePost`, `setPostDone`, `setPostWorkflow`, `updatePostComment`, `deletePostComment`, `deletePostFile` | null | 웹 수정 결과의 추가 필드는 제외한다 |
| `getPostComments` | id, post(id), type, subtype, createdAt, modifiedAt, creator(type, member 또는 emailUser), mailUsers(from, to, cc), body(mimeType, content) | `postId`를 post.id로 바꾼다. creator의 내부 표시 필드는 제외한다. 웹에 없는 mailUsers는 생략한다 |
| `getPostComment` | 댓글 목록 필드와 files(id, name, size) | fileIdList와 fileMap을 연결한다. 웹에 없는 파일 이름·크기를 만들어 넣지 않는다 |
| `getPostFiles`, `getPostFileMeta` | id, name, size, mimeType, createdAt, creator(type, member.organizationMemberId 또는 emailUser(emailAddress, name)) | 웹의 downloadUrl·type·version·extension 등은 제외한다. 목록에는 totalCount를 배열 길이로 계산한다 |

공식 파일 예제는 `size`를 따옴표로 표시하지만 별도 타입 설명이 없고 현재 공개 타입은 number다.
웹 실측의 number를 보존한다. 이는 ID 문자열 변환과 구분한다.
업무 참여자의 `member.workflowId`는 공식 참여자 항목의 `workflow`로 옮긴다.
그룹의 `memberList`는 공식 `group.members`로 바꾼다.

현재 `post file download-all`은 본문 파일의 소속을 검사할 때 `fileIdList`를 사용한다.
웹 JSON에 이 내부 필드를 추가하지 않도록, 기존 필드가 없으면 공식 `files`의 ID를 쓰는 호환 처리를 명령에 넣는다.
공개 API에 기존 필드가 있으면 현재 동작을 유지한다.

## 실측 데이터 정리

쓰기 장소는 `<project>`, 담당자는 자기 자신, 참조자는 없음으로 제한했다.
다음 이름은 공개 기록용 가명이다.

| 만든 것 | 확인한 동작 | 정리 결과 |
| --- | --- | --- |
| `[cli-web-probe] post auth shape` | 생성, 제목·본문 수정, 상태 변경, 완료, 댓글·첨부 | 삭제 성공 |
| `[cli-web-probe] temporary parent` | 하위 업무 생성의 상위 대상으로 사용 | 삭제 성공 |
| `[cli-web-probe] temporary child` | 생성 시 상위 지정과 상세의 상위 연결 | 삭제 성공 |
| 임시 댓글 | 생성, 내용 수정, 첨부 연결, 개별 삭제 | 개별 삭제와 업무 삭제로 정리 |
| `cli-web-probe.txt` | 업로드, 목록, 내려받은 바이트 비교, 삭제 | 삭제 후 빈 목록 확인 |

제목 접두사로 다시 조회한 업무 목록이 비었다.
브라우저 작업 공간은 finish했고, 사용자의 기존 탭은 닫지 않았다.
임시 HOME을 지우고, 해당 설정 경로 해시의 키체인 항목도 지웠다.
삭제 후 `find-generic-password` 종료 코드 44를 확인했다.
