# Phase 4: 빌드 + help/시나리오 검증 + task 완료 처리

## 컨텍스트

코드 변경 없음(검증 + index.json 갱신만). Issue #17 핵심 케이스(comment list Creator 채우기 + member 단건/목록) 동작 확인.

## 작업 목록 (4개)

### 1) 빌드 + 단위 테스트

```bash
# cwd: /Users/nhn/personal/dooray-cli (또는 worktree 루트)
pnpm build
pnpm test
```

기대: 모든 테스트 통과, 빌드 warning 없음.

### 2) `--help` 출력 검증

```bash
node dist/index.js --help                          # member 서브커맨드 노출
node dist/index.js member --help                   # get/list 노출
node dist/index.js member get --help               # <member-id> positional
node dist/index.js member list --help              # <project> positional
node dist/index.js post comment list --help        # 변경 없음 (enrich은 내부)
```

### 3) 실호출 시나리오 (best-effort, API 키 필요)

**시나리오 A — member get**:
```bash
node dist/index.js member get <organizationMemberId>
# 기대: "이름: ...", "member-id: ..." 등 출력

node dist/index.js member get <id> --json
# 기대: MemberDetail JSON 그대로
```

**시나리오 B — member list**:
```bash
node dist/index.js member list tc-ocr
# 기대: ID/Name/Role 컬럼 테이블

node dist/index.js member list tc-ocr --json
# 기대: 멤버 배열 JSON
```

**시나리오 C — comment list Creator enrich (이슈 #17 핵심)**:
```bash
# 캐시 워밍 (해당 프로젝트 멤버 캐시 채우기)
node dist/index.js member list tc-ocr > /dev/null

# 핵심 검증
node dist/index.js post comment list tc-ocr 470
# 기대: Creator 컬럼에 "홍길동" 같은 이름 표시 (이전엔 비어있었음)

# JSON은 raw 유지 (ADR-021)
node dist/index.js post comment list tc-ocr 470 --json
# 기대: creator.member.name이 비어있는 raw 응답 (enrich 안 됨)
```

**시나리오 D — 캐시 miss 케이스**:
```bash
# 캐시 비우고 동일 호출
node dist/index.js cache clear
node dist/index.js post comment list tc-ocr 470
# 기대: 캐시 자동 빌드 후 Creator 컬럼 채워짐 (ensureMembers가 한 번 호출됨)
```

### 4) Task 완료 처리

`tasks/012-feat-member-name-display/index.json` 업데이트:
- `status` → `"completed"`
- `current_phase` → `4`
- 모든 `phases[*].status` → `"completed"`
- `updated_at` → 현재 ISO 8601

## 성공 기준

- [ ] `pnpm build` 성공
- [ ] `pnpm test` 모든 테스트 통과
- [ ] `dooray member` 서브커맨드 트리 등록 확인
- [ ] (선택) 시나리오 A — member get 정상 출력
- [ ] (선택) 시나리오 B — member list 정상 출력
- [ ] (필수, API 가능 시) 시나리오 C — comment list table에 Creator 채워짐
- [ ] (필수, API 가능 시) 시나리오 C — `--json` 응답은 enrich 안 됨 (raw)
- [ ] index.json `status: "completed"`

## 주의사항

- **시나리오 C가 본 task 핵심** — 이게 동작 안 하면 issue #17 미해결
- **`--json`이 enrich 되면 ADR-021 위반** — 확인 필수
- **API 미접근 환경에서도 시나리오 1·2(빌드/help)는 통과해야 함**
- **이슈 #17 close**: 본 task 머지 후 `gh issue close 17` (별도, phase 외)

## Blocked 조건

- 빌드/테스트 실패 → `PHASE_BLOCKED: 앞 phase 결함`
- 시나리오 C에서 `--json`이 enrich되면 → `PHASE_BLOCKED: phase 3 분기 누락`
