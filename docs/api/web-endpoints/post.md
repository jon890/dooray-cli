# 웹 세션으로 업무·댓글·첨부를 다루는 경로

2026-11-14 로그인된 ego 브라우저의 `SESSION` 하나를 읽어 Node 요청으로 확인했다.
최초 실측은 요청 간격을 1초보다 길게 뒀다.
추가 실측에서는 명령을 하나씩 직렬로 실행하고 저장소의 토큰 버킷과 응답 헤더에 요청 간격을 맡겼다.
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
| `setPostDone` | 위 전체 상태 변경 경로와 프로젝트 워크플로 조회 | 완료 클래스의 상태가 하나이면 그 ID를 보낸다. 완료 상태와 `endedAt` 생성 확인. 여러 상태이면 대표를 추측하지 않고 쓰기 전에 종료 코드 3으로 거절한다 |
| `setPostParent` | POST `/v2/wapi/projects/!{projectId}/posts/{number}/move` | 웹 화면에서 CDP로 확인. `{targetProjectId: 현재 프로젝트 ID, parentPostNumber: 상위 업무 번호}`. SESSION만 보낸 재호출 후 상위 연결도 확인. 웹 결과는 `result.content` |
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

공개 메서드의 오름차순 페이지를 유지하려면 커서로 댓글을 모은 뒤 정렬하고 `page * size`에서 자른다.
큰 댓글 목록에서는 오름차순의 첫 조회 비용이 커진다.
내림차순의 첫 페이지와 `latest`는 최신 구간만 읽고, 뒤 페이지를 요청할 때만 오래된 구간을 추가로 읽는다.
반복 커서·중복 ID를 감지하고, 같은 페이지를 무한히 요청하지 않는다.
프로세스 안에서 완전히 읽은 결과를 재사용하고, 댓글을 쓰면 해당 결과를 지운다.

## 요청 변환과 지원 범위

- 생성 요청의 `parentPostId`는 상위 업무 상세를 읽어 `parent: {number}`로 바꾼다. 이 형태로 하위 업무를 만들고 상위 ID가 연결된 것을 확인했다.
- 수정 요청의 `parent: {id}`와 `parent: {number}`는 HTTP 200·성공 헤더를 반환해도 상위를 바꾸지 않았다. 이를 성공으로 취급하지 않는다.
- 기존 업무의 상위 변경은 추가 실측에서 `/move`로 확인했다. 업무 상세의 더보기 메뉴에서 「상위 업무 추가」를 선택한 뒤 임시 상위 업무를 고르면 이 요청이 나간다. 프로젝트를 바꾸지 않도록 targetProjectId를 현재 프로젝트 ID로 고정한다.
- 공개 경로를 그대로 옮긴 `/posts/{id}/set-workflow`, `/set-parent-post`, `/change-parent-post`, `/parent`는 404였다. `/v2/wapi/projects/!{projectId}/posts/{postId}`도 업무 번호 대신 ID를 넣으면 실패했다.
- 댓글 수정은 단건 조회의 기존 `fileIdList`를 보존해 웹 요청에 보낸다. 첨부 연결 후 상세의 `fileIdList`와 `references.fileMap`에서 연결을 확인했다. 현재 공개 요청 타입에 없는 옵션을 이번 PR에서 새로 만들지 않는다.
- 파일 다운로드·업로드의 실측은 직접 200이었다. 307을 받는 환경은 설계의 신뢰 호스트 검사와 한 번만 따라가는 규칙을 그대로 적용하고 가짜 HTTP 응답으로 검사한다.

## 공식 응답 필드와 변환

공통 헤더는 `isSuccessful`, `resultCode`, `resultMessage`를 유지한다.
아래 목록은 공식 문서에서 확인한 필드다.
웹 내부 필드를 통째로 펼치지 않고 필요한 필드를 선택한다.
웹에서 얻지 못한 값은 키를 생략하고, 실제로 받은 `null`과 누락을 구분한다.
ID는 문자열이다. 날짜는 시간대가 있는 ISO 8601 문자열로 유지하거나 아래 날짜 표에 따라 변환한다.
업무 목록의 `createdAt`, `updatedAt`가 이 형식임을 확인했다.

