# Phase 4: doctor/cache 명령 갱신 + 정합성 점검

## 컨텍스트

신규 캐시(`tags/`, `milestones/`)를 doctor·cache 통계에 반영. 본 phase는 사용자가 `dooray doctor`/`dooray cache stats`로 새 캐시 상태를 볼 수 있게 함.

### 먼저 읽을 파일

- `src/cache/store.ts` `getCacheStats` — 통계 함수
- `src/commands/doctor.ts` — stats 출력 위치
- `src/commands/cache.ts` — `cache stats`/`cache clear` 출력
- 위 3개 파일에서 `memberProjectCount`, `workflowProjectCount` 패턴 파악

## 작업 목록 (3개)

### 1) `src/cache/store.ts` — `getCacheStats` 확장

기존:
```ts
export async function getCacheStats(): Promise<{
  projectCount: number;
  memberProjectCount: number;
  workflowProjectCount: number;
  me: CachedMe | null;
}>
```

확장:
```ts
export async function getCacheStats(): Promise<{
  projectCount: number;
  memberProjectCount: number;
  workflowProjectCount: number;
  tagProjectCount: number;
  milestoneProjectCount: number;
  me: CachedMe | null;
}>
```

`workflowProjectCount` 계산 패턴(`readdir(WORKFLOWS_DIR)` + `.json` 카운트)을 **그대로 복사**해서 `TAGS_DIR`, `MILESTONES_DIR`에 적용. 디렉토리 부재 시 0 반환 (기존과 동일 try/catch).

### 2) `src/commands/doctor.ts` — 출력 추가

기존에 `memberProjectCount`/`workflowProjectCount`를 출력하는 라인 옆에 동일 패턴으로 2줄 추가:
- "Tag 캐시 (프로젝트 수): N"
- "Milestone 캐시 (프로젝트 수): N"

기존 라벨 한글/영문 톤 그대로 따를 것.

### 3) `src/commands/cache.ts` — `cache stats` 출력 추가

`stats` 서브커맨드에서 동일하게 2줄 추가. `cache clear`는 `~/.dooray/cache/` 통째 삭제이므로 자동 적용 — 변경 불필요.

## 성공 기준

- [ ] `pnpm build` 성공
- [ ] `grep -c "tagProjectCount\|milestoneProjectCount" src/cache/store.ts` → 2 이상
- [ ] `grep -c "tagProjectCount\|milestoneProjectCount\|Tag 캐시\|Milestone 캐시" src/commands/doctor.ts src/commands/cache.ts` → 4 이상
- [ ] `node dist/index.js cache stats` 실행 시 새 항목 2줄 노출 (수동 확인 가능 — phase 5 시나리오에 포함)
- [ ] `getCacheStats` 호출자가 doctor/cache 외에 또 있으면 빌드 에러 — 없는 게 정상

## 주의사항

- **TAGS_DIR/MILESTONES_DIR 상수는 phase 1에서 추가**되어 있어야 함. 없으면 phase 1 누락
- **기존 라벨 톤(한글)** 그대로 — "프로젝트 수" 같은 표현 일관
- **`cache clear` 변경 금지** — 디렉토리 통째 삭제로 자동 작동

## Blocked 조건

- phase 1의 `TAGS_DIR`/`MILESTONES_DIR` 상수 부재 → `PHASE_BLOCKED: phase 1 미완료`
- `getCacheStats` 호출 시그니처 변경에 의한 컴파일 에러 다수 → `PHASE_BLOCKED: stats 시그니처 호환성 위험`
