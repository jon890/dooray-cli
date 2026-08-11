## ADR-019: `post create` 메타데이터 옵션 (`--tag`/`--parent`/`--workflow`/`--milestone`)

**결정**: 4개 옵션 모두 이름 lookup.
클라이언트가 `tagGroup.mandatory` / `selectOne` 사전 검증.
`--workflow` 만 create 후 `setPostWorkflow` 후속 호출 — 실패 시 `stderr` warn, `exit 0` (post 는 이미 생성됨).

**맥락**: mandatory-tag 정책 프로젝트는 CLI 로 단 한 건도 생성 불가 (Issue #18).
API 의 `USER_INVALID_TAG_MANDATORY_PREFIX` 에러는 어느 그룹이 누락인지 안내 안 함 → 친절한 메시지 직접 생성 필요.
멤버만 부분일치였던 resolver 비대칭도 해소 — 아래 순서로 통일:
- 정확 일치
- 부분 일치
- 모호, 후보 출력

**대안 기각**:
- `--workflow` 실패 시 exit non-zero — post 가 이미 발급된 상태에서 전체 실패는 사용자가 두 번 만드는 혼란
- ID 직접 입력 허용 — `--workflow xxx-uuid` 같은 폴백은 거의 사용 안 되는 흐름, 복잡도만 ↑
- `--tag` 에 자릿수 휴리스틱 — ID 형식 변경 시 깨짐. `--parent` 만 `code/number` ↔ raw postId 분기

세부 시그니처·동작은 `src/commands/post/create.ts`, `src/resolvers/{tag,milestone,postRef}.ts` 참조.
캐시 디렉터리는 `data-schema.md`.

**확장 (2026-05-18, Issue #66)**: `post edit` 도 동일 정책 적용 — `--tag` / `--tag-clear` / `--tag-remove` 옵션, mandatory 검증 동일 호출.
`--title`/`--body` 없이 단독 호출 허용 (body 자동 재전송).
머지 로직은 `src/resolvers/post-tags.ts` 의 `mergeTagIds` pure helper — `post-users.ts` 동일 패턴 적용.