| 메서드 | 공식 result 필드 | 웹 변환 |
| --- | --- | --- |
| `getPosts` | id, subject, project(id, code), taskNumber, closed, createdAt, dueDate, dueDateFlag, startedAt, endedAt, updatedAt, number, priority, parent(id, number, subject), workflowClass, workflow(id, name), milestone(id, name), tags(id), users(from, to, cc) | `projectId`와 `projectMap`으로 project와 taskNumber를 만든다. closed는 workflowClass가 closed인지로 얻는다. `tagIdList`, `milestoneId`, `workflowId`를 참조 객체로 바꾼다 |
| `getPost`, `getPostStandalone` | 목록 필드와 body(mimeType, content), files(id, name, size) | `fields=body`가 없으면 본문이 빠진다. `fileIdList`와 fileMap에서 files를 만든다. body의 version·emptyContent는 제외한다 |
| `createPost`, `createPostComment`, `uploadPostFile` | id | 생성 결과 배열의 해당 항목만 꺼낸다 |
| `updatePost`, `setPostDone`, `setPostWorkflow`, `updatePostComment`, `deletePostComment`, `deletePostFile` | null | 웹 수정 결과의 추가 필드는 제외한다 |
| `setPostParent` | post(id), project(id) | 웹 move의 content와 요청 프로젝트를 공식 참조 객체로 바꾼다. 공식 참조 응답을 받을 수 있도록 승인된 post 영역 계약의 반환 타입을 넓히고 기존 소비자는 tsc로 검사한다 |
| `getPostComments` | id, post(id), type, subtype, createdAt, modifiedAt, creator(type, member 또는 emailUser), mailUsers(from, to, cc), body(mimeType, content) | `postId`를 post.id로 바꾼다. creator의 내부 표시 필드는 제외한다. 웹에 없는 mailUsers는 생략한다 |
| `getPostComment` | 댓글 목록 필드와 files(id, name, size) | fileIdList와 fileMap을 연결한다. 웹에 없는 파일 이름·크기를 만들어 넣지 않는다 |
| `getPostFiles`, `getPostFileMeta` | id, name, size, mimeType, createdAt, creator(type, member.organizationMemberId 또는 emailUser(emailAddress, name)) | 웹의 downloadUrl·type·version·extension 등은 제외한다. 목록에는 totalCount를 배열 길이로 계산한다 |

공식 파일 예제는 `size`를 따옴표로 표시하지만 별도 타입 설명이 없고 현재 공개 타입은 number다.
웹 실측의 number를 보존한다. 이는 ID 문자열 변환과 구분한다.
업무 참여자의 `member.workflowId`는 공식 참여자 항목의 `workflow`로 옮긴다.
그룹의 `memberList`는 공식 `group.members`로 바꾼다.

`fileIdList`는 현재 공개 클라이언트 타입과 웹 상세 모두에서 제공하는 필드다.
이를 유지해 `post file download-all`의 기존 파일 소속 확인을 바꾸지 않는다.

## 옵션별 웹 요청과 확인 결과

| 명령·옵션 | 웹에 보내는 필드 | 확인 결과 |
| --- | --- | --- |
| create `--milestone` | `milestoneId` | 임시 단계 ID가 생성한 업무 상세에 남음 |
| create `--due-date` | `dueDate`, `dueDateFlag` | 지정한 만기일과 일정 여부가 상세에 남음 |
| create `--priority` | `priority` | high로 생성한 결과가 high |
| create `--to`, `--cc` | `users.to`, `users.cc`의 member.organizationMemberId | 자기 담당자 생성과 자기 참조자만 있는 생성 각각 확인 |
| create `--to-group`, `--cc-group` | 해당 users 배열의 `{type:group, group:{projectMemberGroupId}}` | 자기만 포함된 임시 그룹으로 담당·참조 그룹 생성 각각 확인 |
| create `--tag` | `tagIdList` | 기존 태그 ID가 임시 업무 상세에 남음 |
| create `--workflow` | 생성 뒤 change-workflow의 `workflowId` | 진행·완료 전체 상태로 변경 확인 |
| create `--parent` | 상위 상세 조회 뒤 `parent.number` | 생성한 하위 업무의 parent.id가 지정한 상위 ID와 같음 |
| edit `--to`, `--to-clear`, `--cc`, `--cc-clear` | 기존 참여자와 명령이 합성한 최종 `users.to`, `users.cc` | 자기 담당자·자기 참조자 추가와 빈 배열로 제거 확인 |
| edit `--to-group`, `--cc-group` | 최종 users 배열의 group 참조 | 담당·참조 그룹으로 변경 확인, users를 생략한 후속 수정에서도 유지 |
| edit `--tag`, `--tag-remove`, `--tag-clear` | 기존 태그와 명령이 합성한 최종 `tagIdList` | 기존 태그 추가, 빈 배열로 제거, 다시 추가한 결과 확인 |
| edit `--parent` | move의 `targetProjectId`, `parentPostNumber` | 웹 화면 CDP와 SESSION 단독 요청 모두에서 상위 연결 확인 |

