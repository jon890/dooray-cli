## ADR-021: `member` 명령 + comment list Creator 이름 자동 채우기

**결정**: `dooray member get/list` 서브커맨드 신설.
`post comment list` 의 table 출력만 Creator 컬럼을 project 멤버 캐시로 enrich — `--json` 은 raw 유지.
기존 project 단위 캐시 (`members/{projectId}.json`) 만 사용 — organization-wide reverse lookup 미도입.

**맥락**: 댓글 응답에 `organizationMemberId` 만 있고 표시명 없어 자동화 흐름이 끊김 (Issue #17).
`--json` 을 raw 로 유지한 이유는 외부 도구 호환성 — 스키마 변경은 breaking change.
project 단위 캐시 유지는 enrich 사용 시점에 항상 projectId 가 동반됨.

**대안 기각**:
- organization 단위 캐시 — 사용 패턴 (comment list enrich, member get 단건) 에서 이득 부족, invalidation 부담
- `--json` 도 enrich — 응답 스키마 변경 = breaking, 외부 자동화 깨짐
- `member search` 같은 task 포함 — `GET /common/v1/members?name=` 동작이 공식 doc 모순, 실호출 검증 필요로 별도 task
