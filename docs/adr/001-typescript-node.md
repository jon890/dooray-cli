## ADR-001: TypeScript (Node.js) 선택

**결정**: Kotlin(기존 MCP 서버) 대신 TypeScript로 새로 작성

**이유**:

- 팀의 주력 스택이 TypeScript → 개발 속도 우선
- npm 생태계로 `npx @bifos/dooray-cli` 즉시 배포 가능
- CLI 툴 생태계(Commander, chalk, ora 등)가 Node.js에서 가장 성숙

**대안 기각**: Kotlin MCP 서버 코드 재사용 포기 → 다른 ADR과 형식 일관성 확보.
types.ts 포팅 비용은 1일 내라 상쇄 가능.