담당자에 있는 자기 자신을 참조자에 다시 넣으면 서버가 중복 참조를 제외한다.
자기 담당자와 자기만 포함된 참조 그룹을 동시에 넣어도 같은 중복 제외가 발생했다.
참조 그룹 옵션 자체는 담당자를 비운 별도 업무로 확인했다.
이는 옵션이 무시되는 것과 구분한다.

위 표의 옵션은 대응 경로와 결과를 확인했으므로 지원 계획에 포함한다.
구현 뒤 CLI 검증에서 확인하지 못한 옵션은 성공으로 간주하지 않고 지원 목록에서 막는다.

## 나머지 옵션과 참여자 보존

| 옵션 | 결정 | 웹 요청에서의 처리 |
| --- | --- | --- |
| `--title`, `--body`, `--body-file`, stdin | 지원 | subject·body.content로 전달 |
| `--mention`, `--mention-group`, `--link-task` | 웹 필드 없이 지원 | 기존 본문 합성을 사용. 실측에서는 자기 자신이나 자기 전용 그룹만 멘션 |
| `--mime-type` | 지원 | body.mimeType으로 전달. 기존 HTML·Markdown 합성 제약 유지 |
| `--template` | 지원 | PR1 템플릿 조회 뒤 기존 우선순위로 생성 본문을 합성. 다른 사람에게 알림이 갈 템플릿만 있으면 실측을 건너뛰고 기록 |
| `--dry-run` | 웹 필드 없이 지원 | 합성 결과만 출력하고 쓰지 않음 |
| `--no-confirm` | 웹 필드 없이 지원 | 기존 첨부 누락 확인 절차에만 적용 |
| `--id`, `--url`, URL 위치 인자 | 지원 | standalone 상세 조회로 업무·프로젝트를 확인 |
| 목록의 페이지·정렬·기간·작성자 옵션 | 지원 | 이 문서의 쿼리 변환과 기존 명령의 결과 필터 사용 |
| json·quiet·색상 옵션 | 웹 필드 없이 지원 | 변환한 공식 응답에 기존 포매터 적용 |

참여자 왕복은 웹 상세 → 공식 응답 → 웹 수정 요청 순으로 검사한다.
member.organizationMemberId와 group의 식별자는 읽은 값과 같은 값을 보낸다.
그룹의 공식 참조에 id가 있으면 이를 인식하고, 현재 DTO의 projectMemberGroupId도 호환 입력으로 받는다.
웹 요청은 항상 `{type: group, group: {projectMemberGroupId}}`로 보낸다.
웹의 memberList를 공식 members로 바꾸며, 쓰기에서는 확인한 그룹 ID로만 대상을 지정한다.

emailUser는 읽은 emailAddress·name을 보존한다.
웹 쓰기 형식은 실측하지 않아 emailUser가 남은 요청은 HTTP 쓰기 전에 미지원 안내와 종료 코드 3으로 끝낸다.
해당 참여자를 빼고 일부만 보내지 않는다.
알 수 없는 참여자 종류도 같은 방식으로 거절한다.

미지원 옵션의 기본값 때문에 명령 전체가 막히지 않도록 공용 guard는 Commander가 값의 출처를 cli라고 표시한 옵션만 판정에 전달한다.
설정이나 기본값으로 들어온 옵션은 사용자가 명시한 옵션으로 보지 않는다.

## 추가 실측: 수정 시 필드 보존

추가 실측 장소도 코디네이터 지시서가 지정한 프로젝트다.
지시서에 장소가 없으면 쓰기 전에 멈춘다.
사용자가 임시 단계와 자기 전용 그룹의 생성·삭제를 추가로 허용했다.
기존 단계·그룹은 수정하지 않는다.

태그·임시 단계·만기일·우선순위·자기 담당자·첨부를 넣어 업무를 만들었다.
제목·본문만 넣고 PUT한 뒤 선택 필드가 유지되는지 읽기 요청으로 확인했다.
자기 참조자만 있는 상태에서도 같은 검사를 했다.

