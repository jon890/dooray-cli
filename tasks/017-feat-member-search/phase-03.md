# Phase 3: README/SKILL.md + 빌드/시나리오 + task 완료

## 컨텍스트

phase 2의 명령을 사용자 docs에 반영 + 시나리오 검증. /release Step 3 docs sync 통과해야 다음 릴리스 가능.

## 작업 목록 (4개)

### 1) `README.md` — "### 멤버" 섹션 갱신

`dooray member search` 항목 + 사용 예시 추가:
```bash
# 이름 검색
dooray member search 홍길동

# 이메일 (정확히 일치)
dooray member search --email user@example.com

# 사번 like
dooray member search --user-code abc

# 페이지네이션
dooray member search 김 --size 50 --page 1
```

### 2) `skills/dooray-cli/SKILL.md` 갱신

명령 카탈로그에 `member search` 추가. positional + 옵션 분기 한 줄 설명.

### 3) 빌드 + 시나리오

```bash
pnpm run build
pnpm test
```

**시나리오 A — `--help` smoke**:
```bash
node dist/index.js member search --help    # 모든 옵션 노출
node dist/index.js member --help           # search 서브명령 노출
```

**시나리오 B — 옵션 검증 (필수, API 무관)**:
```bash
node dist/index.js member search
# 기대 stderr: "검색 조건이 필요합니다..."
# exit non-zero

node dist/index.js member search 홍길동 --email u@x.com
# 기대 stderr: "positional <keyword>(name)와 --email/... 동시 사용 불가"
# exit non-zero
```

> 시나리오 B는 fetch 전 throw — API 호출 비용 0. 통과 못 하면 phase 2 검증 순서 결함.

**시나리오 C — 실호출 (best-effort, API 키 필요)**:
```bash
# 흔한 이름으로 검색 (결과 0+ 건)
node dist/index.js member search 김

# 본인 이메일로 검색 (1건)
node dist/index.js member search --email <본인 이메일>

# JSON 출력
node dist/index.js member search 홍 --json
```

### 4) Task 완료 처리

`tasks/017-feat-member-search/index.json`:
- `status` → `"completed"`
- `current_phase` → `3`
- 모든 `phases[*].status` → `"completed"`
- `updated_at` → 현재 ISO 8601

## 성공 기준

- [ ] `pnpm run build` 성공
- [ ] `pnpm test` 통과
- [ ] 시나리오 A — `--help`에 옵션 노출
- [ ] **시나리오 B — 옵션 검증 통과 (필수, API 무관)**
- [ ] (선택) 시나리오 C — 실호출 정상
- [ ] `grep -c "member search\|--email\|--user-code" README.md skills/dooray-cli/SKILL.md` → 각 3 이상
- [ ] index.json `status: "completed"`

## 주의사항

- **시나리오 B 회귀 가드**: 검증 로직이 fetch *전*에 throw. fetch 후 throw면 회귀
- **이슈 #26 close**: 본 task 머지 후 release 시점에 close (release 스킬 Step 9)
- **README/SKILL.md 톤**: 기존 `member get`/`list` 항목과 일관

## Blocked 조건

- 빌드/테스트 실패 → `PHASE_BLOCKED: 앞 phase 결함`
- 시나리오 B 통과 못 함 → `PHASE_BLOCKED: phase 2 검증 순서 결함`
