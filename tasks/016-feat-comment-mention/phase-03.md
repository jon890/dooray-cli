# Phase 3: README/SKILL.md + 빌드/시나리오 검증 + task 완료

## 컨텍스트

phase 2의 옵션을 사용자 docs에 반영 + 시나리오 검증. /release 스킬 Step 3(문서 동기화)에서 통과해야 다음 릴리스 가능.

## 작업 목록 (4개)

### 1) `README.md` 갱신 — "### 댓글" 섹션

`post comment add` 항목에 옵션 + 사용 예시 추가. `comment edit` 동일.

권장 예시:
```bash
# 멤버 멘션 1명
dooray post comment add P 1 --mention 홍길동 --body "확인 부탁드립니다"

# 여러 명
dooray post comment add P 1 --mention 홍길동 --mention 김철수 --body "..."

# 그룹 멘션
dooray post comment add P 1 --mention-group 개발 --body "검토 요청"

# 멤버 + 그룹 혼합
dooray post comment add P 1 \
  --mention 홍길동 \
  --mention-group 개발 \
  --body "검토 부탁드립니다"
```

이전 캐시 호환 안내 1줄: "이전 버전 캐시는 orgId가 없으므로 첫 호출 시 자동 갱신됩니다 (또는 `dooray cache clear`)."

### 2) `skills/dooray-cli/SKILL.md` 갱신

명령 카탈로그에 `--mention`/`--mention-group` 추가. 기존 "Dooray 마크다운 링크 형식" 섹션(#21)과 연계 — 명령이 그 형식을 자동 출력한다는 점 명시.

```markdown
### 멘션 자동 작성 (post comment add/edit)

`--mention <name>` (반복) 또는 `--mention-group <code>` (반복)로 본문 앞에 멘션 마크업 자동 prepend.

dooray post comment add P 1 --mention 홍길동 --mention-group 개발 --body "..."
# 결과 본문: [@홍길동](dooray://orgId/members/m1 "member") [@P/개발](dooray://orgId/member-groups/g1) ...
```

### 3) 빌드 + 단위 테스트 + 시나리오 검증

```bash
pnpm run build
pnpm test
```

기대: 모두 통과. 신규 단위 테스트(mention) 포함 30+개 케이스.

**시나리오 A — `--help` smoke**:
```bash
node dist/index.js post comment add --help     # --mention, --mention-group 노출
node dist/index.js post comment edit --help    # 동일
```

**시나리오 B — 마크업 형식 회귀 가드 (단위 테스트 통과로 자동)**:
phase 2의 mention.test.ts가 형식을 정확히 검증. 단위 테스트 fail = 즉시 회귀.

**시나리오 C — 실호출 (best-effort, API 키 + 댓글 가능 post 필요)**:
```bash
# 멤버 1명
node dist/index.js post comment add P NUM \
  --mention <이름> --body "테스트 멘션"

# 여러 명 + 그룹
node dist/index.js post comment add P NUM \
  --mention <이름1> --mention <이름2> \
  --mention-group <그룹코드> \
  --body "혼합 테스트"

# 본인 멘션 (me title 검증)
node dist/index.js post comment add P NUM \
  --mention <본인이름> --body "self mention"
# Dooray 앱에서 본인 멘션이 "me" title로 렌더되는지 시각 확인
```

**시나리오 D — 모호 매칭 + 빈 orgId 에러**:
```bash
node dist/index.js post comment add P NUM --mention 김 --body "..."
# 기대: "복수의 멤버가 매칭됩니다: \"김\" ..." 에러

# 캐시 강제 stale 시뮬레이션 (이전 버전 캐시) — orgId 자가치유 확인
node dist/index.js cache clear
node dist/index.js post comment add P NUM --mention <이름> --body "..."
# 기대: 첫 호출 시 자동으로 me 캐시 갱신, 정상 동작
```

### 4) Task 완료 처리

`tasks/016-feat-comment-mention/index.json`:
- `status` → `"completed"`
- `current_phase` → `3`
- 모든 `phases[*].status` → `"completed"`
- `updated_at` → 현재 ISO 8601

## 성공 기준

- [ ] `pnpm run build` 성공
- [ ] `pnpm test` 통과 (mention 단위 테스트 6+ 추가)
- [ ] 시나리오 A — `--help`에 옵션 노출
- [ ] 시나리오 B — 단위 테스트 통과 (형식 회귀 가드)
- [ ] (선택) 시나리오 C — 실호출 정상
- [ ] (선택) 시나리오 D — 모호 에러 + orgId 자가치유
- [ ] `grep -c "comment add\|comment edit\|--mention" README.md skills/dooray-cli/SKILL.md` → 각 5 이상
- [ ] index.json `status: "completed"`

## 주의사항

- **시나리오 B(단위 테스트)가 회귀 가드 핵심** — 마크업 형식이 깨지면 즉시 fail
- **이슈 #25 close**: 본 task 머지 후 release 시점에 close (release 스킬 Step 9)
- **README/SKILL.md 톤**: 기존 명령 항목과 일관 — 코드 블록 + 짧은 설명. 마크업 출력 결과를 한 줄 예시로 시각화

## Blocked 조건

- 빌드/테스트 실패 → `PHASE_BLOCKED: 앞 phase 결함`
- 시나리오 B 단위 테스트 실패 → `PHASE_BLOCKED: phase 2 mention helper 결함`