| 필드 | 필드를 빼고 PUT | 기존 값을 넣고 PUT |
| --- | --- | --- |
| `tagIdList` | 기존 태그 유지 | 기존 태그 유지 |
| `milestoneId` | 임시 단계 유지 | 임시 단계 유지 |
| `dueDate`, `dueDateFlag` | 기존 만기일 유지 | 기존 만기일 유지 |
| `priority` | high 유지 | high 유지 |
| `users.to`, `users.cc` | 기존 참여자 유지 | 명시한 자기 참여자 유지 |
| `fileIdList` | 첨부 ID 유지 | 명시한 첨부 ID 유지 |

누락 유지가 이번 환경에서 성공해도 변환기는 기존 상세의 필드를 채워 보낸다.
공개 요청에서 필드가 아예 없으면 기존 값을 유지하고, 빈 배열·null 등 명시적인 제거는 그대로 보낸다.
`post replace`처럼 태그·단계를 주지 않는 호출과 본문만 바꾸는 `post edit`을 회귀 사례로 둔다.

댓글에 파일을 연결한 뒤 `{body}`만 넣고 수정해도 이번 환경에서는 연결이 유지됐다.
`{body, fileIdList: 기존 단건 조회의 목록}`으로 수정한 뒤에도 첨부 연결과 fileMap 참조가 유지됐다.
변환기는 후자의 명시적인 보존 방식을 사용한다.
업무 첨부 목록 전체를 댓글의 fileIdList로 보내지 않는다.

## 추가 실측: 일정 없음과 날짜 미정

일정이 있는 임시 업무에 dueDateFlag:false만 PUT하면 서버는 성공 헤더를 반환하지만 기존 flag:true와 날짜를 유지했다.
`{dueDate:null, dueDateFlag:false}`로 PUT하면 날짜는 null이 됐지만 flag는 true였다.
웹 UI도 만기일 편집에서 flag:true를 사용했다.
따라서 일정 없음(false)과 날짜 미정(null, flag:true)을 같은 동작으로 처리하지 않는다.

웹 변환기는 dueDateFlag를 false로 새로 바꾸는 요청을 쓰기 전에 미지원 안내와 종료 코드 3으로 거절한다.
이미 false인 업무를 본문만 수정할 때는 해당 필드를 생략해 기존 상태를 보존한다.
명시한 날짜 미정(null, flag:true)은 지원한다.

## 추가 실측: 파일 목록과 날짜

일반 첨부, 본문에 삽입한 작은 이미지, 댓글에 연결한 첨부를 서로 다른 파일로 만들었다.
`GET /posts/{number}/files`의 result.content와 업무 상세의 fileIdList에 이 파일들이 모두 포함됐다.
댓글 단건의 fileIdList와 references.fileMap에도 댓글 첨부가 포함됐다.
업무 파일 목록과 댓글 단건의 files를 모두 파일 소속 확인의 근거로 사용할 수 있다.
인라인 이미지와 댓글 첨부의 `/files/{fileId}` 다운로드도 성공했다.

| 응답·필드 | 실측한 형식 | 공개 응답 처리 |
| --- | --- | --- |
| 업무 `createdAt`, `updatedAt`, `dueDate` | ISO 8601, `+HH:mm` 오프셋 | 보존 |
| 업무 `startedAt`, `endedAt` | ISO 8601, `+HH:mm` 오프셋 | 보존. 상태 변경으로 값이 생긴 경우도 확인 |
| 댓글 `createdAt`, 수정 뒤 `modifiedAt` | ISO 8601, `+HH:mm` 오프셋 | 보존. 수정 전 modifiedAt는 null |
| 업무 파일 목록 `createdAt` | `YYYY-MM-DDTHH:mm:ss+HHmm` | 시간대의 콜론을 보충해 `+HH:mm`으로 변환 |

파일 날짜를 UTC Z 형식으로 관측했다고 가정한 고정 응답은 만들지 않는다.
응답마다 다른 날짜 형식을 그대로 본떠 테스트하고 공개 응답의 시간대 형식을 검사한다.

## 실측 데이터 정리

쓰기 장소는 코디네이터 지시서가 준 `<project>`이며, 지정이 없으면 멈춘다.
담당자·참조자는 자기 자신 또는 자기만 포함된 실측 그룹으로 제한했다.
다음 이름은 공개 기록용 가명이다.

