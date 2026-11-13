# Phase 05. member get --with-org 의 소속 조회를 웹으로 붙인다(조건부)

**Execution profile**: standard

## 목표

`member get --with-org` 가 웹 방식에서 소속 회사·부서·직책을 낸다.

**범위 외**: 바쁨 시간(`busyHours`, `officeHours`) 자체. 이 명령은 쓰지 않는다.

## 컨텍스트

**요구사항**: REQ6, REQ8

**근거 문서**: `docs/api/web-endpoints/calendar.md` 의 「소속 조회」, [ADR-079](../../../../adr/079-member-get-with-org.md)

**전제**: 1단계에서 `POST /v2/wapi/freebusy/fetch` 의 요청 형식을 알아내지 못했고, 웹 멤버 참조에 부서 id 가 없다. 이 phase 는 아래 실측이 성공할 때만 한다. 실패하면 `member get --with-org` 는 계속 지원하지 않는 옵션으로 두고 이 phase 를 닫는다.

## 작업 항목

### 1. 실측

- 웹 화면이 바쁨 시간을 부를 때의 `requestType` 값과 본문(`organizationMemberIdList` 등)을 실제 화면 동작에서 읽는다.
- `GET /v2/wapi/members/{id}` 의 `department`, `position`, `corporate`, `defaultOrganizationId` 와 조직 목록(`GET /v2/wapi/organizations`)으로 공식 `defaultOrganization{id,name}`, `primaryDepartment{id,name}`, `positionName` 을 채울 수 있는지 본다. 부서 id 가 없으면 `id: null` 로 낸다(공식 문서도 부서가 없으면 `id`·`name` 이 `null`).

### 2. `fetchBusyHours` 웹 구현

`src/api/calendar/web.ts` 에 `fetchBusyHours` 를 붙인다. 공식 모양 `result[].member{id,name,primaryDepartment,defaultOrganization,positionName}` 을 낸다. 바쁨 시간을 얻지 못하면 `busyHours`·`officeHours`·`outOfOfficeHours` 키를 만들지 않는다.

### 3. member 지원 목록

`src/commands/web-support/member.ts` 의 `member get` 미지원 옵션 `withOrg` 를 뺀다. member 영역 파일이라 2단계에서 코디네이터에게 알리고 고친다. `docs/guide/` 의 지원 표에서도 그 줄을 뺀다.

## 검증

```bash
# cwd: 저장소 루트
pnpm test
pnpm tsc --noEmit
node scripts/check-pii.mjs
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/api/calendar/web.ts`, `src/api/calendar/web.test.ts` | `fetchBusyHours` 추가 |
| `src/commands/web-support/member.ts` | `withOrg` 제거 |
| `docs/api/web-endpoints/calendar.md` | 실측 보완 |
