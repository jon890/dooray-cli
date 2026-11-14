# dooray-cli implementation 오버레이

`implementation` 스킬에 dooray-cli 특화를 주입한다.

## 검증 명령

phase 완료 조건은 `pnpm tsc --noEmit && pnpm run build && pnpm test` 다.
개별 명령의 역할은 `CLAUDE.md` "빌드 & 실행" 이 단일 소스다.

worktree 를 만든 직후 `pnpm install` 을 실행한다.

## executor

저장소 고유 지침은 [executor-notes.md](executor-notes.md)를 스폰 프롬프트에 함께 넘긴다.

## 작업 공간

작업 공간은 Orca worktree 를 쓴다.
경로는 `worktrees/dooray-cli/{이름}` 아래에 만들고,
저장소의 `.gitignore` 가 그 디렉터리를 무시한다.

## 개인 식별 정보 노출 금지

phase 완료 전과 PR 생성 전에 `node scripts/check-pii.mjs` 와 `node scripts/check-public-refs.mjs` 를 실행해 통과시킨다.
