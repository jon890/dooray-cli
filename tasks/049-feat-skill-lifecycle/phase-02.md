# Phase 02 — skill 명령·setup·doctor 통합과 사용자 문서·회귀 검증

**Model**: sonnet
**Status**: completed

---

## 목표

스킬 관리 모듈을 `dooray skill status|install|update`, `dooray setup`, `dooray doctor`에 연결하고 사용자 가이드와 공개 스킬에 실제 명령 계약을 반영한다.

**범위 외**: 관리형 저장소·매니페스트·콘텐츠 해시·이전 버전 정리는 task 050의 책임이다.

---

## 작업 항목 (4)

### 1. `src/commands/skill.ts`·`src/index.ts` — 명령 표면 등록

`skillCommand` 아래 `status`, `install`, `update`를 등록한다.
세 명령 모두 `homedir()`와 빌드된 `__dirname`에서 context를 만들되, manager에는 계산된 값만 전달한다.

`status` 출력 계약:

- 기본: 상태·현재 버전·설치 버전·링크 대상을 stdout에 표시
- `--json`: `SkillStatus` 객체 하나를 JSON으로 출력
- `--quiet`: `SkillStatus.status` 토큰 하나를 출력
- 조회 성공은 상태와 무관하게 종료 코드 0

`install`과 `update`는 동일한 `installSkill`을 호출한다.
`--force` 옵션을 지원하고 unmanaged 대상 거부는 `DoorayCliError`와 `EXIT_PARAM_ERROR`로 종료한다.
JSON·quiet 모드에는 설명 문장을 섞지 않는다.

### 2. `src/commands/setup.ts`·`src/commands/doctor.ts` — 공용 manager 사용

`setup.ts`의 직접 `lstat/rm/symlink` 구현을 제거하고 확인 프롬프트 뒤 `installSkill`을 호출한다.
기존 npx skip 정책은 유지한다.

`doctor.ts`는 `inspectSkill` 결과를 사용한다.
`current`만 초록색, `outdated`·`broken`·`unmanaged`는 경고와 `dooray skill update` 복구 명령을 표시한다.
스킬 경고는 doctor의 API 설정 성공 종료 코드를 바꾸지 않는다.

### 3. `README.md`·`skills/dooray-cli/references/common.md`·`skills/dooray-cli/SKILL.md` — 사용자 가이드

설치 섹션에 `dooray skill status|install|update`와 Node 버전 변경 후 갱신 절차를 추가한다.
공개 문서에 ADR·Issue·task 번호를 넣지 않는다.
router인 `SKILL.md`는 짧은 시작 예시만 고치고 상세 상태 표는 `references/common.md`에 둔다.

### 4. 회귀 검증과 task 완료 처리

단위 테스트, 타입 검사, 전체 테스트, 빌드, 패키지 검증, help·버전 smoke를 실행한다.
검증이 모두 성공한 뒤 `tasks/049-feat-skill-lifecycle/index.json`의 phase 상태, `current_phase`, task `status`, `updated_at`을 completed 상태로 갱신한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/skill.ts` | 신규 — status/install/update |
| `src/index.ts` | 수정 — skill command 등록 |
| `src/commands/setup.ts` | 수정 — manager 위임 |
| `src/commands/doctor.ts` | 수정 — stale 상태 진단 |
| `README.md` | 수정 — 사용자 설치·갱신 흐름 |
| `skills/dooray-cli/references/common.md` | 수정 — 상세 명령·상태 |
| `skills/dooray-cli/SKILL.md` | 수정 — 빠른 시작 |
| `tasks/049-feat-skill-lifecycle/index.json` | 수정 — 완료 상태 |

## 검증

```bash
# cwd: repository implementation worktree
pnpm exec vitest run src/skill/manager.test.ts
pnpm exec tsc --noEmit
pnpm test
pnpm build
pnpm verify:package
node dist/index.js skill --help
node dist/index.js skill status --json
test "$(node dist/index.js --version)" = "$(node -p "require('./package.json').version")"
grep -rnE "ADR-[0-9]+|Issue #[0-9]+|task [0-9]+" README.md skills/dooray-cli/SKILL.md 2>/dev/null && exit 1 || true
```

모든 검증이 종료 코드 0이고 `skill status --json`이 단일 JSON 객체만 stdout에 출력해야 한다.

## 의도 메모 (왜)

- `setup` 재실행 없이 스킬만 복구할 수 있어야 API 자격 증명 설정과 배포 자산 관리가 분리된다.
- task 050은 이 명령과 JSON 필드를 유지하며 저장 구현만 관리형 저장소로 바꾼다.
- plain 상태 경고는 관측 정보이므로 doctor의 기존 API 진단 종료 계약을 바꾸지 않는다.
