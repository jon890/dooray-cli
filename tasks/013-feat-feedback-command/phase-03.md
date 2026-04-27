# Phase 3: 빌드 + 시나리오 검증 + task 완료 처리

## 컨텍스트

코드 변경 없음. Issue #19 핵심 케이스가 동작하는지 확인 + 시크릿 누출 회귀 가드.

## 작업 목록 (4개)

### 1) 빌드 + 단위 테스트

```bash
pnpm build
pnpm test
```

기대: 모두 통과.

### 2) `--help` + 명령 트리

```bash
node dist/index.js --help                      # feedback 노출
node dist/index.js feedback --help             # 5개 옵션 모두 노출
```

### 3) 시나리오 검증

**시나리오 A — `--dry-run` (gh 호출 없음, 안전)**:
```bash
node dist/index.js feedback \
  --title "테스트 피드백" \
  --body "본문 내용" \
  --label "feature-request" \
  --dry-run
```
기대 stdout:
```
--- DRY RUN ---
Repo: jon890/dooray-cli
Title: 테스트 피드백
Labels: feature-request
Body:
## 환경
- dooray-cli 버전: 0.5.x
- Node: vXX.YY.ZZ
- OS: darwin arm64

## 사용자 피드백

본문 내용
--- END ---
```

**시나리오 B — sanitization 회귀 가드**:
```bash
# 본문에 baseUrl/apiKey 절대 포함 안 되는지
node dist/index.js feedback --title T --body B --dry-run | grep -E "baseUrl|apiKey|password|api\.dooray\.com|nhnent" && echo "FAIL: 시크릿 누출" || echo "OK: 시크릿 미포함"
# 기대: "OK: 시크릿 미포함"
```

**시나리오 C — `--body-file`**:
```bash
echo "파일 본문" > /tmp/fb.md
node dist/index.js feedback --title T --body-file /tmp/fb.md --dry-run
# 기대: "파일 본문" 본문 섹션에 들어감
rm /tmp/fb.md
```

**시나리오 D — gh 미설치 시 친절 에러 (수동, gh 임시 PATH 제거)**:
```bash
PATH=/usr/bin node dist/index.js feedback --title T --body B
# 기대 stderr: "gh CLI가 설치되어 있지 않습니다..."
# exit non-zero
```

**시나리오 E — 실제 gh 호출 (이슈 실제 등록 — 신중히)**:
```bash
# 정말 등록할 거면:
node dist/index.js feedback \
  --title "test: dooray feedback 명령 자체 테스트" \
  --body "이 이슈는 #19 task 구현 검증용. 즉시 close 가능." \
  --label "test"
# 기대 stdout: https://github.com/jon890/dooray-cli/issues/N
```

> 시나리오 E는 실제 GitHub issue 생성 → 등록 후 즉시 close 권장. CI에서는 실행 금지.

**시나리오 F — 인터랙티브 (수동, TTY 필요)**:
```bash
node dist/index.js feedback
# 기대 흐름:
# 1. "이슈 제목" prompt
# 2. "라벨 (콤마로 여러 개)" prompt
# 3. $EDITOR 열림 → 본문 작성 후 저장
# 4. 미리보기 출력 → confirm
# 5. (Y) gh 호출 또는 (n) 취소
```

### 4) Task 완료 처리

`tasks/013-feat-feedback-command/index.json` 업데이트:
- `status` → `"completed"`
- `current_phase` → `3`
- 모든 `phases[*].status` → `"completed"`
- `updated_at` → 현재 ISO 8601

## 성공 기준

- [ ] `pnpm build` 성공
- [ ] `pnpm test` 통과
- [ ] 시나리오 A (`--dry-run`) — 본문 정확
- [ ] 시나리오 B — 시크릿 패턴 미포함 확인 ("OK: 시크릿 미포함")
- [ ] 시나리오 C — `--body-file` 정상 동작
- [ ] (가능한 환경) 시나리오 D — gh 미설치 에러 친절
- [ ] (선택) 시나리오 E — 실제 등록 성공 → 즉시 close
- [ ] (선택) 시나리오 F — 인터랙티브 흐름 정상
- [ ] index.json `status: "completed"`

## 주의사항

- **시나리오 B는 회귀 가드 필수** — 미래에 누가 baseUrl 추가하면 즉시 실패해야 함
- **시나리오 E는 실제 GitHub 트래픽** — 테스트용 issue는 즉시 close + body에 "test, ignore" 명시
- **Issue #19 close**: 본 task 머지 후 별도로 `gh issue close 19`
- **CI 테스트는 시나리오 A-D만** (E/F는 수동/대화형)

## Blocked 조건

- 시나리오 B에서 시크릿 누출 발견 → `PHASE_BLOCKED: phase 1·2 sanitization 결함`
- 빌드/테스트 실패 → `PHASE_BLOCKED: 앞 phase 결함`
