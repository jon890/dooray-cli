## ADR-002: ky (HTTP 클라이언트)

**결정**: axios 대신 ky 사용

**이유**:

- Node 18+ native fetch 기반 → 추가 의존성 없음
- 번들 크기 3KB vs axios 13KB
- TypeScript 타입 기본 제공
- CLI 툴에서 axios의 XMLHttpRequest 레거시 불필요

**제약**: 최소 Node 버전은 `package.json` 의 `engines` 가 소유한다. 이 결정을 내릴 때는 18 이상이었다.
