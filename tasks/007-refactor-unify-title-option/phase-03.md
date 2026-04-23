# Phase 3: 빌드 + smoke 검증 + task 완료 처리

## 컨텍스트

Phase 1-2 결과를 기계적으로 검증하고, task 메타데이터(`index.json`)를 `completed`로 확정. 코드 변경은 이 phase에서 수행하지 않음.

### 먼저 읽을 파일

- `tasks/007-refactor-unify-title-option/index.json` — 완료 처리 대상

## 목표

1. `pnpm run build` 통과
2. 변경 커맨드(`post create`/`post edit`) help 출력에 `--title` + `--subject` 둘 다 노출
3. 회귀 검증 — `post list`/`mail send`의 `--subject`, `wiki page create`의 `--title` 유지
4. 필수 옵션 누락 에러 smoke (`post create` 인자 누락 시 에러)
5. `index.json` 완료 처리 (`status: "completed"` 확정)

## 작업 목록 (5개)

### 1) 빌드 + 번들 크기 확인

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm run build
ls -la dist/index.js
```

번들 크기 증가는 수 KB 이하 (정책 문자열·옵션 추가 정도)여야 정상.

### 2) 변경 커맨드 help smoke (post create + post edit 묶음)

```bash
node dist/index.js post create --help 2>&1 | grep -E "\-\-title|\-\-subject"
node dist/index.js post edit   --help 2>&1 | grep -E "\-\-title|\-\-subject"
```

기대: 각 커맨드에 `--title`·`--subject` 두 옵션 모두 존재. `--subject`에는 "deprecated alias" 설명 노출.

### 3) 회귀 help smoke (post list + mail send + wiki page create 묶음)

```bash
node dist/index.js post list        --help 2>&1 | grep -E "\-\-subject"
node dist/index.js mail send        --help 2>&1 | grep -E "\-\-subject"
node dist/index.js wiki page create --help 2>&1 | grep -E "\-\-title"
```

기대:
- `post list`의 `--subject <keyword>` 유지 (필터 키워드)
- `mail send`의 `--subject` 유지 (이메일 표준 용어)
- `wiki page create`의 `--title` 유지

### 4) 에러 경로 smoke (post create 인자 누락)

```bash
# --title/--subject 둘 다 없으면 "--title이 필요합니다." 에러 + exit != 0
node dist/index.js post create testproj 2>&1 | grep -E "title|필요"
```

기대: 에러 메시지에 "title" 또는 "필요" 포함, shell non-zero exit.

### 5) `index.json` 완료 처리

Edit 도구로 `tasks/007-refactor-unify-title-option/index.json` 수정:

- 최상위 `status`: `"pending"` → `"completed"`
- 최상위 `current_phase`: `3`
- 최상위 `updated_at`: 현재 ISO 8601 타임스탬프 (예: `"2026-04-23T00:00:00Z"`)
- `phases[0].status`, `phases[1].status`, `phases[2].status`: 모두 `"completed"`

## 성공 기준

- [ ] `pnpm run build` 성공 (exit 0)
- [ ] `post create --help` 출력에 `--title` + `--subject` 둘 다 존재
- [ ] `post edit --help` 출력에 `--title` + `--subject` 둘 다 존재
- [ ] `post list --help` 출력에 `--subject` 존재 (필터 키워드 유지)
- [ ] `mail send --help` 출력에 `--subject` 존재 (이메일 제목 유지)
- [ ] `wiki page create --help` 출력에 `--title` 존재
- [ ] `node dist/index.js post create testproj` exit != 0 + 에러 메시지에 "title" 또는 "필요" 포함
- [ ] `jq -r '.status' tasks/007-refactor-unify-title-option/index.json` → `completed`
- [ ] `jq -r '[.phases[].status] | unique | .[]' tasks/007-refactor-unify-title-option/index.json` → `completed` (단일 값)
- [ ] `git status --short src/` → 이 phase에서는 코드 수정 없음 (`index.json`만 변경)

## 주의사항

- **코드 수정 금지** — 검증 실패 시 이전 phase 재개 (`--from-phase N`)
- smoke 검증은 `--help` 위주 — 실제 API 호출은 API 키 필요하므로 생략
- 에러 smoke에서 `process.exit(N)` 때문에 쉘 non-zero 반환됨 — `grep -E` 가 매치되면 테스트 통과
- **5) 스텝은 반드시 모든 검증 통과 후 실행** — 검증 실패 상태에서 `completed`로 표시하지 말 것

## Blocked 조건

- `pnpm run build` 실패 → `PHASE_BLOCKED: 빌드 실패 (phase 1 재점검)`
- `post create --help` 또는 `post edit --help` 에서 `--title` 누락 → `PHASE_BLOCKED: phase 1 옵션 누락`
- `post list --help` 또는 `mail send --help` 에서 `--subject` 누락 → `PHASE_BLOCKED: 의도치 않은 회귀`
