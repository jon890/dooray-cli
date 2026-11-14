# dooray-cli review-fix 오버레이

`review-fix` 스킬에 dooray-cli 고유 지식을 더한다.
빌드/테스트/커밋 컨벤션은 `CLAUDE.md` 를 따르므로 여기서 반복하지 않는다.

## 머지 정책

이 repo 는 PR 머지 시 **Merge commit** 을 쓴다. `git log --merges` 로 확인했고 squash 가 아니다.
conflict 해결 시 코어의 "merge 또는 rebase" 분기에서 **`git merge origin/<base>` 를 사용**한다 (rebase 아님, force-push 불필요).

## CI 실패 흔한 원인 → 해결 매핑

`.github/workflows/ci.yml` 은 의존성 설치보다 먼저 저장소 검사 단계를 돌린다.
그 단계가 먼저 걸리므로 로그를 위에서부터 읽는다.

| 증상 (로그 키워드) | 원인 | 해결 |
| --- | --- | --- |
| `Check for exposed identifiers` 단계 실패 | 추적 파일에 개인 식별 정보나 사내 식별자가 들어갔다 | 출력이 가리킨 줄을 `CLAUDE.md` 의 대체 표대로 placeholder 로 바꾼다 |
| `Check public docs for internal references` 단계 실패 | `README.md` 나 `skills/` 에 `ADR-NNN` 같은 내부 추적 번호가 들어갔다 | 번호를 빼고 문장을 다시 쓴다 |
| `Verify package artifact` 단계 실패 | 빌드 산출물이나 `package.json` 의 `files` 가 배포 조건을 어겼다 | `pnpm verify:package` 를 로컬에서 돌려 같은 출력을 재현한다 |
| `does not provide an export named 'styleText'` / `node:util` | CI 의 Node 가 의존성이 요구하는 버전보다 낮다 | `.github/workflows/ci.yml` 의 `NODE_VERSION` 과 `package.json` 의 `engines.node` 를 대조해 올린다. 두 값이 현재 기준이다 |
| `SyntaxError: Unexpected token` 빌드 단계 | tsup target 불일치 또는 Node 버전 mismatch | 위 styleText 건과 동일 원인 — Node 버전 점검 |
| 타입 에러 | dooray-cli 에 별도 lint 단계는 없다. 빌드는 tsup(esbuild) 이라 타입을 보지 않는다 | `pnpm tsc --noEmit` 으로 잡는다. `pnpm run build` 는 타입 오류가 있어도 통과한다 |

표에 없는 증상은 사용자에게 "CI 로그 일부와 의심 원인" 을 제시하고 진행 방향을 확인한다.

## 학습 반영 위치

재현 가능한 code-review 패턴은 `docs/pitfalls/` 에 새 파일을 더하지 않는다. 그 목록은 읽기 전용이다.
검사기, 테스트, 지침(`CLAUDE.md`) 같은 규칙 자리로 옮긴다.

- 규칙으로 막을 수 있는지 먼저 본다. 막을 수 없는 것만 지침에 문장으로 둔다.
- 도메인 의사결정(ADR 급)은 `docs/adr/` 신규 ADR — `docs/adr/INDEX.md` 에도 행을 추가한다.
