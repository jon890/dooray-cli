## ADR-030: `resolveProject` numeric 입력 cache 우회 fallback

**결정**: `resolveProject` 입력이 numeric 15+자리이면 cache 우회 + 입력값을 그대로 projectId 로 반환.
권한 검증은 후속 API 호출 (getPosts / getProjectMembers 등) 의 4xx 응답에 위임.
13 호출자 (post create/list/search, member/list, project/* 5종, post-input, postRef, wiki) 자동 혜택.

**맥락**: `ensureProjects` 가 `GET /project/v1/projects?member=me` 응답으로 cache 채움.
member 가 아닌 프로젝트 (예: 다른 팀 프로젝트 — 권한은 있지만 멤버 아님) 는 cache 에 없음.
사용자가 projectId 를 알고 있어도 `resolveProject` 가 "프로젝트를 찾을 수 없습니다" 로 차단.
자동화 스크립트가 멤버 아닌 프로젝트의 업무 검색 불가 (Issue #78).

**대안 기각**:
- `getProject(projectId)` 호출로 존재 검증 후 반환 — 매 호출 API +1. `resolveMember` 가 이 패턴이지만 project 는 호출자 13개라 누적 비용 큼. 검증 가치 < 단순성
- `lazy + 4xx 메시지 변환` (client 단 catch) — 변환 위치가 분산되어 일관성 ↓. resolver 단순성 우선
- private cache 강제 refresh (`ensurePrivateProjects` 자동 호출) — member 가 아닌 프로젝트는 private 도 아닐 수 있음. 근본 해결 아님
- 명령별 (post search 만) 적용 — `resolveProject` 단일 진입점인데 명령마다 분기 패턴 복붙하면 일관성 깨짐. resolver 단 수정이 자연

**적용 범위**:
- `src/resolvers/project.ts` `resolveProject` — `PROJECT_ID_RE = /^\d{15,}$/` 분기 추가 (`resolveMember` 의 `MEMBER_ID_RE`, `resolveMemberGroup` 의 `GROUP_ID_RE` 와 동일 패턴 mirror)
- cache 자체는 그대로 — cache 에 있는 projectId 매칭도 기존 흐름 유지 (numeric 분기가 먼저 잡힐 뿐)
- 단위 테스트: numeric 우회 / code 매칭 / private cache 매칭 / 모두 실패 시 에러
- wiki resolver (`src/resolvers/wiki.ts:13`) — `resolveProject` 의 cache freshness 보장 의도가 numeric 분기 시 깨짐.
  wiki 도 numeric projectId 허용으로 가되, freshness 는 별도 명령 (`dooray cache refresh`) 으로 안내

**트레이드오프**:
- 사용자가 잘못된 projectId 줘도 resolver 통과 → 후속 API 4xx 발생.
  에러 메시지가 resolver 단보다 한 단계 지연되지만 자동화 친화 (resolveMember/resolveMemberGroup 의 cache 외 입력 처리와 일관)
- `resolveProject` 단일 진입점 수정으로 13 호출자 자동 혜택 — 코드 표면 최소, 회귀 위험 낮음