| 만든 것 | 확인한 동작 | 정리 결과 |
| --- | --- | --- |
| `[cli-web-probe] post auth shape` | 생성, 제목·본문 수정, 상태 변경, 완료, 댓글·첨부 | 삭제 성공 |
| `[cli-web-probe] temporary parent` | 하위 업무 생성의 상위 대상으로 사용 | 삭제 성공 |
| `[cli-web-probe] temporary child` | 생성 시 상위 지정과 상세의 상위 연결 | 삭제 성공 |
| 임시 댓글 | 생성, 내용 수정, 첨부 연결, 개별 삭제 | 개별 삭제와 업무 삭제로 정리 |
| `cli-web-probe.txt` | 업로드, 목록, 내려받은 바이트 비교, 삭제 | 삭제 후 빈 목록 확인 |
| `[cli-web-probe] preservation`, `[cli-web-probe] cc only` | 태그·단계·만기일·참여자·첨부의 누락·포함 수정, 웹 화면의 상위 변경 | 삭제 성공 |
| `[cli-web-probe] preservation milestone` | 임시 업무의 단계 지정과 보존 | DELETE `/v2/wapi/projects/!{projectId}/milestones/{milestoneId}` 성공, 목록에서 사라짐 |
| `[cli-web-probe] to group option`, `[cli-web-probe] cc group option`, `[cli-web-probe] cc group only` | 담당·참조 그룹과 중복 제외 동작 | 삭제 성공 |
| `cli-web-probe-self` | 자기만 포함된 그룹, 담당·참조 그룹 옵션 | DELETE `/v2/wapi/projects/!{projectId}/project-member-groups/{groupId}` 성공, 목록에서 사라짐 |
| 본문 이미지·댓글 첨부 | 파일 목록 포함 여부, 댓글 수정 시 연결 유지와 내려받기 | 개별 파일 삭제 성공 |

그룹 code는 영문 소문자·숫자·하이픈·밑줄·마침표만 허용한다.
서버가 `[cli-web-probe]`를 거부해 코디네이터의 승인을 받아 해당 그룹만 `cli-web-probe-self`로 정규화했다.
임시 그룹의 구성원 목록이 자기 ID 하나뿐인지 확인하고 기존 그룹은 바꾸지 않았다.

임시 업무는 DELETE `/v2/wapi/projects/!{projectId}/posts/{number}`로 삭제했다.
하위 업무를 먼저 지우고 상위를 지웠다.
삭제하지 못한 항목은 없다.

제목 접두사로 다시 조회한 업무 목록이 비었다.
브라우저 작업 공간은 finish했고, 사용자의 기존 탭은 닫지 않았다.
임시 HOME을 지우고, 해당 설정 경로 해시의 키체인 항목도 지웠다.
삭제 후 `find-generic-password` 종료 코드 44를 확인했다.

## 구현 뒤 CLI 확인

2026-11-14 임시 HOME에 실제 CLI의 config set session-cookie -로 SESSION을 입력했다.
쿠키는 stdin으로만 넘겼고 키체인에 저장했다.
빌드한 CLI에서 아래 동작이 성공했다.

- post create/get/list/search/edit/replace/workflow/done. 생성의 태그·단계·만기·우선순위·그룹·상위 지정과 수정 뒤 그룹·메타데이터 보존을 확인했다.
- post get의 일반·json·quiet와 post list의 quiet. 상세의 quiet는 기존 포매터처럼 일반 상세를 유지하고, 목록의 quiet는 기존처럼 업무 번호를 출력한다.
- list의 created·updated·parent 조건과 comment list의 page·from-author, comment latest. 서로 다른 페이지와 최신 댓글이 기대한 ID와 같았다.
- comment add/get/list/edit/delete와 comment file upload/list/download/delete. 본문만 수정해도 기존 첨부 카드가 남았고 새 파일을 지워도 기존 카드는 남았다.
- file upload/list/download/download-all/delete. 받은 텍스트 바이트가 보낸 값과 같았다.
- 자기 멤버·자기 전용 그룹 멘션과 업무 링크 합성의 dry-run, HTML·Markdown 본문 수정.
- 다른 사람의 참여자·멘션이 없는 기존 템플릿을 골라 template 생성. 새 템플릿은 만들지 않았다.

main의 post list 명령에는 workflow 옵션이 없다.
실제 CLI도 이 옵션을 알 수 없는 옵션으로 거부했다.
새 옵션을 추가하지 않고 getPosts의 상태 쿼리 변환을 HTTP 경계 테스트로 검증한다.

