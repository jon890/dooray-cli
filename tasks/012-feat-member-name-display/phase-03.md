# Phase 3: comment list 적용 + 단위 테스트

## 컨텍스트

`post comment list` 출력의 Creator 컬럼을 phase 1 헬퍼로 enrich. table 출력만 (JSON은 raw 유지). ADR-021.

### 먼저 읽을 파일

- `src/commands/post/comment/list.ts` — 수정 대상
- `src/formatters/post.ts` `formatCommentList` (41:) — 호출자
- `src/resolvers/member.ts` — phase 1 산출 (`buildMemberNameMap`)
- `src/utils/comment-enrich.ts` — phase 1 산출

## 작업 목록 (3개)

### 1) `src/commands/post/comment/list.ts` — enrich 호출 추가

기존 흐름 (대략):
```ts
const projectId = await resolveProject(...);
const postId = await resolvePost(...);
const res = await client.getPostComments(projectId, postId, ...);
formatCommentList(res.result, globalOpts);
```

변경:
```ts
const projectId = await resolveProject(...);   // 또는 011 적용 후 resolvePostInput
const postId = await resolvePost(...);
const res = await client.getPostComments(projectId, postId, ...);

let comments = res.result;
if (!globalOpts.json) {
  // table/quiet 출력일 때만 enrich (--json은 raw 유지 — ADR-021)
  const nameMap = await buildMemberNameMap(client, projectId);
  comments = enrichCommentCreators(comments, nameMap);
}
formatCommentList(comments, globalOpts);
```

`buildMemberNameMap`은 phase 1에서 추가 API 호출 없이 캐시만 활용 — comment list 한 번 호출에 추가 API 호출 0~1건 (캐시 신선도에 따라 ensureMembers 1건).

> **011 호환성**: 011 phase 3에서 comment list가 `resolvePostInput` 사용으로 바뀌었을 수 있음. resolvePostInput 결과의 `projectId` 활용해 nameMap 빌드. 011 미적용 상태에서는 기존 `resolveProject` 결과 활용. 본 phase 변경은 enrich 호출 한 부분만 추가하면 되어 011과 충돌 없음.

### 2) `src/commands/post/comment/list.ts` — import 추가

```ts
import { buildMemberNameMap } from "../../../resolvers/member.js";
import { enrichCommentCreators } from "../../../utils/comment-enrich.js";
```

### 3) (선택) 통합 테스트는 phase 4 시나리오로 대체

순수 enrich 함수 단위 테스트는 phase 1에서 완료. comment list 명령 자체는 외부 호출이 많아 단위 테스트 비용 ↑ 대비 가치 ↓ → phase 4 실호출 시나리오로 검증.

## 성공 기준

- [ ] `pnpm build` 성공
- [ ] `pnpm test` 통과 (phase 1 테스트들)
- [ ] `grep -c "buildMemberNameMap\|enrichCommentCreators" src/commands/post/comment/list.ts` → 2 이상
- [ ] `grep -c "globalOpts.json\|opts.json" src/commands/post/comment/list.ts` → 1 이상 (json 분기 존재)
- [ ] `git diff --stat` — `src/commands/post/comment/list.ts`만 변경

## 주의사항

- **`--json` 분기 필수**: `if (!opts.json)` 또는 동등 — JSON은 enrich 안 함 (ADR-021 호환성)
- **`--quiet` 모드도 enrich 적용** (table 분기에 포함) — quiet은 ID만 출력해서 enrich 효과 없지만 분기 단순화 차원에서 같이 처리
- **enrich 실패 시 fallback**: `buildMemberNameMap` 실패하면 `try/catch`로 빈 map 사용 → 출력은 기존 빈 컬럼. 명령 실패로 이어지지 않음

## Blocked 조건

- phase 1·2 산출물 부재 → `PHASE_BLOCKED: 의존 phase 미완료`
- comment/list.ts 구조가 011 적용 후 크게 달라진 경우 → enrich 호출 위치만 신중히 판단 후 진행 (구조 변경은 안 함)
