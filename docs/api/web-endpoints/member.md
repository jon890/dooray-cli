# member 웹 경로 실측

2026-11-14 실측했다. 공통 규칙과 공식 문서는 [색인](../web-endpoints.md)에 있다.

## 경로와 쿼리

| 메서드 | 웹 경로 | 쿼리·요청 본문 | 실측 결과 |
| --- | --- | --- | --- |
| getMe | GET `/v2/wapi/members/me` | 없음 | `result.content`. defaultOrganization.organizationId 를 공식 id 로 바꾼다 |
| getProjectMembers | GET `/wapi/task/v1/projects/!{projectId}/members` | `member=me`, `page`, `size` | page=0/1, size=1 이 다른 멤버를 돌려준다. 원소의 member 에서 organizationMemberId 와 메모리용 이름을 얻는다 |
| getMemberDetail | GET `/v2/wapi/members/{memberId}` | 없음 | `result.content`. 상세 응답만 상세 캐시에 저장한다 |
| searchMembers | GET `/v2/wapi/members` | `name`, `externalEmailAddresses`, `userCode`, `userCodeExact`, `page`, `size` | 이름과 자기 이메일·사용자 코드로 일치 확인. 존재하지 않는 값으로 빈 목록 확인 |

## 공식 응답 필드와 변환

| 메서드 | 공식 result 필드 | 웹과 다른 점 |
| --- | --- | --- |
| getMe, getMemberDetail | id, idProviderType, idProviderUserId, name, userCode, externalEmailAddress, defaultOrganization.id, locale, timezoneName, englishName, nativeName, nickname, displayMemberId | content 를 꺼낸다. defaultOrganization.organizationId/defaultOrganizationId 를 id 로 바꾼다. 웹 상세 경로에 없는 필드는 제외한다 |
| getProjectMembers | organizationMemberId, role | member.id 를 organizationMemberId 로 옮긴다 |
| searchMembers | id, name, userCode, externalEmailAddress | contents 를 꺼내고 totalCount 를 위로 옮긴다 |

이름·이메일·사용자 코드 검색은 자기 값으로 일치하고 존재하지 않는 값으로 빈 목록을 확인했다.
검색의 result.totalCount 는 최상위 totalCount 로 옮긴다.
추가 실측(2026-11-14): 서로 다른 이메일 2개를 SESSION 단독 Node 요청으로 각각 조회하면 각 1명, 콤마로 연결해 externalEmailAddresses 에 넣으면 2명이 반환됐다. 합친 ID 집합이 단건 결과의 합집합과 같았다. 실제 이메일·ID 는 저장하지 않았다.
프로젝트 멤버 목록의 이름은 getMemberNameFromList 로 resolver 에서 재사용한다. getMemberDetail 은 목록과 분리한 상세 캐시를 사용하므로 목록 조회 순서에 따라 반환 필드가 바뀌지 않는다.
`/v2/wapi/members/search` 는 content 가 문자열이므로 쓰지 않는다.
`member get --with-org` 는 캘린더 웹 경로를 필요로 하므로 PR1 에서는 지원하지 않는다.
