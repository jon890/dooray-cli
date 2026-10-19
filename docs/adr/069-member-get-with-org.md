## ADR-069: `member get --with-org` 으로 소속 회사·부서·직책을 바쁨 시간 조회 응답에서 채운다

**결정**: `member get` 에 `--with-org` 옵션을 둔다.
이 옵션을 주면 `POST /calendar/v1/fetch-busy-hours` 를 멤버 하나와 1분짜리 기간으로 불러,
응답의 `member` 에서 `defaultOrganization`, `primaryDepartment`, `positionName` 을 꺼낸다.

| 출력 모드 | 옵션이 없을 때 | `--with-org` 를 줬을 때 |
| --- | --- | --- |
| 일반 | 지금과 같다 | `회사:`, `부서:`, `직책:` 줄을 `member-id:` 앞에 더한다. 값이 없는 줄은 만들지 않는다 |
| `--json` | 응답 그대로 | 응답에 `organization: { defaultOrganization, primaryDepartment, positionName }` 를 더한다 |
| `--quiet` | ID | ID. 옵션은 효력이 없어 stderr 로 경고하고 추가 조회를 하지 않는다 |

옵션을 준 호출에서 조회가 실패하거나 응답에 그 멤버가 없으면 아무것도 출력하지 않고 종료 코드로 알린다.
조회 실패는 클라이언트가 정한 종료 코드(인증 오류면 `EXIT_AUTH_ERROR`)를, 멤버 누락은 `EXIT_API_ERROR` 를 쓴다.

**맥락**: 업무를 등록한 사람의 회사와 팀을 기록하려는 자동화가 있었다.
`GET /common/v1/members/{member-id}` 는 이름·이메일·사용자 코드·`defaultOrganization.id` 만 주고,
부서와 직책은 없으며 회사도 id 뿐이다. 그 id 를 이름으로 바꾸는 endpoint 도 공식 문서에 없다.
`GET /common/v1/members` 검색도 같은 필드만 준다.

공식 문서의 Calendar > Busy Hours 절이 응답 예시의 `member` 에 `primaryDepartment`(주 소속 부서),
`defaultOrganization` 의 `name`, `positionName`(직책명)을 싣고 있다.
공식 문서에 있는 endpoint 라 ADR-062 의 조건은 해당하지 않는다.
`docs/api/official-endpoints.txt` 에도 이미 있다.

**실측으로 확인한 것** (2026-10, 실제 계정 한 명):

- **부서 `id` 는 이름이 있어도 `null` 로 왔다.** 응답은 `primaryDepartment: { id: null, name: "<부서 이름>" }` 였다.
  공식 문서는 「없으면 id 와 name 이 각각 null」 이라고만 적어, 이름만 있는 경우는 문서에 없다.
  그래서 부서 유무는 `name` 으로 판단하고, 타입도 둘 다 `string | null` 로 둔다.
- `defaultOrganization` 은 `{ id, name }` 이 모두 채워졌고 `id` 는 `member get` 의 `defaultOrganization.id` 와 같았다.
- `positionName` 은 문자열로 왔다.
- 기간은 UTC `Z` 표기(`toISOString()`)도 받는다. 공식 문서 예시는 `+09:00` 이다.
- 같은 테넌트를 쓰는 계열사 직원의 `defaultOrganization` 이 회사별로 다르게 오는지는 **확인하지 못했다.**
  이 필드를 회사로 쓰기 전에 그 점을 따로 확인해야 한다.

**기간을 1분으로 두는 이유**: 바쁨 시간 자체는 쓰지 않는다.
공식 문서는 기간이 7일 이상이면 400 이라고 적는다. 상한과 거리를 둔 최소 폭이면 시간대나 경계 해석에 흔들리지 않는다.

**대안 기각**:

- **`member get` 의 일반 출력에 항상 소속 줄을 더한다** — `member get` 마다 바쁨 시간 조회가 붙는다.
  그 조회가 실패했을 때 상세 조회까지 실패시킬지, 줄만 빼고 경고할지를 따로 정해야 하고,
  옵션을 주지 않은 지금의 호출이 받는 출력이 바뀐다.
- **`--json` 에 항상 `organization` 을 더한다** — ADR-056 이 기각한 모양과 같다.
  옵션을 주지 않은 자동화가 받는 응답이 바뀐다.
- **여러 멤버를 받는 별도 명령(`member org <id...>`)** — 한 번에 20명까지 조회할 수 있어 대량 조회에는 낫다.
  지금 요구는 멤버 하나의 소속이고, 명령을 나누면 상세와 소속을 따로 불러 합치는 일이 호출하는 쪽에 남는다.
  대량 조회가 필요해지면 그때 더한다.
- **`member search` 결과에도 붙인다** — 검색 결과는 최대 100명이라 20명 상한을 넘어 여러 번 나눠 불러야 한다.
  요구가 생기면 따로 정한다.

**적용 범위**: `src/commands/member/get.ts`, `src/resolvers/member-organization.ts`, `src/formatters/member.ts`,
`src/api/client.ts` 의 `fetchBusyHours`, `src/api/types.ts` 의 Busy Hours 타입.
