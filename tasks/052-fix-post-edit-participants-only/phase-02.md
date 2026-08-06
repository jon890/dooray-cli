# Phase 02 — 공개 사용 문서와 통합 검증

**Execution profile**: standard
**Status**: completed

---

## 목표

참여자 옵션 단독 호출 계약을 공개 사용 문서에 반영하고 저장소 검증을 마친 뒤 task 상태를 완료로 기록한다.

**범위 외**: 멘션·업무 링크·상위 업무 단독 호출 예시나 동작은 변경하지 않는다. 내부 추적 번호는 공개 문서에 넣지 않는다.

## 선행 조건

Phase 01의 `src/commands/post/edit.test.ts`가 통과하고, 참여자 경고가 `src/commands/post/edit.ts`에서 제거되어 있어야 한다.
조건이 맞지 않으면 문서만 앞서 고치지 말고 `PHASE_BLOCKED: phase 01 participant-only behavior is not verified`를 보고한다.

## 작업 항목 (3)

### 1. `README.md` — 간결한 사용법에 참여자 단독 수정 계약 추가

`## 에이전트 없이 직접 쓰기`의 첫 명령 예시 코드 블록 직후이자 `전체 명령과 옵션은 --help로 본다` 문장 직전에만 추가한다.
새 소제목이나 긴 옵션 목록은 만들지 않는다.

다음 예시 1줄을 추가한다.

```text
dooray post edit <project> 42 --cc-group <group-code>  # 제목·본문 없이 참조자 그룹 추가
```

예시 바로 아래에 “참조자·담당자 옵션만 지정하면 `$EDITOR`를 열지 않고 기존 제목·본문·태그를 보존한 채 참여자만 바꾼다”는 계약을 1문장으로 설명한다.

### 2. `skills/dooray-cli/SKILL.md`·`skills/dooray-cli/references/post.md` — 에이전트 사용 안내 동기화

`SKILL.md`의 `## 업무 메타 변경` 표 바로 아래에 참여자 변경 명령이 제목·본문 옵션 없이 실행되고 기존 제목·본문·태그를 보존한다는 1문장을 둔다.
`references/post.md`의 `## 참조자와 담당자 변경`에서 대화형 무시 경고를 같은 계약 문장으로 교체한다.
README·빠른 참조·상세 문서 세 곳은 “제목·본문 옵션 불필요”, “`$EDITOR` 미실행”, “기존 제목·본문·태그 보존”이라는 동일한 세 사실을 유지한다.
공개 문서에는 `ADR-NNN`, `Issue #NN`, `task NNN` 형식의 내부 추적 번호를 추가하지 않는다.

### 3. `tasks/052-fix-post-edit-participants-only/index.json` — 완료 마킹

아래 “완료 전 품질 검증”이 모두 통과한 뒤에만 다음 상태를 기록한다.

- task `status`: `completed`
- task `current_phase`: `2`
- phase 1·2 `status`: 모두 `completed`
- task `updated_at`: 실제 완료 시각의 ISO 8601 UTC 값
- `error_message`, `blocked_reason`: `null` 유지

## Critical Files

| 파일 | 변경 |
|---|---|
| `README.md` | 수정 — 참여자 단독 호출과 보존 동작 안내 |
| `skills/dooray-cli/SKILL.md` | 수정 — 빠른 참조 설명 보강 |
| `skills/dooray-cli/references/post.md` | 수정 — 오래된 대화형 경고 교체 |
| `tasks/052-fix-post-edit-participants-only/index.json` | 수정 — task·phase 완료 상태 |

## 검증

### 완료 전 품질 검증

```bash
# cwd: repository implementation worktree
pnpm test
pnpm exec tsc --noEmit
pnpm run build
git diff --check
test -z "$(rg -n -- 'interactive \(\$EDITOR\) 모드에서는 위 6개 옵션|\$EDITOR 로 여는 interactive 모드에서는 이 옵션들이 무시' README.md skills/dooray-cli || true)"
rg -n -F 'dooray post edit <project> 42 --cc-group <group-code>' README.md
for doc_file in README.md skills/dooray-cli/SKILL.md skills/dooray-cli/references/post.md; do rg -q -F '기존 제목·본문·태그' "$doc_file"; done
grep -rnE "ADR-[0-9]+|Issue #[0-9]+|task [0-9]+" README.md skills/ 2>/dev/null && exit 1 || true
```

모든 명령 종료 코드가 0이어야 한다.
하나라도 실패하면 `index.json`은 `pending` 상태로 남기고 원인을 수정한 뒤 이 묶음을 처음부터 다시 실행한다.

### 완료 마킹

완료 전 품질 검증이 통과한 다음 작업 항목 3의 값으로 `index.json`을 갱신한다.
이 상태 변경은 같은 구현 PR의 마지막 커밋에 README와 스킬 문서 변경과 함께 포함한다.

### 완료 후 상태 확인

```bash
# cwd: repository implementation worktree
node -e 'const fs=require("node:fs"); const p="tasks/052-fix-post-edit-participants-only/index.json"; const d=JSON.parse(fs.readFileSync(p,"utf8")); if(d.status!=="completed"||d.current_phase!==2||d.total_phases!==2||d.phases.some((x,i)=>x.number!==i+1||x.status!=="completed"||!fs.existsSync(`tasks/052-fix-post-edit-participants-only/${x.file}`))) process.exit(1)'
```

이 명령은 완료 전 품질 검증이 아니라 완료 마킹의 사후 조건만 확인한다.
실패하면 완료 상태 기록을 바로잡고 다시 실행한다.

## 의도 메모 (왜)

- 관리 문서의 결정은 planning 커밋에 이미 반영되어 있으므로 이 phase에서는 코드 산출물에 의존하는 공개 사용 문서만 갱신한다.
- README는 간결한 명령 카탈로그를 유지하면서 사용자가 직접 호출할 때 필요한 참여자 단독 수정 계약만 복원한다.
- 참여자 옵션만 비대화형 진입 조건에 추가되므로 멘션·업무 링크·상위 업무 문서는 그대로 둔다.
- 전체 테스트, 타입 검사, 빌드를 함께 실행해 명령 분기 변경의 저장소 수준 회귀를 확인한다.
