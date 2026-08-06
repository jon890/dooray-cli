# Phase 02 — 공개 사용법 갱신과 통합 검증

**Model**: sonnet
**Status**: pending

---

## 목표

여섯 삭제 명령의 통일된 확인 정책을 공개 사용자 문서에 반영하고, 전체 회귀 검증으로 구현을 마감한다.

**범위 외**: 새 명령·옵션 추가, 삭제 성공 출력 변경, planning 결정 문서 재작성은 포함하지 않는다.

---

## 작업 항목 (4)

### 1. `README.md` — 삭제 예시와 자동화 마이그레이션 안내

여섯 삭제 명령 예시를 모두 찾아 다음 내용을 일관되게 반영한다.

- 기본 실행은 TTY에서 `y/N` 확인
- 자동화와 non-TTY 실행은 `-y` 또는 `--yes` 필수
- 무플래그 non-TTY 실행은 삭제 API 전에 종료 코드 3
- 기존에 즉시 삭제되던 네 명령을 호출하는 스크립트는 `-y` 또는 `--yes`를 추가해야 함

기존 plain·`--json`·`--quiet` 성공 출력 예시는 유지한다.

### 2. `skills/dooray-cli/SKILL.md` — 확인 동작 표와 빠른 참조 갱신

"삭제 명령의 확인 동작" 표에서 여섯 명령을 모두 `확인 있음`, `-y`/`--yes`로 통일한다.
각 빠른 참조 행의 즉시 삭제 설명을 제거하고 자동화에서는 yes 플래그가 필요하다고 명시한다.
에이전트가 non-TTY에서 삭제를 수행할 때 명시적 yes 플래그를 붙이는 규칙을 추가한다.

README와 공개 SKILL에는 ADR, Issue, task 번호를 넣지 않는다.

### 3. 전체 검증과 도움말 계약 확인

정책 단위·명령 경계 테스트를 먼저 실행한 뒤 타입 검사, 전체 테스트, 빌드, 패키지 검증을 실행한다.
빌드된 CLI의 다음 여섯 도움말에서 `-y, --yes`가 각각 정확히 한 번 노출되는지 확인한다.

- `post file delete`
- `post comment delete`
- `post comment file delete`
- `wiki page delete`
- `wiki page file delete`
- `wiki page comment delete`

실제 삭제 API는 호출하지 않는다.

### 4. task 완료 상태 갱신

검증이 모두 성공한 뒤 `tasks/053-fix-delete-confirmation-policy/index.json`을 다음 상태로 갱신하고 같은 구현 커밋에 포함한다.

- task `status`: `completed`
- `current_phase`: `2`
- 두 phase의 `status`: `completed`
- `updated_at`: 실제 완료 UTC 시각
- `error_message`와 `blocked_reason`: `null` 유지

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `README.md` | 수정 — 삭제 확인·자동화 마이그레이션 안내 |
| `skills/dooray-cli/SKILL.md` | 수정 — 여섯 명령 확인 표·빠른 참조 |
| `tasks/053-fix-delete-confirmation-policy/index.json` | 수정 — 완료 상태 |

## 검증

```bash
# cwd: repository implementation worktree
pnpm exec vitest run src/utils/delete-confirmation.test.ts src/commands/delete-confirmation-policy.test.ts
pnpm exec tsc --noEmit
pnpm test
pnpm build
pnpm verify:package

test "$(node dist/index.js post file delete --help | grep -c -- "-y, --yes")" -eq 1
test "$(node dist/index.js post comment delete --help | grep -c -- "-y, --yes")" -eq 1
test "$(node dist/index.js post comment file delete --help | grep -c -- "-y, --yes")" -eq 1
test "$(node dist/index.js wiki page delete --help | grep -c -- "-y, --yes")" -eq 1
test "$(node dist/index.js wiki page file delete --help | grep -c -- "-y, --yes")" -eq 1
test "$(node dist/index.js wiki page comment delete --help | grep -c -- "-y, --yes")" -eq 1

grep -rnE "ADR-[0-9]+|Issue #[0-9]+|task [0-9]+" README.md skills/ 2>/dev/null && exit 1 || true
git diff --check
```

모든 명령의 종료 코드가 0이어야 한다.
공개 문서 내부 참조 grep은 출력이 0줄이어야 한다.

개인 식별 정보 검사는 `CLAUDE.md`의 `SCAN` 배열, `OK_IDS`, 세 검증 명령을 그대로 실행한다.
첫 두 검사는 출력이 0줄이어야 하고, 프로젝트 예시 추출 결과는 허용 목록인 `my-project`, `testproj`, `NONEXIST`, `body`, `https`, `meta`만 포함해야 한다.

## 의도 메모 (왜)

- 공개 문서는 실제 옵션과 도움말이 확정된 뒤 갱신해 문서와 코드의 차이를 막는다.
- 도움말을 여섯 경로 모두 빌드 산출물에서 검사해 Commander 옵션 등록 누락을 잡는다.
- 기존 자동화의 호환성 변화는 숨기지 않고 yes 플래그 추가 방법을 명시한다.
