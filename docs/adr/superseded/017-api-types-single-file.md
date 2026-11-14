## ADR-017: api/types.ts 단일 파일 유지

- **status**: `superseded`

**결정**: `api/types.ts`를 도메인별로 분리하지 않고 단일 파일로 유지

**대체된 부분**: 결정 전체를 [ADR-082](../082-code-structure.md)가 대체했다. 재검토 조건(800줄, 새 영역 둘 이상)을 넘어 타입을 `api/<영역>/types.ts` 로 나누고 `api/types.ts` 는 재내보내기만 남긴다. 아래는 대체되기 전의 당시 맥락이다.

**이유**:

- 분리 임계점(~800줄+)에 아직 미달
- 섹션 주석으로 Common, Project, Post, Comment, Member, Workflow, Wiki, File 구분이 충분
- `DoorayApiHeader`, `DoorayApiResponse<T>` 등 Common 타입을 거의 모든 도메인이 참조 → barrel export 관리 오버헤드 대비 실익 부족
- `client.ts`에서 한 파일로 모든 타입을 import하는 현재 구조가 간결

**재검토 시점**: 800줄 이상이거나 새 도메인(Drive 등)이 2개 이상 추가될 때
