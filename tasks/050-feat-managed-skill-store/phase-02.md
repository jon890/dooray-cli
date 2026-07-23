# Phase 02 — 레거시 마이그레이션·명령 통합과 최종 회귀 검증

**Model**: sonnet
**Status**: pending

---

## 목표

`dooray skill install|update`가 관리형 저장소를 준비한 뒤 Claude Code 활성 링크를 원자적으로 전환하게 하고, 레거시 npm 패키지 링크를 안전하게 마이그레이션한다.

**범위 외**: 저장소 자동 정리, rollback 명령, npm lifecycle script는 포함하지 않는다.

---

## 작업 항목 (4)

### 1. `src/skill/manager.ts` — 최종 상태 전이와 활성 링크 교체

task 049의 `SkillStatus` JSON 필드와 함수 시그니처를 유지한다.

| 입력 | 최종 상태 | 기본 install/update |
|---|---|---|
| managed store와 version+digest 일치 | `current` | 무변경 |
| npm 패키지 직접 링크 또는 이전 store | `outdated` | 새 store 준비 후 전환 |
| managed store 실제 해시 불일치 | `modified` | 종료 코드 3, `--force`만 백업 후 전환 |
| manifest 누락·형식 오류·경로와 digest 불일치 | `corrupt` | 종료 코드 3, `--force`만 백업 후 전환 |
| managed 링크 대상 없음 | `broken` | 새 store 준비 후 전환 |
| 일반 파일·디렉터리·알 수 없는 링크 | `unmanaged` | 종료 코드 3, `--force`만 백업 후 전환 |

새 store를 완성한 뒤 destination과 같은 디렉터리에 임시 심볼릭 링크를 만들고 `rename`으로 활성화한다.
force 백업·실패 복구는 task 049 계약을 그대로 사용한다.
store 준비 실패 시 기존 활성 링크를 건드리지 않는다.

### 2. `src/commands/skill.ts`·`src/commands/setup.ts`·`src/commands/doctor.ts` — 최종 상태 표시

명령 이름과 JSON 필드를 변경하지 않는다.
`status`는 managed store의 manifest 버전·digest와 현재 package source digest를 표시 가능한 내부 상태로 판정한다.
plain doctor는 `current`만 성공, `outdated`·`modified`·`corrupt`·`broken`·`unmanaged`에 원인과 `dooray skill update` 또는 `--force` 복구 힌트를 출력하되 doctor 종료 코드는 바꾸지 않는다.

### 3. `README.md`·`skills/dooray-cli/references/common.md`·`skills/dooray-cli/SKILL.md` — 최종 설치 모델 문서화

Node 버전 경로가 바뀌어도 관리 저장소 링크가 유지되는 점, npm 갱신 후 명시적 `dooray skill update`가 필요한 점, `--force`가 기존 항목을 백업한다는 점을 문서화한다.
공개 문서에는 내부 ADR·Issue·task 번호를 넣지 않는다.

### 4. 회귀 검증과 task 완료 처리

단위 테스트, 타입 검사, 전체 테스트, 빌드, 패키지 검증을 수행한다.
임시 `homeDir`·`dataRoot`를 사용하는 통합 테스트 또는 테스트 전용 실행 경로로 install→status current→source 변경 시 outdated→update current 흐름을 검증한다.
운영 `~/.claude/skills`는 테스트에서 수정하지 않는다.

검증이 모두 성공한 뒤 `tasks/050-feat-managed-skill-store/index.json`의 phase 상태, `current_phase`, task `status`, `updated_at`을 completed 상태로 갱신한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/skill/manager.ts` | 수정 — final status·atomic activation |
| `src/skill/manager.test.ts` | 수정 — migration·rollback 상태 전이 |
| `src/commands/skill.ts` | 수정 — 관리형 store 결과 출력 |
| `src/commands/setup.ts` | 수정 — 관리형 install 위임 유지 |
| `src/commands/doctor.ts` | 수정 — modified/corrupt 경고 |
| `README.md` | 수정 — 관리형 설치 안내 |
| `skills/dooray-cli/references/common.md` | 수정 — 상세 상태·복구 |
| `skills/dooray-cli/SKILL.md` | 수정 — 빠른 시작 |
| `tasks/050-feat-managed-skill-store/index.json` | 수정 — 완료 상태 |

## 검증

```bash
# cwd: repository implementation worktree
pnpm exec vitest run src/skill/manifest.test.ts src/skill/manager.test.ts
pnpm exec tsc --noEmit
pnpm test
pnpm build
pnpm verify:package
node dist/index.js skill --help
grep -rnE "ADR-[0-9]+|Issue #[0-9]+|task [0-9]+" README.md skills/dooray-cli/SKILL.md 2>/dev/null && exit 1 || true
git diff --check
```

모든 검증이 종료 코드 0이어야 한다.

## 의도 메모 (왜)

- 기존 CLI 표면을 보존해 task 049 사용자와 스크립트를 깨지 않는다.
- store 준비와 활성 링크 전환을 분리해 중간 상태를 Claude Code에 노출하지 않는다.
- 자동 삭제·rollback은 보존 기간과 사용자 기대 결정이 필요하므로 별도 범위로 남긴다.
