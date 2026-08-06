# Phase 02 — 공개 사용 문서와 통합 검증

**Execution profile**: standard
**Status**: pending

---

## 목표

참여자 옵션 단독 호출 계약을 공개 사용 문서에 반영하고 저장소 검증을 마친 뒤 task 상태를 완료로 기록한다.

**범위 외**: 멘션·업무 링크·상위 업무 단독 호출 예시나 동작은 변경하지 않는다. 내부 추적 번호는 공개 문서에 넣지 않는다.

## 선행 조건

Phase 01의 `src/commands/post/edit.test.ts`가 통과하고, 참여자 경고가 `src/commands/post/edit.ts`에서 제거되어 있어야 한다.
조건이 맞지 않으면 문서만 앞서 고치지 말고 `PHASE_BLOCKED: phase 01 participant-only behavior is not verified`를 보고한다.

## 작업 항목 (3)

### 1. `README.md` — 참여자 옵션 단독 호출 계약 정정

참조자·담당자 변경 섹션에서 여섯 옵션이 `$EDITOR` 모드에서 무시된다는 기존 문장을 제거한다.
제목·본문 없이 단독 호출할 수 있고 기존 제목·본문·태그를 보존한다는 설명으로 바꾼다.
기존 `--dry-run --json`의 `users` 미리보기 예시는 유지한다.

### 2. `skills/dooray-cli/SKILL.md`·`skills/dooray-cli/references/post.md` — 에이전트 사용 안내 동기화

빠른 참조의 참여자 변경 명령이 제목·본문 없이 유효함을 명시한다.
`references/post.md`의 대화형 무시 경고를 제거하고 기존 제목·본문·태그 보존 계약을 적는다.
공개 문서에는 `ADR-NNN`, `Issue #NN`, `task NNN` 형식의 내부 추적 번호를 추가하지 않는다.

### 3. `tasks/052-fix-post-edit-participants-only/index.json` — 완료 마킹

모든 검증이 통과한 뒤에만 다음 상태를 기록한다.

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

```bash
# cwd: repository implementation worktree
pnpm test
pnpm exec tsc --noEmit
pnpm run build
test -z "$(rg -n -- 'interactive \(\$EDITOR\) 모드에서는 위 6개 옵션|\$EDITOR 로 여는 interactive 모드에서는 이 옵션들이 무시' README.md skills/dooray-cli || true)"
grep -rnE "ADR-[0-9]+|Issue #[0-9]+|task [0-9]+" README.md skills/ 2>/dev/null && exit 1 || true
node -e 'const fs=require("node:fs"); const p="tasks/052-fix-post-edit-participants-only/index.json"; const d=JSON.parse(fs.readFileSync(p,"utf8")); if(d.status!=="completed"||d.current_phase!==2||d.total_phases!==2||d.phases.some((x,i)=>x.number!==i+1||x.status!=="completed"||!fs.existsSync(`tasks/052-fix-post-edit-participants-only/${x.file}`))) process.exit(1)'
```

모든 명령 종료 코드가 0이어야 한다.

## 의도 메모 (왜)

- 관리 문서의 결정은 planning 커밋에 이미 반영되어 있으므로 이 phase에서는 코드 산출물에 의존하는 공개 사용 문서만 갱신한다.
- 참여자 옵션만 비대화형 진입 조건에 추가되므로 멘션·업무 링크·상위 업무 문서는 그대로 둔다.
- 전체 테스트, 타입 검사, 빌드를 함께 실행해 명령 분기 변경의 저장소 수준 회귀를 확인한다.
