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

최신 간결 README에는 여섯 삭제 명령의 개별 예시가 없다.
`## 에이전트 없이 직접 쓰기`에서 출력 모드·`POST_ID` 체이닝 예시가 끝난 직후, `## 프로젝트 구조` 바로 앞에 `### 삭제 명령의 확인` 절을 추가한다.
다음 최소 내용만 담고 다른 명령 카탈로그를 README로 되돌리지 않는다.

- 업무 영역과 위키 영역의 2행 표로 여섯 명령을 빠짐없이 열거한다.
  표 머리글은 `영역`과 `삭제 명령`을 쓰고, 각 셀에서 명령을 `<br>`로 나눈다.
  - 업무 셀: `dooray post comment delete`<br>`dooray post file delete`<br>`dooray post comment file delete`
  - 위키 셀: `dooray wiki page delete`<br>`dooray wiki page file delete`<br>`dooray wiki page comment delete`
- 여섯 명령 모두 TTY에서 기본값이 아니오인 `y/N` 확인을 표시한다.
- 자동화·파이프·다른 non-TTY 실행은 `-y` 또는 `--yes`로 확인을 생략한다.
- 플래그 없는 non-TTY 실행은 삭제 API를 호출하기 전에 종료 코드 3으로 끝난다.
- 기존 삭제 자동화는 명시적 yes 플래그를 추가해야 한다는 호환성 문장을 한 줄 둔다.

README의 나머지 구조와 기존 plain·`--json`·`--quiet` 설명은 유지한다.

### 2. `skills/dooray-cli/SKILL.md`·`references/` — 공통 계약과 도메인 안내 동기화

다음 위치를 함께 갱신한다.

- `skills/dooray-cli/SKILL.md`
  - `## 삭제 명령의 확인 동작` 도입문과 표를 여섯 명령 모두 `확인 있음`, `-y`/`--yes`로 통일한다.
  - 표 아래에 TTY 기본 아니오, non-TTY 무플래그 API 전 종료 코드 3, 자동화의 yes 플래그 필수 규칙을 쓴다.
  - `## 어느 reference 를 읽을지`의 post 행에 삭제를 추가하고, 의도별 빠른 참조의 네 `즉시 삭제` 설명과 두 `--yes` 전용 설명을 모두 공통 정책 문구로 바꾼다.
- `skills/dooray-cli/references/post.md`
  - `## URL 이나 --id 모드에서는 sub-id를 옵션으로 준다` 절 뒤, `## 업무 생성` 앞에 `## 삭제 안전 확인` 절을 추가한다.
  - 업무의 세 삭제 명령을 열거하고 공통 정책 상세는 `[SKILL.md](../SKILL.md#삭제-명령의-확인-동작)`를 따르도록 연결한다.
- `skills/dooray-cli/references/wiki.md`
  - 기존 `## 페이지 삭제` 바로 앞에 `## 삭제 안전 확인` 절을 추가한다.
  - 위키의 세 삭제 명령을 열거하고 `[SKILL.md](../SKILL.md#삭제-명령의-확인-동작)`로 연결한다. 기존 비공식 페이지 삭제 endpoint·하위 페이지 재부착 설명은 그대로 둔다.
- `skills/dooray-cli/references/common.md`
  - `## 에러 핸들링` 표에 non-TTY 삭제에서 yes 플래그가 없을 때 종료 코드 3으로 중단되는 사례와 `-y`/`--yes` 재실행 방법을 한 행 추가한다.

README와 공개 SKILL·references에는 ADR, Issue, task 번호를 넣지 않는다.

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

코드·공개 문서·식별정보 검증이 모두 성공한 뒤에만 `tasks/053-fix-delete-confirmation-policy/index.json`을 다음 상태로 갱신한다.

- task `status`: `completed`
- `current_phase`: `2`
- 두 phase의 `status`: `completed`
- `updated_at`: 실제 완료 UTC 시각
- `error_message`와 `blocked_reason`: `null` 유지

마킹 직후 아래 `jq -e` 검사를 실행한다.
성공하기 전에는 완료 커밋을 만들지 않는다.

```bash
# cwd: repository implementation worktree
jq -e '
  .status == "completed" and
  .current_phase == .total_phases and
  .total_phases == 2 and
  (.phases | length) == 2 and
  ([.phases[].number] == [1, 2]) and
  ([.phases[].status] | all(. == "completed")) and
  ((.updated_at | fromdateiso8601) > (.created_at | fromdateiso8601)) and
  .error_message == null and
  .blocked_reason == null
' tasks/053-fix-delete-confirmation-policy/index.json
```

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `README.md` | 수정 — 삭제 확인·자동화 마이그레이션 안내 |
| `skills/dooray-cli/SKILL.md` | 수정 — 여섯 명령 확인 표·빠른 참조 |
| `skills/dooray-cli/references/post.md` | 수정 — 업무 삭제 공통 정책 연결 |
| `skills/dooray-cli/references/wiki.md` | 수정 — 위키 삭제 공통 정책 연결 |
| `skills/dooray-cli/references/common.md` | 수정 — non-TTY 종료 코드 3 복구 안내 |
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

완료 순서는 다음과 같다.

1. 정책 테스트, 타입 검사, 전체 테스트, 빌드, 패키지 검증, 여섯 도움말, 공개 문서 내부 참조, 개인 식별 정보, `git diff --check`를 실행한다.
2. 1번이 모두 통과한 뒤에만 `index.json`을 completed 상태로 마킹한다.
3. 마킹 직후 작업 항목 4의 `jq -e`로 task·phase 최종 상태를 검사한다.
4. `git diff --check`를 한 번 더 실행한다.
5. `jq -e`와 최종 diff 검사가 모두 성공하면 구현·공개 문서·완료 마킹을 같은 커밋에 포함한다.

## 의도 메모 (왜)

- 공개 문서는 실제 옵션과 도움말이 확정된 뒤 갱신해 문서와 코드의 차이를 막는다.
- README는 최신 간결 구조를 유지하고 삭제 안전 계약만 한 절로 추가한다.
- 공통 표와 post·wiki·오류 reference를 함께 갱신해 에이전트가 읽는 경로에 따라 정책이 달라지지 않게 한다.
- 도움말을 여섯 경로 모두 빌드 산출물에서 검사해 Commander 옵션 등록 누락을 잡는다.
- 기존 자동화의 호환성 변화는 숨기지 않고 yes 플래그 추가 방법을 명시한다.
