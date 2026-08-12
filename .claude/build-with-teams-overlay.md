# build-with-teams 오버레이 — dooray-cli

공용 코어(`~/.claude/skills/build-with-teams`)에 dooray-cli 특화를 주입한다.

## 검증 명령

phase 완료 조건은 `pnpm tsc --noEmit && pnpm run build && pnpm test` 다.
개별 명령의 역할은 `CLAUDE.md` "빌드 & 실행" 이 단일 소스다.

코어가 묻는 항목의 답은 이렇다.

- worktree 를 만든 직후 `pnpm install` 을 실행한다
- 마이그레이션 도구는 없다 — `~/.dooray/cache/` 파일 기반이므로 스키마 변경은 `src/cache/` 에서 처리한다

## 에이전트 이름

- **executor**: `dooray-cli-executor` (`.claude/agents/dooray-cli-executor.md`)
- **docs-verifier**: `dooray-cli-docs-verifier` (`.claude/agents/dooray-cli-docs-verifier.md`)

각 agent 의 동작은 그 파일이 단일 소스다.

## planning 오버레이가 단일 소스인 항목

아래는 `.claude/planning-overlay.md` 가 정하고 이 워크플로가 그대로 따른다.

| 항목 | planning 오버레이의 절 |
| --- | --- |
| `index.json` 스키마와 검증 체크리스트 | "index.json 스키마" |
| task 디렉터리 이름과 번호 부여 | "plan 네이밍" |
| 회피 패턴 self-check 경로 | "검증" |
| docs-first 두 커밋 순서 | "branch / 커밋 / 핸드오프" |

## 개인 식별 정보 노출 금지

phase 완료 전과 PR 생성 전에 `bash scripts/check-pii.sh` 를 실행해 통과시킨다. CI 도 같은 스크립트를 돌린다.

## PR 본문

commit 목록을 나열하지 않는다 — GitHub 의 Commits 탭에 이미 있다.
개요와 결정 근거, 검증 결과만 담는다.
