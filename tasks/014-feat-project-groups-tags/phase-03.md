# Phase 3: 빌드 + smoke + task 완료 처리

## 컨텍스트

코드 변경 없음 — 검증 + index.json 갱신.

## 작업 목록 (4개)

### 1) 빌드 + 단위 테스트

```bash
pnpm run build
pnpm test
```

기대: 모두 통과. `dist/index.js` 크기 변화는 무시 가능 범위.

### 2) `--help` smoke

```bash
node dist/index.js project --help              # groups, tags 노출
node dist/index.js project groups --help       # <project> positional
node dist/index.js project tags --help         # <project> positional
node dist/index.js doctor                      # Member Group 캐시 라인 노출 (cache 비어있으면 0)
```

### 3) 실호출 시나리오 (best-effort, API 키 필요)

**시나리오 A — project groups**:
```bash
node dist/index.js project groups <project>
# 기대: ID/Code 컬럼 테이블

node dist/index.js project groups <project> --json
# 기대: [{id, code}, ...] JSON
```

**시나리오 B — project tags**:
```bash
node dist/index.js project tags <project>
# 기대: ID/Color/Name/Group/Mandatory 컬럼 (010 캐시 사용 — 빈 color 가능)

# 010 캐시 invalidation 후
node dist/index.js cache clear
node dist/index.js project tags <project>
# 기대: Color 컬럼이 6자리 hex (예: ffcedd)로 채워짐
```

**시나리오 C — 통계 갱신 확인**:
```bash
# 위 호출 후
node dist/index.js doctor
# 기대: "Member Group 캐시 (프로젝트 수): 1" / "Tag 캐시 (프로젝트 수): 1+"
```

### 4) Task 완료 처리

`tasks/014-feat-project-groups-tags/index.json` 업데이트:
- `status` → `"completed"`
- `current_phase` → `3`
- 모든 `phases[*].status` → `"completed"`
- `updated_at` → 현재 ISO 8601

## 성공 기준

- [ ] `pnpm run build` 성공
- [ ] `pnpm test` 통과
- [ ] `project groups`/`tags` `--help` 정상
- [ ] `doctor` 출력에 `Member Group 캐시` 라인 추가
- [ ] (선택) 시나리오 A — groups 출력 정상
- [ ] (선택) 시나리오 B — tags Color 컬럼이 6자리 hex로 채워짐 (cache clear 후)
- [ ] index.json `status: "completed"`

## 주의사항

- **시나리오 B의 cache clear 안내가 README에 들어가 있어야 함** (phase 2 작업 5)
- **이슈 #20 close**: 본 task 머지 후 release 시점에 close (release 스킬의 신규 Step 9에 따라)
- **API 미접근 환경에서도 시나리오 1·2는 통과해야 함**
- **`dist/index.js` 크기**: 122KB대 (010·011·012·013 누적). 본 task로 수 KB 증가 예상

## Blocked 조건

- 빌드/테스트 실패 → `PHASE_BLOCKED: 앞 phase 결함`
- `--help`에 명령 미노출 → `PHASE_BLOCKED: phase 2 미완료`