인수용 임시 업무·댓글·첨부·단계·그룹을 삭제하고 접두사 조회 결과가 비었는지 확인했다.
임시 HOME과 브라우저 공간을 정리했으며, Node가 실제로 사용한 HOME 경로의 해시로 키체인 항목을 지운 뒤 find 종료 코드 44를 확인했다.

임시 단계 생성은 POST `/v2/wapi/projects/!{projectId}/milestones`에 `[{name, status:open}]`를 보냈다.
임시 그룹 생성은 POST `/v2/wapi/projects/!{projectId}/project-member-groups`에 `[{code, organizationMemberIdList:[자기 ID]}]`를 보냈다.
이 생성·삭제는 코디네이터가 전달한 사용자 승인(2026-11-14)으로만 수행했다.

편집기에서 날짜를 바꾸지 않은 웹 업무는 기존 dueDateFlag를 그대로 보낸다.
날짜 미정(dueDate:null, dueDateFlag:true) 업무의 제목만 고쳐도 일정 없음 전환으로 오인하지 않는다.
API 키 방식의 편집기 요청은 기존 동작을 유지한다.


## 완료 상태가 여러 개인 프로젝트

공식 set-done 설명은 완료 클래스에 상태가 여러 개이면 대표 상태로 바꾼다고 한다.
대표 상태가 order의 최솟값이라는 규칙은 공식 문서와 이번 실측에서 확인하지 못했다.
따라서 웹 post done은 완료 상태가 하나일 때만 실행한다.
여러 상태가 있으면 쓰기 전에 종료 코드 3으로 끝내고 post workflow <상태>로 명시하도록 안내한다.
이는 확인하지 못한 동작을 추측하지 않는 기존 DECISION7을 적용한 제약이다.
공식 API 키 방식의 set-done은 바꾸지 않는다.


## 독립 리뷰 추가 실측: 담당자별 상태와 상위 변경

자기 멤버와 자기만 포함된 임시 그룹을 함께 담당자로 지정한 업무를 만들었다.
담당자 항목은 member·group으로 둘이지만 실제 사람은 자신 한 명이었다.
PUT에서 멤버 한쪽의 workflowId만 바꾸려 했지만 상태는 바뀌지 않았으며 두 항목의 상태는 같았다.
이 환경에서는 다른 실제 사람을 추가하지 않고 서로 다른 담당자 상태를 만들 수 없었다.
따라서 담당자별 상태가 다른 업무의 PUT 보존은 실측 통과로 보지 않는다.

같은 상태의 참여자는 workflowId를 생략한 PUT과 포함한 PUT 모두 상세의 상태를 유지했다.
변환기는 기존 참여자의 workflowId를 요청에 포함하고, 담당자 상태가 서로 다르면 쓰기 전에 코드 3으로 거절한다.
명시한 참여자 배열과 생략한 배열 모두 기존 식별자로 대응시켜 상태를 보존한다.
새로 추가하는 참여자의 상태는 만들어 내지 않는다.
API 키 방식은 바꾸지 않는다.

같은 임시 업무의 상위를 바꾸기 전후 상세를 비교했다.
ID·번호·프로젝트·태그·마일스톤·전체 진행 상태·참여자 식별자와 개인 진행 상태·만기일·일정 여부·우선순위는 같았다.
담당자 lastActionAt 등 서버 활동 시각은 바뀌었으므로 불변 비교 대상에서 제외했다.
변경 뒤 parent.id가 지정한 상위 ID인지 확인했다.

이번 임시 업무 둘과 마일스톤·자기 전용 그룹을 삭제하고 목록에서 사라진 것을 확인했다.
이번 실측은 브라우저의 로그인 상태로 page.fetch를 사용했고 쿠키 추출·설정·키체인 항목 생성은 하지 않았다.

상위 변경 구현은 move 성공 헤더만으로 참조 응답을 만들지 않는다.
업무 상세를 새로 읽어 parent.id가 요청한 상위 ID와 같은지 확인한 뒤 상세의 업무·프로젝트 ID를 반환한다.


댓글 파일 삭제는 기존 카드 목록과 원래 본문의 파일 링크를 모두 확인한다.
둘 다 없으면 API 키 방식의 없는 참조 삭제와 같은 종료 코드 3으로 PUT 전에 거절한다.
카드가 없더라도 CLI 업로드가 남긴 본문 링크는 기존 경로로 지울 수 있다.
해당 파일이 카드 목록에 있으면 그 ID만 연결에서 제외하며 다른 카드는 유지한다.
