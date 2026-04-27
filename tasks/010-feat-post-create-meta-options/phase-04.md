# Phase 4: doctor/cache 명령 갱신 + 정합성 점검

## 컨텍스트

신규 캐시(`tags/`, `milestones/`)를 doctor 통계에 반영. 본 phase는 사용자가 `dooray doctor`로 새 캐시 상태를 볼 수 있게 함.

`src/commands/cache.ts`는 현재 `clear`/`refresh` 서브커맨드만 존재 (`stats` 서브커맨드 없음). `cache clear`는 디렉토리 통째 삭제이므로 신규 캐시도 자동 적용 — cache.ts는 본 phase에서 변경하지 않는다.

### 먼저 읽을 파일

- `src/cache/store.ts` `getCacheStats` — 통계 함수
- `src/commands/doctor.ts` — `getCacheStats` 호출자 (단 1곳)
- 위 2개 파일에서 `memberProjectCount`, `workflowProjectCount` 패턴 파악

## 작업 목록 (2개)

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

## 성공 기준

- [ ] `pnpm build` 성공
- [ ] `grep -c "tagProjectCount\|milestoneProjectCount" src/cache/store.ts` → 2 이상
- [ ] `grep -c "tagProjectCount\|milestoneProjectCount\|Tag 캐시\|Milestone 캐시" src/commands/doctor.ts` → 2 이상
- [ ] `node dist/index.js doctor` 실행 시 Tag/Milestone 캐시 라인 2줄 노출 (phase 5 시나리오 포함)
- [ ] `getCacheStats` 호출자가 doctor.ts 외에 또 있으면 빌드 에러 — 없는 게 정상
- [ ] `git diff --stat` — `src/cache/store.ts`, `src/commands/doctor.ts` 만 변경 (`src/commands/cache.ts` 미변경)

## 주의사항

- **TAGS_DIR/MILESTONES_DIR 상수는 phase 1에서 추가**되어 있어야 함. 없으면 phase 1 누락
- **기존 라벨 톤(한글)** 그대로 — "프로젝트 수" 같은 표현 일관
- **`src/commands/cache.ts` 변경 금지** — `cache stats` 서브커맨드는 존재하지 않으며 `cache clear`는 디렉토리 통째 삭제로 자동 작동

## Blocked 조건

- phase 1의 `TAGS_DIR`/`MILESTONES_DIR` 상수 부재 → `PHASE_BLOCKED: phase 1 미완료`
- `getCacheStats` 호출 시그니처 변경에 의한 컴파일 에러 다수 → `PHASE_BLOCKED: stats 시그니처 호환성 위험`
