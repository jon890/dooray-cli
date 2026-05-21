# Phase 3: README/SKILL.md + setup wizard 통합 + 빌드/시나리오 + task 완료

## 컨텍스트

phase 1·2의 last-run 인프라를 사용자 docs에 노출 + setup 마법사에 trackLastRun 항목 통합 검토 + 시나리오 검증.

## 작업 목록 (4개)

### 1) `setup` 마법사에 `trackLastRun` 안내 추가 (필수 — 옵트인 신규 기능을 사용자가 인지할 유일한 surface)

`src/commands/setup.ts` 흐름 끝부분에 confirm prompt 추가:
```ts
const trackLastRun = await confirm({
  message: "feedback --last 모드 활성화 (직전 명령 에러를 GitHub issue에 자동 첨부)?",
  default: false,
});
```

> opt-in이라 default false. 사용자가 명시적으로 켜야 의도 명확. 기존 setup 흐름과 자연 통합.
>
> 설정 변경은 `dooray config set track-last-run true`로 언제든 가능 — setup 마법사는 편의 차원.

### 2) `README.md` + `skills/dooray-cli/SKILL.md` 갱신

**README.md** — feedback 명령 섹션에 추가:
```bash
# --last 모드 (직전 에러 자동 첨부)
dooray config set track-last-run true   # 1회만, opt-in
dooray feedback --last                  # 직전 명령 + 에러 자동 첨부 + $EDITOR로 의견 추가
```

CLAUDE.md "개인 식별 정보 노출 금지"와의 관계 한 줄 안내: "argv는 패턴 마스킹(--api-key/--token/Authorization 등) 후 저장. cwd/env는 미저장 (ADR-023)."

**skills/dooray-cli/SKILL.md** — feedback 항목에 `--last` 명시. agent가 자동화 시 활용 가능.

### 3) 빌드 + 시나리오

```bash
pnpm run build
pnpm test
```

**시나리오 A — `--help` smoke**:
```bash
node dist/index.js feedback --help    # --last 노출
node dist/index.js config set --help  # track-last-run 포함 안내
```

**시나리오 B — 기록 안 됨 (opt-in 미설정)** — 필수, API 무관:
```bash
dooray config get  # trackLastRun 미설정 또는 false
node dist/index.js post get NONEXIST 1    # 에러 발생
test -f ~/.dooray/last-run.json && echo "FAIL: 기록됨" || echo "OK: 미기록"
# 기대: OK: 미기록
```

**시나리오 C — opt-in 후 기록 + --last 자동 첨부**:
```bash
dooray config set track-last-run true
node dist/index.js post get NONEXIST 1    # 에러 발생
cat ~/.dooray/last-run.json               # argv/exitCode/errorMessage/timestamp 확인
jq -r '.argv | join(" ")' ~/.dooray/last-run.json  # sanitized argv
node dist/index.js feedback --last --title "test" --body "재현" --dry-run
# 기대 stdout: "## 직전 실행 (자동 첨부)" 섹션 포함
```

**시나리오 D — sanitization 회귀 가드** — 필수:
```bash
dooray config set track-last-run true
node dist/index.js --api-key=SECRET_VALUE post get X 1   # 에러
grep -E "SECRET_VALUE" ~/.dooray/last-run.json && echo "FAIL: 누출" || echo "OK: 마스킹"
# 기대: OK: 마스킹
```

**시나리오 E — feedback 자체 재귀 방지 (실제 catch 진입 검증)** — 필수:

`feedback --dry-run` 정상 종료는 catch 미진입이라 가드 검증이 안 된다. 따라서 **feedback 명령이 에러로 종료**하는 경로로 검증한다.

```bash
dooray config set track-last-run true
rm -f ~/.dooray/last-run.json

# (E-1) 일반 형태 — feedback --last 호출인데 last-run 없음 → DoorayCliError
node dist/index.js feedback --last 2>/dev/null
test -f ~/.dooray/last-run.json && echo "FAIL: feedback이 자기 에러를 last-run에 기록 (재귀)" || echo "OK: 재귀 방지 동작"
# 기대: OK

# (E-2) 전역 옵션 우회 케이스 — argv[2]가 "feedback" 아닌 경우도 가드해야 함
rm -f ~/.dooray/last-run.json
node dist/index.js --json feedback --last 2>/dev/null
test -f ~/.dooray/last-run.json && echo "FAIL: 전역옵션 앞에 와도 가드 풀림" || echo "OK: 전역옵션 우회 방지"
# 기대: OK
```

**시나리오 F — 기록 없을 때 --last 호출**:
```bash
rm -f ~/.dooray/last-run.json
node dist/index.js feedback --last
# 기대 stderr: "기록된 직전 실행이 없습니다. config.json에 trackLastRun: true ..."
# exit non-zero
```

### 4) Task 완료 처리

`tasks/018-feat-feedback-last-mode/index.json`:
- `status` → `"completed"`
- `current_phase` → `3`
- 모든 `phases[*].status` → `"completed"`
- `updated_at` → 현재 ISO 8601

## 성공 기준

- [ ] `pnpm run build` 성공
- [ ] `pnpm test` 통과
- [ ] 시나리오 A — `--help`에 `--last` 노출
- [ ] **시나리오 B (opt-in 미설정 시 미기록) — 필수 회귀 가드**
- [ ] **시나리오 D (sanitization 회귀 가드) — 필수**
- [ ] (선택) 시나리오 C — 기록 + 자동 첨부 정상
- [ ] **시나리오 E (재귀 방지 — 일반 + 전역옵션 우회) — 필수 회귀 가드**
- [ ] (선택) 시나리오 F — 기록 없을 때 안내 에러
- [ ] `grep -c "track-last-run\|--last\|trackLastRun" README.md skills/dooray-cli/SKILL.md` → 각 2 이상
- [ ] `grep -c "trackLastRun\|track-last-run" src/commands/setup.ts` → 1 이상 (마법사 통합)
- [ ] index.json `status: "completed"`

## 주의사항

- **시나리오 B/D가 회귀 가드 핵심** — opt-in 정책 + sanitization은 보안 정책. 깨지면 프라이버시 사고
- **이슈 #27 close**: 본 task 머지 후 release 시점에 close (release 스킬 Step 9)
- **README 개인 식별 정보 사전 점검 호환**: README/SKILL.md에 추가하는 예시도 `<project>`/`example.com` placeholder 유지
- **setup 마법사 통합 (작업 1)**: 옵트인 신규 기능을 사용자가 인지할 surface. confirm prompt + default false. `dooray config set track-last-run true`도 병행 가능

## Blocked 조건

- 빌드/테스트 실패 → `PHASE_BLOCKED: 앞 phase 결함`
- 시나리오 B/D 통과 못 함 → `PHASE_BLOCKED: phase 1·2 보안 정책 결함`
