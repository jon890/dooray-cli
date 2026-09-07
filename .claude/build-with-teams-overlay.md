# build-with-teams 오버레이

공용 코어(`~/.claude/skills/build-with-teams`)에 dooray-cli 특화를 주입한다.

## 검증 명령

phase 완료 조건은 `pnpm tsc --noEmit && pnpm run build && pnpm test` 다.
개별 명령의 역할은 `CLAUDE.md` "빌드 & 실행" 이 단일 소스다.

코어가 묻는 항목의 답은 이렇다.

- worktree 를 만든 직후 `pnpm install` 을 실행한다
- 마이그레이션 도구는 없다.
  `~/.dooray/cache/` 파일 기반이므로 스키마 변경은 `src/cache/` 에서 처리한다

## 에이전트 이름

- **executor**: 전용 agent 를 쓰지 않는다.
  공용 코어의 `references/role-executor.md` 가 executor 계약을 소유한다.
  스폰 시 `model` 은 `sonnet` 을 기본으로 넘기고,
  코어 `references/executor-routing.md` 의 규모별 등급 표가 상향 여부를 정한다.
  저장소 고유 지침은 [executor-notes.md](executor-notes.md)를 스폰 프롬프트에 함께 넘긴다.
- **docs-verifier**: `dooray-cli-docs-verifier` (`.claude/agents/dooray-cli-docs-verifier.md`)

docs-verifier 의 동작은 그 파일이 단일 소스다.

## planning 오버레이가 단일 소스인 항목

아래는 `.claude/planning-overlay.md` 가 정하고 이 워크플로가 그대로 따른다.

| 항목 | planning 오버레이의 절 |
| --- | --- |
| 회피 패턴 self-check 경로 | [검증](planning-overlay.md#검증) |

브랜치와 worktree 운용은 아래 절을 따른다.

## 브랜치와 작업 공간

브랜치 이름은 `plan{N}-{종류}-{슬러그}` 형식이다.
예시는 `plan061-feat-wiki-page-move` 다.

작업 공간은 Orca worktree 를 쓴다.
경로는 `worktrees/dooray-cli/{이름}` 아래에 만들고,
저장소의 `.gitignore` 가 그 디렉터리를 무시한다.

worktree 를 만든 직후 `pnpm install` 을 실행한다.
이후 phase 검증 명령은 이 파일의 "검증 명령" 절을 따른다.

task metadata 와 phase 파일 형식은 공용 코어의 `references/task-create.md` 가 소유한다.
이 저장소 고유 변형은 없다.

정리는 PR 머지 뒤에 한다.
먼저 미커밋 변경과 전송하지 않은 커밋을 확인한다.
그다음 worktree 를 제거하고, 머지된 브랜치를 지운다.
`release/*` 브랜치와 미머지 브랜치는 남긴다.

## 개인 식별 정보 노출 금지

phase 완료 전과 PR 생성 전에 `node scripts/check-pii.mjs` 를 실행해 통과시킨다. CI 도 같은 스크립트를 돌린다.

## PR 본문

commit 목록을 나열하지 않는다.
GitHub 의 Commits 탭에 이미 있다.
개요와 결정 근거, 검증 결과만 담는다.
