---
id: dry-run-branch-position-asymmetry
category: code-review
title: 같은 옵션을 두 명령에 추가할 때 dry-run 분기 위치 비대칭
triggers: [dry-run, cc-group, to-group, 출력 범위 비대칭]
tool_catchable: false
source: [CLI21, PR #55]
related: [dry-run-json-quiet-branch-missing]
---

**증상**: 새 옵션 (`--cc-group` / `--to-group` 등) 을 `post edit`, `post create` 양쪽에 추가.
`post edit` 은 dry-run 분기 *이후* 에 cc/to resolve 가 일어나도록 작성돼서 `--dry-run --json` 출력이 `{ body, users: { to, cc } }` 를 포함.
`post create` 는 dry-run 분기가 cc/to resolve *이전* 에 조기 반환되어 `{ body }` 만 출력.
같은 옵션, 같은 `--dry-run --json` 입력에 대해 명령마다 출력 범위 비대칭 → README 가 "포함된다" 로 일괄 서술하면 한 쪽 명령에서 docs↔코드 불일치.

**Good**: phase 작성 시 새 옵션이 두 명령 (`edit`, `create` 등) 에 들어가면:
- 양 명령의 dry-run 분기 라인을 phase 본문에 명시
- "dry-run JSON 출력 범위가 두 명령에서 동일한가" self-check
- 범위 통일이 불가능하면 (예: create 가 신규 자원이라 resolve 비용 회피) README/SKILL.md 에 명령별로 범위를 분리 서술

**검출**: phase diff 에 동일 옵션이 2 개 이상 `commands/post/*.ts` 에 추가됐으면 `grep -nE "opts\.dryRun|JSON\.stringify" <변경 파일들>` 결과 비교.
dry-run 분기 직전 코드에 무엇이 resolve 됐는지 라인 단위로 대조. 비대칭이면 docs 도 두 명령을 분리해서 서술.

**Why**: PR #55 review.
`post edit` 은 dry-run 가드를 cc/to resolve 후에 두는 게 자연스러웠고 (기존 mention/link-task 패턴 그대로 적용), `post create` 는 dry-run 가드가 다른 resolve 보다 위에 있었음.
README 가 "post edit/create 의 --dry-run --json 출력에 users 포함" 으로 일괄 서술 → docs-verifier UPDATE_NEEDED.
CLI13 의 변형 — 같은 옵션 4 명령 dry-run 분기 누락은 CLI13 이 잡고, 같은 옵션 2 명령 dry-run *위치 차이로 출력 범위 비대칭* 은 CLI21.
