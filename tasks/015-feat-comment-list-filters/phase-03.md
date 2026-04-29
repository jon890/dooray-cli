# Phase 3: README/SKILL.md + 빌드/시나리오 검증 + task 완료 처리

## 컨텍스트

phase 2의 명령 옵션을 사용자 docs(README, dooray-cli 스킬)에 반영 + 시나리오 검증. /release 스킬 Step 3(문서 동기화)에서 통과해야 다음 릴리스 가능.

## 작업 목록 (4개)

### 1) `README.md` 갱신 — "### 댓글" 섹션

`post comment list` 항목에 신규 옵션 5개 + 사용 예시 추가. `post comment latest` 신규 항목 추가. 기존 톤(코드 블록 + 한 줄 설명) 유지.

권장 예시:
```bash
# 최신 5개
dooray post comment list <project> 470 --latest 5

# 시간 이후
dooray post comment list <project> 470 --since 2026-04-27

# 작성자 필터
dooray post comment list <project> 470 --from-author 홍길동

# 단축
dooray post comment latest <project> 470
dooray post comment latest <project> 470 -n 3
```

### 2) `skills/dooray-cli/SKILL.md` 갱신

명령 카탈로그에 `post comment list` 옵션 5개 + `post comment latest` 추가. AI 에이전트가 자동화 시 활용하도록 짧고 명확하게.

### 3) 빌드 + 단위 테스트 + 시나리오 검증

```bash
pnpm run build
pnpm test
```

기대: 30개 테스트 통과. 빌드 warning 없음.

**시나리오 A — `--help` smoke**:
```bash
node dist/index.js post comment list --help    # 5 신규 옵션 노출
node dist/index.js post comment latest --help  # -n/--count + --id/--url 노출
```

**시나리오 B — 옵션 상호배타 (API 호출 없이 검증 가능)**:
```bash
node dist/index.js post comment list X 1 --latest 5 --sort asc
# 기대 stderr: "--latest와 --sort는 동시 사용 불가"
# exit non-zero

node dist/index.js post comment list X 1 --sort invalid
# 기대 stderr: "--sort는 asc 또는 desc만 허용..."

node dist/index.js post comment list X 1 --since "not-a-date"
# 기대 stderr: "--since 값을 파싱할 수 없습니다..."
```

> 시나리오 B는 사용자 환경 무관하게 통과해야 함 — phase 2 검증 로직이 fetch 호출 *전*에 throw해야 함. 만약 통과 안 하면 검증 순서 점검.

**시나리오 C — 실호출 (best-effort, API 키 + 댓글 있는 post 필요)**:
```bash
# 최신 1개
node dist/index.js post comment latest <project> <num>

# 최신 5개
node dist/index.js post comment list <project> <num> --latest 5

# 시간 필터 (어제 이후)
node dist/index.js post comment list <project> <num> --since "$(date -v-1d +%Y-%m-%d)"

# 작성자 필터
node dist/index.js post comment list <project> <num> --from-author <이름>

# desc 정렬
node dist/index.js post comment list <project> <num> --sort desc
```

**시나리오 D — `--since` 안전 마진 (걸림돌 #1)**:
- 댓글 100개 이상인 post에서 `--since` 호출
- 페이지 단위 break 동작 확인 (마지막 페이지 fetch는 since 경계 페이지에서 멈춤)
- 같은 millisecond 동시 등록 댓글이 있으면 — 페이지 내부에서 모두 통과해야 함
- 구체 검증은 사용자 환경 의존. 가능하면 `--json | jq 'length'`로 갯수 확인

### 4) Task 완료 처리

`tasks/015-feat-comment-list-filters/index.json`:
- `status` → `"completed"`
- `current_phase` → `3`
- 모든 `phases[*].status` → `"completed"`
- `updated_at` → 현재 ISO 8601

## 성공 기준

- [ ] `pnpm run build` 성공
- [ ] `pnpm test` 통과
- [ ] 시나리오 A — `--help`에 옵션 노출
- [ ] **시나리오 B — 상호배타 검증 통과 (필수, API 무관)**
- [ ] (선택) 시나리오 C — 실호출 정상
- [ ] (선택) 시나리오 D — `--since` 댓글 누락 0
- [ ] `grep -c "comment list\|comment latest\|--sort\|--latest\|--since\|--from-author" README.md skills/dooray-cli/SKILL.md` → 각 5 이상
- [ ] index.json `status: "completed"`

## 주의사항

- **시나리오 B 회귀 가드 필수**: 검증 로직이 fetch 전에 throw해야 함. 만약 fetch 호출 후 throw되면 API 호출 비용 발생
- **`--since` 안전 마진(걸림돌 #1)**: 페이지 단위 break는 ADR이나 task 주의사항으로 영구 보존되어야 함. 본 task description에 이미 명시
- **이슈 #23 close**: 본 task 머지 후 release 시점에 close (release 스킬 Step 9)
- **README/SKILL.md 톤**: 기존 명령 항목들과 일관 — 코드 블록 1개 + 짧은 설명

## Blocked 조건

- 빌드/테스트 실패 → `PHASE_BLOCKED: 앞 phase 결함`
- 시나리오 B 통과 못 함 (API 호출 후 throw) → `PHASE_BLOCKED: phase 2 검증 순서 결함`
- README/SKILL.md grep miss → 누락 보완 후 재검증
