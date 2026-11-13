# 웹 로그인 세션 API 확인 기록

PR1(project·member)의 경로다. 인증·보안 규칙은 [기술 설계](../features/web-session-auth/design.md)가 소유한다.
2026-11-14 로그인된 브라우저에서 읽은 SESSION 하나만 붙인 Node 요청으로 확인했다.
공식 응답 필드는 같은 날 [공식 서비스 API 문서](https://helpdesk.dooray.com/share/pages/9wWo-xwiR66BO5LGshgVTg/2939987647631384419)를 브라우저로 열어 대조했다.
아래 `{projectId}` 는 URL 조각으로 인코딩한 값이다. 프로젝트 경로의 `!` 는 그 앞에 붙인다.

## 경로와 쿼리

| 메서드 | 웹 경로 | 쿼리·요청 본문 | 실측 결과 |
| --- | --- | --- | --- |
| getMe | GET `/v2/wapi/members/me` | 없음 | `result.content`. defaultOrganization.organizationId 를 공식 id 로 바꾼다 |
| getProjects | GET `/wapi/project/v1/projects` | `member=me`, `type`, `scope`, `state`, `page`, `size` | `type=public/private`, `scope=private/public`, `state=active` 성공. page=0/1, size=1 이 다른 프로젝트를 돌려준다 |
| getProjectMembers | GET `/wapi/task/v1/projects/!{projectId}/members` | `member=me`, `page`, `size` | page=0/1, size=1 이 다른 멤버를 돌려준다. 원소의 member 에서 organizationMemberId 와 메모리용 이름을 얻는다 |
| getMemberDetail | GET `/v2/wapi/members/{memberId}` | 없음 | `result.content`. 프로젝트 멤버 조회 직후에는 메모리의 member 를 재사용한다 |
| searchMembers | GET `/v2/wapi/members` | `name`, `externalEmailAddresses`, `userCode`, `userCodeExact`, `page`, `size` | 이름과 자기 이메일·사용자 코드로 일치 확인. 존재하지 않는 값으로 빈 목록 확인 |
| getProjectWorkflows | GET `/v2/wapi/projects/!{projectId}/workflows` | 없음 | `result.contents`. projectId 는 공식 스키마에 없어 뺀다 |
| getProjectTags | GET `/v2/wapi/projects/!{projectId}/tags` | `page`, `size` | `contents`, `totalCount`, `references.tagPrefixMap`. page=0/1, size=1 이 다르다 |
| createProjectTag | POST `/v2/wapi/projects/!{projectId}/tags` | `[{name, color}]` | 객체 하나가 아닌 배열이다. SESSION 과 Content-Type 만으로 성공, `result: [{id}]` |
| updateProjectTagGroup | PUT `/v2/wapi/projects/!{projectId}/tag-prefixes/{tagGroupId}` | `{mandatory, selectOne}` | SESSION 과 Content-Type 만으로 성공, result=null. 읽기 요청으로 변경도 확인 |
| getProjectMilestones | GET `/v2/wapi/projects/!{projectId}/milestones` | `page`, `size` | `contents`, `totalCount`, `references`. 실측 프로젝트에는 단계 없음 |
| getProjectTemplates | GET `/v2/wapi/projects/!{projectId}/templates` | `page`, `size` | `contents`, `references.projectMap` 등. page=0/1, size=1 이 다르다 |
| getProjectTemplateDetail | GET `/v2/wapi/projects/!{projectId}/templates/{templateId}` | `interpolation=true/false` | `content`, `references`. body·guide 의 mimeType/content 를 쓴다 |
| getProjectMemberGroups | GET `/v2/wapi/projects/!{projectId}/project-member-groups` | `page`, `size` | `contents`, `totalCount`, `references.organizationMemberMap`. page=0/1, size=1 이 다르다 |
| 프로젝트 참조 보강 | GET `/v2/wapi/projects/!{projectId}` | 없음 | `content` 의 id/code. 그룹 응답에 없는 project.code 를 얻는다. 프로세스 메모리에 재사용 |

`/v2/wapi/members/search` 는 content 가 문자열이므로 사용하지 않는다.
`type=project/normal` 과 `state=registered` 는 입력 오류다. 공식 쿼리 값만 보낸다.
다른 쿠키·추가 인증 헤더는 필요하지 않았다. 쓰기는 `<project>` 의 새 임시 그룹에서만 했고 기존 그룹은 바꾸지 않았다.
실측용 태그와 그룹은 웹 설정 화면에서 삭제한 뒤 화면에 남지 않은 것을 확인했다.
프로젝트 멤버 응답의 totalCount 는 최상위, 검색 응답의 totalCount 는 result 안에 있었다. 두 값 모두 최상위 totalCount 로 돌려줘 페이지 조회가 조기에 끝나지 않게 한다.
태그 그룹 PUT 뒤 같은 그룹의 name·id 가 남아 있고 mandatory·selectOne 만 바뀐 것을 읽기로 확인했다.
멤버 그룹의 createdAt·updatedAt 은 문자열이다. 마일스톤은 실측 프로젝트에 없어 날짜 값을 실측하지 못했으며, 공식 스키마의 날짜·오프셋 변환은 가짜 응답 테스트로 검증한다.

## 공식 응답 필드와 변환

웹 내부 필드를 그대로 공개하지 않고 아래 공식 필드 중 웹에서 얻은 필드만 낸다.
없는 값은 키를 만들지 않는다. 필수 식별자와 이름, 응답 배열, 페이지 수가 없거나 잘못된 모양이면 오류로 끝낸다.
식별자는 문자열이며 날짜는 오프셋을 단 ISO 8601 로 보존하거나 바꾼다.

| 메서드 | 공식 result 필드 | 웹과 다른 점 |
| --- | --- | --- |
| getMe, getMemberDetail | id, idProviderType, idProviderUserId, name, userCode, externalEmailAddress, defaultOrganization.id, locale, timezoneName, englishName, nativeName, nickname, displayMemberId | content 를 꺼낸다. defaultOrganization.organizationId/defaultOrganizationId 를 id 로 바꾼다. 프로젝트 멤버 메모리를 재사용할 때 없는 상세 필드는 제외한다 |
| searchMembers | id, name, userCode, externalEmailAddress | contents 를 꺼내고 totalCount 를 위로 옮긴다 |
| getProjects | id, code, description, state, scope, type, organization.id, drive.id, wiki.id, projectCategoryId | organizationId/driveId/wikiId 를 참조 객체로 바꾼다. 웹의 추가 내부 필드는 제외한다 |
| getProjectMembers | organizationMemberId, role | member.id 를 organizationMemberId 로 옮긴다 |
| getProjectWorkflows | id, name, order, names, class | contents 를 꺼내고 totalCount 가 없으면 배열 길이를 쓴다 |
| getProjectTags | id, name, color, tagGroup(id, name, mandatory, selectOne) | tagPrefixId 로 tagPrefixMap 을 찾는다. 그룹 없는 태그는 tagGroup=null |
| createProjectTag | id | result 배열의 생성한 항목을 꺼낸다 |
| updateProjectTagGroup | null | 그대로 |
| getProjectMilestones | id, name, status, startedAt, endedAt, closedAt, createdAt, updatedAt | contents 를 꺼낸다. 웹에 없는 날짜는 제외한다 |
| getProjectMemberGroups | id, code, project(id, code), createdAt, updatedAt | projectId 로 참조를 보강한다. code=null 은 생략한다 |
| getProjectTemplates | id, templateName, project(id, code), users(to, cc), subject, dueDate, dueDateFlag, milestone(id, name), tags(id), isDefault, priority | projectMap·milestoneMap 과 tagIdList 를 공식 참조로 바꾼다. 목록의 body·guide 는 제외한다 |
| getProjectTemplateDetail | 목록 필드와 body(mimeType, content), guide(mimeType, content) | content 를 꺼낸다. 내부 emptyContent/version 을 제외한다 |

멤버 소속 추가 조회(`member get --with-org`)는 캘린더 경로를 써 PR1 에서는 지원하지 않는다.
다른 명령·옵션의 지원 범위는 [설정 가이드](../guide/setup.md)가 소유한다.
