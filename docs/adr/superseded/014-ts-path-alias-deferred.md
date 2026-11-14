## ADR-014: TypeScript Path Alias 보류

- **status**: `superseded`

**결정**: `@/` 등 path alias 도입 보류

**대체된 부분**: 결정 전체를 [ADR-082](../082-code-structure.md)가 대체했다. esbuild 와 vitest 가 플러그인 없이 tsconfig `paths` 를 푸는 것을 확인해(2026-11-14) `@/…` 별칭을 도입한다. 아래는 대체되기 전의 당시 맥락이다.

**이유**:

- 현재 `src/` 최대 깊이 4단계 (`commands/post/comment/file/`) → `../../../`까지는 관리 가능한 수준
- tsup(esbuild)이 `tsconfig.json` paths를 자동 resolve하지 않아 별도 플러그인 필요 → 빌드 파이프라인 복잡도 증가
- 프로젝트 규모 대비 실익이 크지 않음

**재검토 시점**: 디렉토리 깊이가 5단계 이상으로 증가하거나 대규모 리팩토링 시
