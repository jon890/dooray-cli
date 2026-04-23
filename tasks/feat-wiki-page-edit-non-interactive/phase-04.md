# Phase 4: 빌드 + smoke 검증

## 컨텍스트

Phase 1-3에서 API 레이어 추가, 유틸 추출, 커맨드 분기 로직, SKILL.md 문서화가 완료됐다. 이 phase는 전체가 묶여 빌드·실행 가능한 상태인지 **기계적으로 검증**하고 `--help` 출력을 통해 사용자가 보는 인터페이스가 계획대로 나오는지 smoke test한다.

이 phase는 **코드 변경 없음**. 검증만.

### 먼저 읽을 파일

- `tasks/feat-wiki-page-edit-non-interactive/index.json` — 전체 phase 완료 여부 확인
- `docs/dooray-api-reference.md` §7 "Wiki 페이지 수정 엔드포인트 3종" — 최종 검증 대조

## 목표

1. `pnpm run build` 통과
2. `wiki page edit --help` smoke: 플래그 3개(`--title`, `--body`, `--body-file`) 모두 노출
3. 번들에 3개 엔드포인트 경로 반영 확인
4. `wiki page create --help` 회귀 확인 (기존 플래그 그대로, 에러 메시지 동일)

## 작업 목록

### 1) 빌드

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm run build
```

예상 출력: `CJS dist/index.js ... KB`, `⚡️ Build success`.

### 2) `wiki page edit --help` smoke

```bash
# cwd: /Users/nhn/personal/dooray-cli
node dist/index.js wiki page edit --help
```

기대:
- exit 0
- 출력에 다음 문자열 모두 포함:
  - `--title`
  - `--body`
  - `--body-file`
  - `$EDITOR` 관련 설명 (description 문자열)

```bash
# cwd: /Users/nhn/personal/dooray-cli
node dist/index.js wiki page edit --help 2>&1 | grep -E "\-\-title|\-\-body|\-\-body-file|EDITOR"
```

### 3) `wiki page create --help` 회귀 확인

page-create는 Phase 2에서 내부 readBody만 교체됐고 CLI 시그니처 변경 없음. 회귀 없는지 확인:

```bash
# cwd: /Users/nhn/personal/dooray-cli
node dist/index.js wiki page create --help 2>&1 | grep -E "\-\-title|\-\-parent|\-\-body|\-\-body-file"
```

기대: `--title`, `--parent`, `--body`, `--body-file` 4개 모두 출력됨.

### 4) 번들 반영 확인

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 3개 엔드포인트 URL이 번들에 포함
grep -c "pages/.*/title\|pages/.*/content" dist/index.js

# 충돌 가드 에러 메시지 포함
grep -c "함께 사용할 수 없습니다" dist/index.js

# resolveWikiHomePageId(Issue #5) 등 기존 자산 손상 없음
grep -c "resolveWikiHomePageId\|normalizeDoorayMessage" dist/index.js
```

### 5) task 상태 일관성 확인

```bash
# cwd: /Users/nhn/personal/dooray-cli
cat tasks/feat-wiki-page-edit-non-interactive/index.json | grep -E "\"status\"|\"current_phase\""
```

기대: 마지막 phase 실행 중이므로 status `running` 또는 `completed`, current_phase는 4.

## 성공 기준

- [ ] `pnpm run build` 성공 (exit 0)
- [ ] `node dist/index.js wiki page edit --help` exit 0
- [ ] `wiki page edit --help` 출력에 `--title`, `--body`, `--body-file` 3개 모두 존재
- [ ] `wiki page create --help` 출력에 `--title`, `--parent`, `--body`, `--body-file` 4개 모두 존재
- [ ] `grep -c "pages/.*/title\|pages/.*/content" dist/index.js` → 1 이상
- [ ] `grep -c "함께 사용할 수 없습니다" dist/index.js` → 1 이상
- [ ] `grep -c "resolveWikiHomePageId" dist/index.js` → 1 이상 (Issue #5 자산 보존)
- [ ] `grep -c "normalizeDoorayMessage" dist/index.js` → 1 이상 (Issue #6 자산 보존)
- [ ] `git status --short` → 코드 수정 없음 (이 phase는 검증만)

## 주의사항

- **이 phase는 코드 변경 금지** — 검증 실패 시 이전 phase로 되돌아가 수정. phase 4에서 직접 fix하지 말 것
- **회귀 확인은 `create --help` 까지만** — 실제 실행은 실 API 키가 필요하므로 smoke 수준에서 멈춤
- **만약 `pnpm run build`가 성공하는데 smoke 테스트 실패** → `PHASE_BLOCKED: smoke 불일치 — 수동 검토 필요`

## Blocked 조건

- `pnpm run build` 실패 → 에러 메시지 수집 후 `PHASE_BLOCKED: 빌드 실패 (phase 1-3 재점검 필요)`
- `wiki page edit --help` 가 exit 0 아님 → `PHASE_BLOCKED: 커맨드 등록 회귀`
- 번들에 `/title` 또는 `/content` URL 미포함 → `PHASE_BLOCKED: API 메서드 미반영 (phase 1 재검토)`
- Issue #5/#6 자산(`resolveWikiHomePageId`, `normalizeDoorayMessage`) 중 하나라도 번들에서 사라짐 → `PHASE_BLOCKED: 기존 자산 회귀`
