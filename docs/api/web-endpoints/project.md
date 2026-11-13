# project 웹 경로 실측

2026-11-14 실측했다. 공통 규칙과 공식 문서는 [색인](../web-endpoints.md)에 있다.

## 경로와 쿼리

| 메서드 | 웹 경로 | 쿼리·요청 본문 | 실측 결과 |
| --- | --- | --- | --- |
| getProjects | GET `/wapi/project/v1/projects` | `member=me`, `type`, `scope`, `state`, `page`, `size` | `type=public/private`, `scope=private/public`, `state=active` 성공. page=0/1, size=1 이 다른 프로젝트를 돌려준다 |
| getProjectMembers | GET `/wapi/task/v1/projects/!{projectId}/members` | `member=me`, `page`, `size` | page=0/1, size=1 이 다른 멤버를 돌려준다. 원소의 member 에서 organizationMemberId 와 메모리용 이름을 얻는다 |
| getProjectWorkflows | GET `/v2/wapi/projects/!{projectId}/workflows` | 없음 | `result.contents`. projectId 는 공식 스키마에 없어 뺀다 |
| getProjectTags | GET `/v2/wapi/projects/!{projectId}/tags` | `page`, `size` | `contents`, `totalCount`, `references.tagPrefixMap`. page=0/1, size=1 이 다르다 |
| createProjectTag | POST `/v2/wapi/projects/!{projectId}/tags` | `[{name, color}]` | 객체 하나가 아닌 배열이다. SESSION 과 Content-Type 만으로 성공, `result: [{id}]` |
| updateProjectTagGroup | PUT `/v2/wapi/projects/!{projectId}/tag-prefixes/{tagGroupId}` | `{mandatory, selectOne}` | SESSION 과 Content-Type 만으로 성공, result=null. 읽기 요청으로 변경도 확인 |
| getProjectMilestones | GET `/v2/wapi/projects/!{projectId}/milestones` | `page`, `size` | `contents`, `totalCount`, `references`. 실측 프로젝트에는 단계 없음 |
| getProjectTemplates | GET `/v2/wapi/projects/!{projectId}/templates` | `page`, `size` | `contents`, `references.projectMap` 등. page=0/1, size=1 이 다르다 |
| getProjectTemplateDetail | GET `/v2/wapi/projects/!{projectId}/templates/{templateId}` | `interpolation=true/false` | `content`, `references`. body·guide 의 mimeType/content 를 쓴다 |
| getProjectMemberGroups | GET `/v2/wapi/projects/!{projectId}/project-member-groups` | `page`, `size` | `contents`, `totalCount`, `references.organizationMemberMap`. page=0/1, size=1 이 다르다 |
| 프로젝트 참조 보강 | GET `/v2/wapi/projects/!{projectId}` | 없음 | `content` 의 id/code. 그룹 응답에 없는 project.code 를 얻는다. 프로세스 메모리에 재사용 |

## 공식 응답 필드와 변환

| 메서드 | 공식 result 필드 | 웹과 다른 점 |
| --- | --- | --- |
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

프로젝트·태그·템플릿·멤버 그룹은 page=0/1, size=1 이 서로 다른 항목을 돌려줬다.
프로젝트 멤버는 최상위 totalCount 가 있어 전체 페이지를 받을 수 있다.
그룹의 project.code 는 getProjects 의 메모리를 우선 쓰고, 없으면 GET `/v2/wapi/projects/!{projectId}` 로 얻는다.
태그 생성은 배열 본문이며 SESSION 과 Content-Type 만으로 성공했다. 임시 그룹의 PUT 뒤 name·id 가 남고 mandatory·selectOne 만 바뀐 것을 확인했다.
코디네이터 지시 프로젝트의 새 임시 그룹만 썼고 기존 그룹은 바꾸지 않았다. 만든 태그와 그룹은 웹 화면에서 삭제한 뒤 남지 않은 것을 확인했다.
멤버 그룹의 createdAt·updatedAt 은 문자열이다. 마일스톤은 실측 프로젝트에 없어 날짜 값을 실측하지 못했다. 오프셋 변환은 직접 쓴 가짜 응답 테스트로 확인한다.
