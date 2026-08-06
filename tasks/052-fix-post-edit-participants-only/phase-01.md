# Phase 01 — 참여자 단독 비대화형 수정과 회귀 테스트

**Execution profile**: standard
**Status**: pending

---

## 목표

GitHub Issue #108을 해결하도록 `post edit`의 참조자·담당자 옵션만 지정한 호출을 비대화형 수정으로 처리하고, 조회한 기존 제목·본문·태그를 보존하는 동작을 회귀 테스트로 고정한다.

**범위 외**: `--mention`, `--mention-group`, `--link-task`, `--parent`의 단독 호출 지원은 포함하지 않는다. 이 옵션들의 기존 경고와 `$EDITOR` 진입 동작을 바꾸지 않는다.

## 선행 조건

현재 작업 브랜치가 `fix/issue-108-post-edit-participants`이고, `docs/adr/025-post-cc-to-member-group.md`에 Issue #108 보강 결정이 있어야 한다.
조건이 다르면 다른 브랜치에 구현하지 말고 `PHASE_BLOCKED: task 052 planning commit is missing from the implementation branch`를 보고한다.

## 작업 항목 (3)

### 1. `src/commands/post/edit.test.ts` — 실패하는 회귀 시나리오 추가

Commander 명령의 외부 경계를 `vi.mock`으로 대체하고 실제 `postEditCommand` 액션을 실행하는 테스트를 추가한다.
동일 모듈을 자체 모킹하지 말고 설정, API 클라이언트, 입력 resolver, 편집기, 스피너만 경계에서 대체한다.

다음 계약을 고정한다.

- `--cc`, `--cc-group`, `--cc-clear`, `--to`, `--to-group`, `--to-clear` 중 하나만 있어도 `openInEditor`를 호출하지 않는다.
- 참여자 추가·초기화 결과가 기존 `resolveUserAdditions`와 `mergeUsers` 정책대로 `updatePost.users`에 반영된다.
- 참여자 옵션만 지정하면 `updatePost.subject`는 조회한 `post.subject`, `updatePost.body.content`는 조회한 `post.body.content`와 같다.
- 조회 fixture에 기존 태그를 두고, 태그 옵션이 없을 때 요청에 `tagIds`가 없는지 검증한다. 기존 서버 보존 의미를 임의의 빈 배열 전송으로 바꾸지 않는다.
- `--cc-group --dry-run --json`도 편집기를 열지 않고 기존 `users` 미리보기 형식을 유지하며 `updatePost`를 호출하지 않는다.

여섯 옵션의 진입 판정은 표 기반 테스트로 모두 덮는다.
명령 액션 통합 테스트가 반복 파싱 상태에 영향받으면 명령 생성 팩터리를 추가하기보다 `vi.resetModules()`와 격리 import를 사용한다.

### 2. `src/commands/post/edit.ts` — 참여자 변경을 비대화형 진입 조건에 포함

정규화된 `ccNames`, `ccGroups`, `toNames`, `toGroups`와 `opts.ccClear`, `opts.toClear`에서 `hasParticipantChange`를 계산한다.
여섯 입력 중 하나라도 있으면 참이 되도록 하고, 기존 `nonInteractive` 조건에 추가한다.

기존 비대화형 분기 안의 다음 계약은 그대로 재사용한다.

- `resolveUserAdditions`와 `mergeUsers`로 참여자를 계산한다.
- 제목 미지정 시 `post.subject`를 사용한다.
- 본문 미지정 시 `post.body.content`를 사용한다.
- 태그 변경이 없으면 `tagIds`를 요청에 추가하지 않는다.
- `--dry-run --json`의 `users: { to, cc }` 형식을 유지한다.

새 resolver, API 메서드, 외부 의존성을 추가하지 않는다.

### 3. `src/commands/post/edit.ts` — 참여자 경고 dead code 제거와 범위 외 동작 보존

대화형 `else` 분기의 참조자·담당자 경고 조건과 문구를 제거한다.
참여자 옵션이 `nonInteractive` 진입 조건이므로 해당 경고는 도달할 수 없고 새 계약과도 반대다.

멘션, 업무 링크, 상위 업무 경고는 남긴다.
태그 단독 호출을 허용하는 기존 `hasTagChange` 조건도 변경하지 않는다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/post/edit.ts` | 수정 — 참여자 변경 판정, 비대화형 진입 조건, 도달 불가능 경고 제거 |
| `src/commands/post/edit.test.ts` | 신규 — 참여자 단독 호출, 보존 필드, 편집기 미호출, 미리보기 회귀 테스트 |

## 검증

```bash
# cwd: repository implementation worktree
test "$(git branch --show-current)" = "fix/issue-108-post-edit-participants"
test -f docs/adr/025-post-cc-to-member-group.md
pnpm exec vitest run src/commands/post/edit.test.ts src/resolvers/post-users.test.ts
pnpm exec tsc --noEmit
pnpm run build
test -z "$(rg -n -- '--cc/--cc-group/--cc-clear/--to/--to-group/--to-clear 는 --title/--body' src/commands/post/edit.ts || true)"
rg -n -- '--mention/--mention-group|--link-task|--parent 는 --title/--body' src/commands/post/edit.ts
```

모든 명령 종료 코드가 0이어야 한다.
마지막 `rg`는 멘션·업무 링크·상위 업무 경고가 남아 있음을 보여야 한다.

## 의도 메모 (왜)

- Issue #108의 우회 호출로 참여자 변경 자체와 제목·본문·태그 보존이 확인되어 있으므로 기존 조회·전체 갱신 경로를 재사용한다.
- task 027의 참여자 병합과 task 033의 태그 단독 비대화형 진입 다음에 적용되는 최종 상태다.
- 최근 `origin/main`의 범위 파일 커밋은 문서 정규화뿐이며, 현재 구현과 충돌하는 후속 코드 변경은 없다.
- 한 명령의 진입 조건과 도달 불가능 경고를 함께 고치는 원자적 수정이므로 별도 task로 나누지 않는다.
