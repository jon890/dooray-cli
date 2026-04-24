# Phase 2: 빌드 + smoke 검증 + task 완료 처리

## 컨텍스트

Phase 1 완료 후 기계 검증 및 task 메타데이터(`index.json`) `completed` 확정. 코드 변경은 이 phase에서 수행하지 않음 (마지막 스텝의 `index.json` 수정만 예외).

### 먼저 읽을 파일

- `tasks/008-refactor-post-body-input/index.json` — 완료 처리 대상

## 목표

1. `pnpm run build` 통과 + 번들 크기 감소 확인
2. `post create / edit / comment add / comment edit --help` 4개 + wiki 회귀 2개 smoke — 옵션 표면 보존
3. `--body` + `--body-file` 동시 지정 시 에러 동작 확인 (body 가드가 먼저 발동하는 2파일은 엄격, 나중에 발동하는 2파일은 exit 코드 검증)
4. `index.json` 완료 처리 (`status: "completed"` 확정)

## 작업 목록 (4개)

### 1) 빌드 + 번들 크기

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm run build
ls -la dist/index.js
```

기대: build 성공 (exit 0). 번들 크기는 이전 대비 감소 (4파일 중복 함수 제거로 수 KB).

### 2) help smoke (post 4개 + wiki 회귀 2개 묶음)

```bash
# cwd: /Users/nhn/personal/dooray-cli

# post 4개 — 옵션 표면 보존
node dist/index.js post create       --help 2>&1 | grep -E "\-\-body|\-\-body-file|\-\-title"
node dist/index.js post edit         --help 2>&1 | grep -E "\-\-body|\-\-body-file|\-\-title"
node dist/index.js post comment add  --help 2>&1 | grep -E "\-\-body|\-\-body-file"
node dist/index.js post comment edit --help 2>&1 | grep -E "\-\-body|\-\-body-file"

# wiki 회귀 2개 — readBodyInput signature 무변경이라 자동 보존
node dist/index.js wiki page create --help 2>&1 | grep -E "\-\-body|\-\-body-file|\-\-title|\-\-parent"
node dist/index.js wiki page edit   --help 2>&1 | grep -E "\-\-body|\-\-body-file|\-\-title"
```

기대: 각 명령의 관련 옵션 모두 그대로 존재.

### 3) 동시 지정 에러 smoke

body 가드가 먼저 발동하는 2파일은 엄격 grep. 나중 발동하는 2파일은 exit 코드만 확인 (resolve 에러가 먼저 나올 수 있음).

```bash
# 엄격: body 가드가 resolve 전
node dist/index.js post create testproj --title "t" --body "a" --body-file /dev/null 2>&1 | grep -c "함께 사용할 수 없습니다"
node dist/index.js post comment add testproj 1     --body "a" --body-file /dev/null 2>&1 | grep -c "함께 사용할 수 없습니다"

# 완화: exit 코드만
node dist/index.js post edit testproj 1            --body "a" --body-file /dev/null; echo "exit=$?"
node dist/index.js post comment edit testproj 1 cid --body "a" --body-file /dev/null; echo "exit=$?"
```

기대: 처음 2개는 grep 결과 `>= 1`. 나머지 2개는 `exit=0`이 아닌 값 출력.

### 4) `index.json` 완료 처리

Edit 도구로 `tasks/008-refactor-post-body-input/index.json` 수정:

- 최상위 `status`: `"pending"` → `"completed"`
- 최상위 `current_phase`: `2`
- 최상위 `updated_at`: 현재 ISO 8601 타임스탬프 (예: `"2026-04-24T00:00:00Z"`)
- `phases[0].status`, `phases[1].status`: 모두 `"completed"`

**반드시 위 1~3 스텝이 모두 통과한 뒤에만 수행.** 검증 실패 상태에서 `completed`로 표시 금지.

## 성공 기준

- [ ] `pnpm run build` 성공 (exit 0)
- [ ] `dist/index.js` 번들 크기 이전 대비 감소 (주관적, 그래프만)
- [ ] `post create --help` → `--body`, `--body-file`, `--title` 존재
- [ ] `post edit --help` → `--body`, `--body-file`, `--title` 존재
- [ ] `post comment add --help` → `--body`, `--body-file` 존재
- [ ] `post comment edit --help` → `--body`, `--body-file` 존재
- [ ] `wiki page create --help` → `--title`, `--parent`, `--body`, `--body-file` 존재 (무회귀)
- [ ] `wiki page edit --help` → `--title`, `--body`, `--body-file` 존재 (무회귀)
- [ ] `post create testproj --title t --body a --body-file /dev/null` → `"함께 사용할 수 없습니다"` grep 매치
- [ ] `post comment add testproj 1 --body a --body-file /dev/null` → 동일 매치
- [ ] `post edit` / `post comment edit` 동시 지정 호출 → exit code != 0
- [ ] `jq -r '.status' tasks/008-refactor-post-body-input/index.json` → `completed`
- [ ] `jq -r '[.phases[].status] | unique | .[]' tasks/008-refactor-post-body-input/index.json` → `completed` (단일 값)
- [ ] `git status --short src/` → 코드 수정 없음 (`index.json`만 변경)

## 주의사항

- **코드 수정 금지** — 검증 실패 시 phase-01 재개 (`--from-phase 1`)
- smoke 결과는 `grep -c` 정수 비교 or `exit code`로만
- `testproj` 등 존재하지 않는 프로젝트 사용은 안전 (Dooray 권한 범위 내 missing이라 resolve 단계에서 실패)
- **4) 스텝은 반드시 1~3 모두 통과 후** — 검증 실패 상태에서 completed로 전환 금지

## Blocked 조건

- `pnpm run build` 실패 → `PHASE_BLOCKED: 빌드 실패 (phase 1 재점검)`
- `post create --help` 또는 `post edit --help`에서 옵션 누락 → `PHASE_BLOCKED: phase 1 옵션 회귀`
- `wiki page create/edit --help`에서 옵션 누락 → `PHASE_BLOCKED: 의도치 않은 wiki 회귀`
- body 가드 smoke에서 `"함께 사용할 수 없습니다"` 누락 → `PHASE_BLOCKED: body-input.ts 에러 메시지 회귀`
