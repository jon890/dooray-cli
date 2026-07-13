## ADR-028: member-group 응답 shape — nested array unwrap + id 직접 입력 fallback

**결정**: `fetchAllMemberGroups` 가 응답 `result` 가 **중첩 배열** (`[[group1, group2]]`) 인 경우를 정규화 (flatten) 한다.
정규화 후에도 `code` 누락 그룹 대응을 위해 `code` 타입 optional 유지 + `match.ts` 가드 유지.
사용자가 그룹 code 를 모르는 경우 회피책으로 `resolveMemberGroup` 에 numeric 15+자리 입력 시 id 직접 매칭 fallback 도 제공.

**맥락**: Dooray API `GET /project/v1/projects/{projectId}/member-groups` 응답 구조 — 공식 spec 은 평면 배열 (`result: [g1, g2, ...]`) 이지만 실제 응답이 **중첩 배열** (`result: [[g1, g2]]`) 로 반환됨 (2026-05-22 실측, 모든 프로젝트 동일).
원래 `for (const g of res.result)` 흐름이 외부 배열을 평면으로 가정해 `g` 가 배열이 되어 `g.id` / `g.code` 모두 undefined → cache 에 빈 객체로 저장 → `dooray project groups` 표가 모든 컬럼 빈값, 모든 그룹 매칭 실패.

이슈 #76 사용자 보고 ("프로젝트 전체 그룹이 code 누락 — `[{}, {}]` 응답") 의 root cause = 부분적 code 누락이 아니라 response shape mismatch.

**구 ADR-028 가정 무효화**: 본 ADR 초기 결정 (2026-05-18, Issue #65) 의 "code 누락 그룹 일부 케이스" 진단은 root cause 가 아닌 증상만 본 것.
"사전 필터링 + silent skip" 정책은 실제로는 **모든 그룹을 필터** 하는 방향으로 동작하고 있었음.

**대안 기각**:
- 기존 사전 필터 정책 유지 — root cause 미해결. response shape 가 평면으로 되돌아오지 않는 한 모든 그룹 영영 매칭 실패
- API client 단에서 response 정규화 — `client.ts` 가 raw HTTP 래퍼 (비즈니스 로직 없음) 원칙에 위배. resolver 단에서 처리
- name fallback — 공식 spec / 실제 응답 둘 다 MemberGroup 에 `name` 필드 부재. fallback 키 없음
- cache 스키마 확장 (name 필드 추가) — 위 사유로 무의미
- detail API `/member-groups/{id}` 의 `members[].name` 활용 — 그룹 자체 이름이 아니라 그룹 멤버 이름. 의미 충돌

**적용 범위**:
- `src/resolvers/member-group.ts` `fetchAllMemberGroups` — `res.result.flat()` 로 nested array 정규화
- `src/resolvers/member-group.ts` `resolveMemberGroup` — numeric 15+자리 입력 시 id 직접 매칭 fallback (response shape 가 다시 변할 robustness)
- `src/api/types.ts` `MemberGroup.code?: string` + `src/cache/types.ts` `CachedMemberGroup.code?: string` 유지 (개별 code 누락 가능성은 여전히 존재)
- `src/resolvers/match.ts` undefined / 빈 문자열 가드 유지
- stderr 메시지의 ADR 번호 오기 (`ADR-026` → `ADR-028`) 정정
- helpHint AI 친화: 후보 탐색 명령 + id 직접 입력 형식 둘 다 명시
