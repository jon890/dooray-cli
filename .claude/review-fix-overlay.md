# review-fix 오버레이 — dooray-cli

`~/.claude/skills/review-fix` 공용 코어에 dooray-cli 고유 지식을 더한다.
빌드/테스트/커밋 컨벤션은 `CLAUDE.md` 를 따르므로 여기서 반복하지 않는다.

## 머지 정책 — Merge commit

이 repo 는 PR 머지 시 **Merge commit** 을 쓴다 (`git log --merges` 실측 — squash 아님).
conflict 해결 시 코어의 "merge 또는 rebase" 분기에서 **`git merge origin/<base>` 를 사용**한다 (rebase 아님, force-push 불필요).

## CI 실패 흔한 원인 → 해결 매핑

| 증상 (로그 키워드) | 원인 | 해결 |
| --- | --- | --- |
| `does not provide an export named 'styleText'` / `node:util` | CI 의 Node 가 의존성이 요구하는 버전보다 낮다 | `.github/workflows/ci.yml` 의 `NODE_VERSION` 과 `package.json` 의 `engines.node` 를 대조해 올린다. 두 값이 현재 기준이다 |
| `ERR_PNPM_OUTDATED_LOCKFILE` / `frozen-lockfile` 실패 | 로컬에서 의존성 변경 후 lockfile 미커밋 | 로컬 `pnpm install` 후 `pnpm-lock.yaml` 같이 커밋 |
| `Cannot find module 'X'` | 새 import 추가했는데 의존성 미설치 / package.json 미커밋 | `pnpm add X` 를 실행하고 `package.json` 과 lockfile 을 같이 커밋 |
| `SyntaxError: Unexpected token` 빌드 단계 | tsup target 불일치 또는 Node 버전 mismatch | 위 styleText 건과 동일 원인 — Node 버전 점검 |
| `Test Files X failed` / vitest assertion | 테스트 회귀 | 실패 테스트 파일 직접 읽고 픽스 |
| 타입 에러 | dooray-cli 에 별도 lint 단계는 없다. 빌드는 tsup(esbuild) 이라 타입을 보지 않는다 | `pnpm tsc --noEmit` 으로 잡는다. `pnpm run build` 는 타입 오류가 있어도 통과한다 |

표에 없는 증상은 사용자에게 "CI 로그 일부와 의심 원인" 을 제시하고 진행 방향을 확인한다.

## 학습 누적 위치

재현 가능한 code-review 패턴은 `docs/pitfalls/code-review/` 에 새 파일 1개로 누적한다.

- 형식·통과 조건 기준(재발성·심각도·도구로 못 잡음·추상화 가능)은 `docs/pitfalls/INDEX.md` 를 따른다.
- 도메인 의사결정(ADR 급)은 `docs/adr/` 신규 ADR — `docs/adr/INDEX.md` 에도 행을 추가한다.
