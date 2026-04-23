# Phase 2: 빌드 + smoke 검증

## 컨텍스트

Phase 1 완료 후 기계 검증. 코드 변경 없음.

### 먼저 읽을 파일

- `tasks/008-refactor-post-body-input/index.json` — phase 1 상태 확인용

## 목표

1. `pnpm run build` 통과
2. `post create / edit / comment add / comment edit --help` 4개 smoke — 기존 옵션 표면 보존 확인
3. `--body` + `--body-file` 동시 지정 시 에러 동작 확인 (4 파일 모두)
4. wiki 커맨드 회귀 없음 (page-create, page-edit 는 body-input.ts 시그니처 무변경이라 자동 보존)

## 작업 목록

### 1) 빌드

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm run build
```

### 2) `--help` smoke 4개

```bash
# cwd: /Users/nhn/personal/dooray-cli

node dist/index.js post create --help 2>&1 | grep -E "\-\-body|\-\-body-file|\-\-title"
node dist/index.js post edit --help 2>&1 | grep -E "\-\-body|\-\-body-file|\-\-title"
node dist/index.js post comment add --help 2>&1 | grep -E "\-\-body|\-\-body-file"
node dist/index.js post comment edit --help 2>&1 | grep -E "\-\-body|\-\-body-file"
```

기대: 각 명령의 help 출력에 관련 옵션 모두 그대로 존재.

### 3) wiki 회귀 확인

```bash
node dist/index.js wiki page create --help 2>&1 | grep -E "\-\-body|\-\-body-file|\-\-title|\-\-parent"
node dist/index.js wiki page edit --help 2>&1 | grep -E "\-\-body|\-\-body-file|\-\-title"
```

기대: 기존 옵션 그대로.

### 4) 동시 지정 에러 smoke (post 4파일)

실제 API 호출 전에 에러가 뜨도록 **존재하지 않는 프로젝트**를 인자로 주되 body 충돌을 만든다. 가드가 early throw 하므로 프로젝트 해석 전에 에러가 나와야 함.

```bash
# post create
node dist/index.js post create testproj --title "t" --body "a" --body-file /dev/null 2>&1 | grep "함께 사용할 수 없습니다"

# post edit
node dist/index.js post edit testproj 1 --body "a" --body-file /dev/null 2>&1 | grep "함께 사용할 수 없습니다"

# post comment add
node dist/index.js post comment add testproj 1 --body "a" --body-file /dev/null 2>&1 | grep "함께 사용할 수 없습니다"

# post comment edit
node dist/index.js post comment edit testproj 1 dummy-comment-id --body "a" --body-file /dev/null 2>&1 | grep "함께 사용할 수 없습니다"
```

**주의**: 일부 명령은 API 호출보다 config 로드/프로젝트 resolve가 먼저 일어날 수 있음 — 그 경우 `config not found` 같은 에러가 먼저 나오면 smoke 실패. 실제 동작 순서 확인 필요. action 함수 진입 직후에 `readBodyInput*` 을 호출하는 파일은 body 가드가 먼저. resolve 후에 호출하는 파일은 resolve 에러가 먼저.

Phase 1 설계에 따르면:
- `post/create`: `resolveProject` **전**에 `readBodyInput` 호출 → body 가드 먼저
- `post/edit`: `resolveProject`/`resolvePost` **후**에 `readBodyInputOrNull` 호출 → resolve 에러 먼저 (실제 프로젝트 없으면 config/API 에러)
- `post/comment/add`: `readBodyInputOrNull`을 `resolveProject` **전**에 호출 → body 가드 먼저
- `post/comment/edit`: `resolveProject`/`resolvePost`/`getPostComments` **후**에 `readBodyInputOrNull` 호출 → resolve 에러 먼저

**수정된 smoke 전략**: body 가드가 먼저 발동하는 2파일만 strict grep. 나머지 2파일은 grep 없이 exit 코드 비영(!=0)만 확인.

```bash
# body 가드가 먼저 발동 (엄격)
node dist/index.js post create testproj --title "t" --body "a" --body-file /dev/null 2>&1 | grep -c "함께 사용할 수 없습니다"
node dist/index.js post comment add testproj 1 --body "a" --body-file /dev/null 2>&1 | grep -c "함께 사용할 수 없습니다"

# body 가드가 나중에 발동 (완화: exit 코드만)
node dist/index.js post edit testproj 1 --body "a" --body-file /dev/null; echo "exit=$?"
node dist/index.js post comment edit testproj 1 cid --body "a" --body-file /dev/null; echo "exit=$?"
```

### 5) 번들 크기 점검

```bash
ls -la dist/index.js
# 이전 빌드 대비 크기가 크게 감소 (4파일의 중복 함수 제거로 수 KB)
```

## 성공 기준

- [ ] `pnpm run build` 성공 (exit 0)
- [ ] `post create --help` 출력에 `--body`, `--body-file`, `--title` 존재
- [ ] `post edit --help` 출력에 `--body`, `--body-file`, `--title` 존재
- [ ] `post comment add --help` 출력에 `--body`, `--body-file` 존재
- [ ] `post comment edit --help` 출력에 `--body`, `--body-file` 존재
- [ ] `wiki page create --help` 출력에 `--title`, `--parent`, `--body`, `--body-file` 존재 (무회귀)
- [ ] `wiki page edit --help` 출력에 `--title`, `--body`, `--body-file` 존재 (무회귀)
- [ ] `post create testproj --title t --body a --body-file /dev/null` → 에러 메시지 `"함께 사용할 수 없습니다"` 매치
- [ ] `post comment add testproj 1 --body a --body-file /dev/null` → 동일 에러 매치
- [ ] `post edit` / `post comment edit` 동시 지정 호출 → exit code != 0 (resolve 에러가 먼저 나올 수 있어 message grep은 완화)
- [ ] `git status --short` → 이 phase에서는 코드 수정 없음

## 주의사항

- **이 phase는 코드 변경 금지** — 실패 시 phase-01 재개 (`--from-phase 1`)
- smoke 결과는 `grep -c` 로 정수 비교 or `exit code` 확인
- `testproj` 같이 존재하지 않는 프로젝트 코드 사용 — 실제 API 호출이 가능한 환경에서도 안전 (Dooray 권한 범위 내에서 missing 이라 resolve 단계에서 실패)

## Blocked 조건

- `pnpm run build` 실패 → `PHASE_BLOCKED: 빌드 실패 (phase 1 재점검)`
- `post create --help` 또는 `post edit --help`에서 옵션 누락 → `PHASE_BLOCKED: phase 1 옵션 회귀`
- `wiki page create/edit --help`에서 옵션 누락 → `PHASE_BLOCKED: 의도치 않은 wiki 회귀`
- body 가드 smoke에서 `"함께 사용할 수 없습니다"` 누락 → `PHASE_BLOCKED: body-input.ts 에러 메시지 회귀`
