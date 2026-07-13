## ADR-020: post 명령 input 통합 (`--id`/URL/positional) + 첫 테스트 인프라 (vitest)

**결정**: post 하위 명령에 3 가지 입력 모드 (기존 `<project> <post-number>` + `--id <postId>` + `--url <url>` + 첫 positional 이 Dooray URL 이면 자동) 도입.
sub-id (`<comment-id>`, `<file-id>`) 는 옵션화 (positional 호환).
분기는 `resolvePostInput` 단일 헬퍼.
동시 사용은 명시적 에러.
첫 테스트 인프라로 vitest 도입.

**맥락**: Dooray URL 은 postId 만 포함 (`/task/to/{postId}`) — 동료가 URL 만 공유하면 project 코드 모르는 사용자가 CLI 사용 불가 (Issue #16).
AI 에이전트도 사용자 메시지에서 URL 을 그대로 첫 인자로 전달하면 라우팅 부담 0.
standalone API `GET /project/v1/posts/{postId}` 응답에 `project.{id,code}` 포함 → 한 lookup 으로 기존 코드 경로 재사용.
분기 규칙이 7 가지라 단위 테스트로 회귀 방지 필수.

**대안 기각**:
- positional 단일 `<ref>` 통합 (`<project>/337` | postId | URL) — 기존 두 인자 breaking, 영향 범위 ↑
- positional 1개 numeric → postId 자동 인식 — 19자리 임계는 임의값, ID 길이 변경 시 깨짐
- sub-id 를 인자 개수로 분기 — `comment edit <project> cmt-abc` 같은 사용자 실수에 모호한 에러
- `node:test` 빌트인 — mocking·watch·확장성에서 vitest 우위

분기 규칙·URL 정규식·테스트 케이스는 `src/resolvers/post-input.ts` + `src/utils/dooray-url.ts` 참조.
후속 (wiki input 통합, CI 통합) 은 별도 task.

**보강 (Issue #82/#83, 2026-06)**: 입력 처리를 '만능 추론' 에서 '명시적 타입 분류' 로 강화한다.
`classifyPostInputToken` 이 토큰을 postId / postNumber / url / project 로 분류한다.
진입점 (`--id` / `--url` / positional) 이 기대 타입과 불일치하면 타입별 안내 에러를 던진다.

- positional 2번째가 postId (15+자리 numeric) 면 "`--id` 를 쓰세요" 안내 (#82).
- URL 형식에 `/project/tasks/{postId}` 추가 (#83 — `/task/{pid}/{id}` 는 기존 처리).

길이 임계 (15+자리) 는 **안내 트리거로만** 쓰고 조회 분기로는 쓰지 않는다.
따라서 본 ADR 의 'positional numeric → postId 자동 인식 기각' 은 유지된다.
긴 numeric 을 postId 로 조용히 조회하지 않고 `--id` 명시 경로로 유도한다.
ID 체계가 바뀌어 분류가 틀려도 `--id` 경로는 영향받지 않는다.
