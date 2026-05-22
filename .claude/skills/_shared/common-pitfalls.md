# Common Pitfalls

skills 가 공유하는 사고 / 실수 회피 패턴. 카테고리별로 호출 시점이 다르므로 필요한 섹션만 grep 해서 참조.

| 섹션 | 카테고리 | 호출 시점 | 사용 스킬 |
|---|---|---|---|
| 1 | plan 작성 (critic 회피) | task 파일 작성 직후 self-check | `planning`, `build-with-teams` |
| 2 | team 운영 | 팀원 스폰 / 메시지 / 브랜치 작업 시 | `build-with-teams` |
| 3 | PR review 학습 (코드 패턴 함정) | 리뷰 댓글 처리 후 누적 | `review-fix` |
| 4 | 레포별 +α (dooray-cli) | task 도메인 코드 작성 시 | `planning`, `build-with-teams` |

**관련 docs**:
- [`code-review-pitfalls.md`](./code-review-pitfalls.md) — build-with-teams code-reviewer 회피 패턴. 본 docs 가 *plan 작성 회피* 라면 거긴 *코드 작성 회피*. 호출 시점이 다르므로 분리 유지.

## 축적 규칙

- 새로운 사고 타입 발견 시 해당 섹션에 **패턴 한 줄 + 실측 명령 + self-check** 추가
- 같은 사고 재발 시 패턴 강화 (예시 / 체크 엄격화)
- "왜 이 가드가 필요한지" 1줄 단서는 반드시 — 미래 AI 가 의도 모르고 우회하지 않도록
- 사고 사례 (plan###) 는 1개로 충분, 복수 나열 금지

---

# 1. plan 작성 (critic 회피)

`/planning` 또는 `build-with-teams` 가 task 파일 작성 시 self-check. 이 섹션의 모든 항목을 plan 생성 **전에 소진** 하면 critic 이 1-shot APPROVE 할 확률이 높다.

## 1-1. 수치 추측 (파일 수 / 줄 수)

**증상**: "약 30개 파일", "100줄 줄어듦" 같은 수치를 실측 없이 적음.
**왜**: critic 이 가장 먼저 검증하는 것은 phase 약속 수치 ↔ 실제 코드 일치 여부. 추측은 즉시 REVISE 사유.

```bash
git diff <base>..<target> --stat | tail -5
git diff <base>..<target> --name-only | wc -l
```

**Self-check**: 모든 수치가 실측 명령 결과? 명령 자체가 plan 에 인용되어 있는가?

## 1-2. 파일 범위 부정확

**증상**: "commands 전체 수정" — "전체" 표현은 critic 이 추적 불가.
**왜**: 누락된 파일이 conflict 진앙이 되면 executor 가 헤맨다.

```bash
git diff <base>..<target> --name-only -- <scope-dir>/
```

**Self-check**: 파일 목록을 plan 에 전부 나열했고, 각 파일 처리 원칙이 서술됐는가? 디렉터리 단위 정리 task (docs 일괄 backfill / lint 전 적용 등) 는 `ls <dir>/*.md` 결과를 plan 본문에 직접 인용하여 큰 파일 누락 회피 (plan034 PR #69 — `docs/guide-mvp-with-ai-agent.md` 878줄 누락이 critic REVISE 사유).

## 1-3. 이전 plan / main 커밋과의 상호작용 누락

**증상**: 이번 plan 이 다른 최근 plan 산출물과 충돌하는데 본문에 그 관계 미서술.
**왜**: executor 가 rebase 중 "어느 쪽이 final state 인가" 모르고 잘못된 방향으로 병합.

```bash
git log origin/main --oneline -20 -- <scope-dir>/
ls -dt tasks/*/ | head -5
```

**Self-check**: 최근 10개 커밋 중 plan 범위 파일을 건드린 게 있는가? 있으면 "어느 쪽이 final" 명시?

## 1-4. 실행 컨텍스트 모호 (cwd / branch)

**증상**: Bash 블록에 `cd` 없거나 "메인 디렉터리에서" 같은 애매한 서술.
**왜**: worktree 에서 main repo 로 잘못 커밋이 박히면 force-push 로 PR 에 섞임.

**규칙**: 모든 Bash 블록 위에 `# cwd: {절대경로}` 주석 + 브랜치 의존 시 `# branch: {expected}`.

**Self-check**: 모든 Bash 블록이 실행 위치 명시? worktree 사용 plan 이면 main vs worktree 구분 명확?

## 1-5. "눈으로 확인" 검증

**증상**: 성공 기준에 "수동 검토", "눈으로 확인" 같은 인간 의존 문구.
**왜**: executor (LLM) 가 "확인했다" 단정 가능 → 사실상 검증 없음.

**규칙**: 성공 기준의 각 항목은 grep / test / diff + 기대값 (건수 / exit / 문자열 포함) 명시. dooray-cli 는 `pnpm build && pnpm test` 가 기본 게이트.

**Self-check**: "확인" / "검토" 문구 0건? 각 명령에 기대값 명시?

## 1-6. 외부 상태 gate 부재

**증상**: 외부 시스템 변경 (push, merge, PR comment, npm publish) 단계 앞에 상태 확인 명령 없음.
**왜**: PR 이 close / merge 됐는데 force-push 하거나 CI 실패 모르고 "검증 완료" 댓글. dooray-cli 는 `npm publish` 가 추가 외부 동작.

```bash
STATE=$(gh pr view {N} --json state -q .state)
[ "$STATE" = "OPEN" ] || { echo "PR is $STATE"; exit 1; }
```

**Self-check**: 외부 가시 동작 앞에 gate, 뒤에 rollback 절차?

## 1-7. 새 불변식 도입 시 4면 가드 누락

**증상**: 캐시 스키마에 신규 필드 추가 + 일부 read 경로에만 가드 + writer 누락.
**왜**: 같은 불변식이 다른 표면에서 깨짐 (cache writer 드랍 / resolver 통과 / formatter 미반영 / config schema 미반영 등).

**4면 검사 체크리스트** (load-bearing 불변식인 경우 필수):
1. **Schema / Type**: `src/api/types.ts` / `src/cache/types.ts` 에 정의
2. **Cache writer & reader**: `src/cache/store.ts` 양쪽 모두 신 필드 처리 + atomic write
3. **Resolver / Mapper**: 입력 매퍼가 새 필드를 드랍하지 않는지 (`grep` 확인)
4. **Command / Formatter**: 사용자 가시 출력에서 일관 처리

**Self-check**: load-bearing 불변식 도입 시 4면 가드 모두 phase 작업 목록에 명시?

## 1-8. 마지막 phase 에 index.json `completed` 마킹 지시 누락

**증상**: 마지막 phase 본문에 "index.json status + 모든 phase status 를 `completed` 로 + 단일 commit 포함" 지시 없음.
**왜**: executor 는 scope 가드로 자체 추가 안 함 (올바른 행동) → team-lead 가 PR 직전 amend / 별도 commit. main 직접 수정 유혹 발생.

```bash
sed -i '' 's/"status": "pending"/"status": "completed"/g' tasks/{plan}/index.json
grep -c '"status": "completed"' tasks/{plan}/index.json   # = (1 + total_phases)
grep -lE "index\.json.*completed" tasks/{plan}/phase-*.md   # 마지막 phase 파일 매칭
```

**Self-check**: 마지막 phase 에 마킹 지시 + 단일 commit 포함 명시?

**`current_phase` 도 함께 갱신** (PR #62 review 추가): 위 sed 는 `status` 3건만 치환. `index.json` 의 `current_phase` 필드는 그대로 남아 "완료지만 phase 1 진행 중" 모순 발생. 마지막 phase 본문에 다음 1줄 sed 도 명시:

```bash
sed -i '' 's/"current_phase": 1/"current_phase": 2/' tasks/{plan}/index.json
grep -cE "\"current_phase\": {total_phases}" tasks/{plan}/index.json   # = 1
```

## 1-9. macOS BSD `sed` `\b` 미지원

**증상**: rename plan 에 `sed -i '' 's|foo\b|bar|g'`. macOS BSD `sed` 는 `\b` 미지원 → 0 매치.
검증: `echo "x.contentReview.y" | sed 's|contentReview\b|X|g'` → 변경 없음.
**왜**: 핵심 치환 누락, 빌드 / 타입 검증 실패하지만 phase 본문은 통과로 보일 수 있음.

**Good** (rename 시): `perl -i -pe 's/\bfoo\b/bar/g' file` (perl 은 `\b` 지원).

**Self-check**: rename / mass-replace plan 에 `sed \b` 사용? 있으면 perl 로 치환.

## 1-10. type 추가/삭제 phase 의 성공 기준에 `tsc --noEmit` 누락

**증상**: phase 성공 기준이 `pnpm build && pnpm test` 만 명시. 신규 type 정의/import/시그니처 변경을 포함한 phase 가 빌드/테스트 통과해도 tsc 검증을 우회 → 머지 후 다음 PR 에서 회귀 발견.
**왜**: tsup (esbuild) 과 vitest 모두 type-check 를 스킵. dooray-cli CI 도 historically `pnpm build && pnpm test` 만 돌림. type 회귀가 생산 build 에서는 안 보이고 type 전용 step (`tsc --noEmit`) 에서만 보인다.

**Good** (type 변경을 포함한 phase 의 성공 기준):
```bash
# 새/수정된 type 의 회귀 검사
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l
# 기대: <baseline 수치>  (변경 전 기준선 또는 0)
```

**검출 (plan 작성 시 grep)**: phase 본문에 `interface ` / `export type ` / `import type` / `: Promise<` / `: never` / 새 시그니처 추가 / catch 블록 패턴 변경 같은 키워드가 등장하는데 성공 기준에 `tsc --noEmit` 0건. → 누락.

## 1-11. plan 본문이 기존 함수 시그니처 미검증 → executor 빌드 실패

**증상**: phase 본문에 `await someExistingHelper(a, b, c)` 같은 코드 스니펫이 들어가는데 실제 `someExistingHelper` 가 `(a, b)` 2 인자만 받음. 또는 반환 타입이 `Promise<void>` 인데 plan 본문이 결과를 변수에 받는 코드 작성. executor 가 plan 본문 그대로 작성 → 즉시 `TS2554: Expected N arguments, but got M` 또는 type 불일치.

**왜**: plan 작성자가 "이 함수가 이렇게 동작하면 좋겠다" 의도로 호출 시그니처를 쓰면서 실제 src 의 시그니처를 grep 으로 확인 안 함. critic 도 시그니처까지 grep 안 하면 놓침. executor 가 발견 + 자체 수정하는 경우도 있지만 (PR #64 사례) 시그니처가 직관에 반하는 경우 (예: `validateMandatoryTags` 가 입력 검증 아니라 mandatory 그룹 존재만 검사) 잘못된 분기 작성 가능.

**Good**: phase 본문에 외부 함수 호출 코드 스니펫을 쓸 때 (1) `grep -nE "^export (async )?function {함수명}" src/` 로 정확한 시그니처 확인, (2) 반환 타입까지 인용. 두 줄 검증이 plan 본문에 들어가야 critic 도 함께 검증 가능.

```bash
# plan 작성 시 (또는 critic 재평가 시) 검증:
grep -nE "^\s*(export )?async function (validateMandatoryTags|resolveTags|toDoorayCliError)\b" src/
# 인자 수 + 반환 타입 + 동작 (검증만 / 변환만 / 둘 다) 까지 plan 본문에 인용
```

**Why**: PR #64 (plan031) critic 재평가 — 1차 REVISE 반영 후 신규 Critical 1건 발견. plan 본문이 `validateMandatoryTags(client, projectId, effectiveTags)` 로 3인자 호출 작성. 실제 시그니처는 `(client, projectId)` 2인자 + 입력 검증 안 함 (mandatory 그룹 존재 여부만). executor 가 알아서 `resolveTags` vs `validateMandatoryTags` 분기로 회피했지만 plan 본문 그대로 실행됐으면 tsc 실패 + 의도와 다른 검증.

**Self-check**: type 추가·변경·삭제를 포함한 phase 면 성공 기준에 `pnpm tsc --noEmit` 의 baseline 비교 명령이 있는가? CI 가 tsc 게이트를 돌리는 경우라도 phase 가드는 별도로 명시 (CI 는 PR scope 외 회귀까지 잡아주지만, phase 자체 검증은 plan-local).

**Why**: PR #46 (post comment get) 가 `PostCommentDetailResponse` 를 사용했지만 import 누락. plan026 (PR #48) `await Promise<never>` 패턴이 TS2366 발생. 둘 다 build/test PASS 로 머지 → 다음 PR 의 review-fix 단계에서야 발견. tsup 의 type-check 우회 특성은 dooray-cli 모든 type-touching phase 의 공통 함정.

## 1-12. type optional 완화 시 cascade 파일 grep 누락

**증상**: 기존 type 의 필드 `code: string` → `code?: string` 같은 optional 완화 / undefined 가능 변경을 plan 본문에 한 번 명시. 그러나 해당 필드를 *사용하는* 다른 파일 (`commands/project/groups.ts` 의 `[g.id, g.code]` 같은 `string[][]` 단언) 에서 type narrowing 실패 → tsc 실패. plan 본문 `## 변경 파일` 섹션에 그 cascade 파일이 누락.

**Good**: type 변경 (특히 optional 완화 / 새 필드 추가 / 필드 제거) 을 plan 에 넣을 때 `grep -rn "\.{필드명}\b" src/` 로 모든 사용처 grep + `## 변경 파일` 에 추가. type narrowing 손실 가능성 (배열 element type, .map 결과 type, return type 추론 등) 도 같이 점검.

```bash
# plan 작성 시 (또는 critic 평가 시) 검증:
# 예: MemberGroup.code 를 optional 로 완화
grep -rn "\.code\b" src/ | grep -v "test\|\.md$"   # 사용처 전수 조사
grep -rn "MemberGroup\|CachedMemberGroup" src/    # type 참조 전수 조사
# 결과 파일들이 plan 의 `## 변경 파일` 에 모두 있는지 확인
```

**Why**: PR #67 (plan032) critic Major #1 — `MemberGroup.code: string → string | undefined` 완화로 `groups.ts:24` `[g.id, g.code]` 가 `(string | undefined)[][]` 가 되어 TS2322. plan 본문에 `groups.ts` 누락. executor 가 자체 `g.code ?? ""` 패치로 회피했지만 plan-only 실행이면 tsc 실패. 다른 resolver 의 type 완화 작업 시 동일 패턴 재발 가능.

## 1-13. `.filter()` 후 TypeScript 타입 자동 미좁힘

**증상**: `arr.filter((x) => typeof x.field === "string")` 후 `arr.map((x) => ({ name: x.field }))` 작성. 사람은 "필터 후니까 string 보장" 으로 이해하지만 TypeScript 는 filter callback 의 boolean return 으로 narrowing 안 함 → x.field 는 여전히 `string | undefined`. 다음 사용처에서 type 불만족 (`NameRecord extends { name: string }` 위반 등) 으로 TS2345/TS2339.

**Good**: 두 가지 방법:
- **type predicate** (선호 — 안전): `.filter((x): x is X & { field: string } => typeof x.field === "string" && x.field.length > 0)` — TypeScript 가 narrowing 인지
- **`as string` 단언** (간단): `arr.map((x) => ({ name: x.field as string }))` + 단언 안전성 주석 (`// filter 로 string 보장`)

```ts
// BAD — narrowing 안 됨
const valid = groups.filter((g) => typeof g.code === "string");
const adapter = valid.map((g) => ({ name: g.code }));   // TS2345: string | undefined

// GOOD A — type predicate
const valid = groups.filter(
  (g): g is CachedMemberGroup & { code: string } =>
    typeof g.code === "string" && g.code.length > 0
);
const adapter = valid.map((g) => ({ name: g.code }));   // OK

// GOOD B — as string + 주석
const adapter = valid.map((g) => ({ name: g.code as string }));   // filter 로 string 보장
```

**검출**: type optional 완화 후 `filter` + `map` 체인이 plan 에 등장하면 narrowing 패턴 확인. 단언 사용 시 주석 필수.

**Why**: PR #67 (plan032) critic Major #3 — `member-group.ts` 의 `valid.map((g) => ({ name: g.code }))` 에서 TS2345/TS2339. executor 가 `as string` 추가로 회피. type predicate 가 더 안전하나 본 케이스는 단언 + 주석으로 처리. 다른 resolver 의 optional 필드 filter 패턴에서 반복 가능.

## 1-14. nonInteractive trigger 확장 시 interactive 분기의 옵션 경고 정리 누락

**증상**: `nonInteractive` 진입 조건에 새 옵션을 추가 (`|| hasTagChange` 등). 그러나 interactive `else` 블록에 기존에 있던 `if (hasOption) { stderr "...단독 사용 안 됨..." }` 경고를 그대로 둠. 새 옵션이 trigger 에 포함됐으므로 else 분기에서는 절대 true 가 안 됨 → **dead code + 메시지가 사실과 반대** (단독 호출이 이번 기능의 핵심인데 "단독 호출 안 됨" 안내 출력 가능성 0이지만 의도 충돌).

**Good**: nonInteractive trigger 에 새 옵션 추가하는 phase 면 같은 phase 본문에 "interactive else 블록 안의 동일 옵션 경고 (`if (hasX)`) 제거" 를 명시. 또는 의도 주석으로 대체 ("trigger 에 포함되므로 도달 불가").

```bash
# 검출: nonInteractive 조건에 추가한 옵션이 interactive else 안에 if 로도 등장하면 dead code
grep -nE "if \(hasTagChange\)|if \(opts\.parent\)|if \(.*\.cc.*\)" src/commands/post/edit.ts
# 같은 옵션이 nonInteractive 조건 + interactive 분기 if 양쪽에 동시에 있으면 한쪽이 dead
```

**Why**: PR #68 (plan033) docs-verifier VIOLATION — `nonInteractive = ... || hasTagChange` 확장 후 interactive else 안에 `if (hasTagChange) stderr "단독 호출 안 됨"` 그대로 둠. 도달 불가 + 메시지 정반대. cc/parent 같이 trigger 미포함 옵션의 경고 패턴을 그대로 적용할 때 발생.

## 1-15. resolver 의 검증 정책 일관성 — 신규 검증 helper 가 기존 정책 일부만 포함

**증상**: 기존 `resolveTags` 가 mandatory + selectOne 둘 다 검증. 새 helper `validateMandatoryCoverage` 추가 시 이름이 "Mandatory" 라 mandatory 만 검증하고 selectOne 누락. post create 는 정책 모두 검사하는데 post edit (신규 helper) 는 mandatory 만 → 정책 비대칭.

**Good**: 같은 도메인의 신규 검증 helper 추가 시 reference function (resolveTags, resolveUsers 등) 의 검증 블록을 grep 으로 모두 인용 + 새 helper 가 어떤 정책을 포함/제외하는지 plan 본문에 명시. 이름이 한 정책만 가리켜도 실제 검증은 reference 와 일치해야 일관성 유지.

```bash
# resolver 의 검증 블록 grep — phase 본문 작성 시 reference function 참조
grep -nE "selectOne|mandatory|MandatoryGroups|SelectOneGroups" src/resolvers/tag.ts
# 신규 helper 가 위 정책 중 어느 것을 포함하는지 plan 본문에 명시
```

**Why**: PR #68 (plan033) code-reviewer MEDIUM — `validateMandatoryCoverage` 가 mandatory 만 검증, selectOne 누락. `resolveTags` 는 둘 다 검증이라 post create 와 post edit 의 정책 비대칭. 다른 helper 분리 시 (예: `validateUsersCoverage`, `validateWorkflowChange` 등) 동일 패턴 재발 가능.

## 1-16. executor 가 critic 평가 결과 대기 안 하고 자체 구현 진행

**증상**: build-with-teams 5단계 critic 평가 (APPROVE/REVISE) → 6단계 executor 실행. 그런데 executor 가 5단계 critic 회신을 받기 전에 plan 본문만 보고 자체 구현 시작. critic REVISE 가 도착해도 이미 옛 plan 본문 기준으로 코드 작성 + 사용자 결정 반영 안 됨 (이름·시그니처 임의). team-lead 가 reset 후 재투입 필요 → 1 cycle 낭비.

**Good**: executor 프롬프트에 "team-lead 의 phase 시작 SendMessage 받기 전에는 자체 진행 금지 — critic REVISE 가능성 있음" 명시. team-lead 도 executor 스폰 시점에 "대기 상태로 시작, SendMessage 까지 작업 시작 금지" 강조. 또 plan 본문 v1 → v2 차이가 있을 때 SendMessage 메시지에 "이전 자체 진행 결과는 reset 됨, plan 본문 v2 강제" 명시.

**Why**: PR #64 (plan031) / PR #67 (plan032) / PR #68 (plan033) 3회 연속 발생. plan031 때는 executor 가 알아서 critic 발견 패턴 회피했지만, plan032/033 에서는 사용자 결정 옵션 a 와 다른 옵션 b 변형으로 진행 → reset 후 재투입. 매 plan 마다 1 cycle 낭비. critic 평가가 비동기로 도착하는 점이 근본 원인. executor 가 "대기" 명시받지 않으면 자체 진행 본능적 경향.

## 섹션 1 소진 체크리스트

plan 제출 전 10개 패턴 모두 self-check:

- [ ] **1-1**: 모든 수치가 실측 명령 결과
- [ ] **1-2**: 파일 목록이 `--name-only` 결과와 일치
- [ ] **1-3**: 최근 10개 커밋과 이 plan 의 관계 서술
- [ ] **1-4**: 모든 Bash 블록에 `# cwd:` 주석
- [ ] **1-5**: 성공 기준에 인간 의존 문구 없음
- [ ] **1-6**: 외부 상태 변경 단계에 gate + rollback
- [ ] **1-7**: load-bearing 불변식 도입 시 4면 가드
- [ ] **1-8**: 마지막 phase 에 index.json `completed` 마킹 지시
- [ ] **1-9**: rename 시 `sed \b` 대신 `perl`
- [ ] **1-10**: type 변경 phase 면 성공 기준에 `pnpm tsc --noEmit` baseline 비교

---

# 2. team 운영

`build-with-teams` 가 팀원 스폰 / 메시지 / 브랜치 작업 시 self-check. 사고가 자주 발생하는 영역.

## 2-1. 팀원 SendMessage 회신 누락

**증상**: sub-agent 가 평가 결론을 자기 화면에만 출력하고 종료. team-lead inbox 미도달.
**왜**: idle 알림만 도착 → team-lead 평가 미수신 상태로 다음 단계 진행 불가.

스폰 프롬프트 + 작업 지시 메시지 양쪽에:
```
회신은 반드시 SendMessage 로 team-lead 에 송신.
화면 텍스트만 출력하고 종료 시 라우팅 안 됨.
```

team-lead 가 idle 알림 2회 연속 + 평가 메시지 0 → 즉시 강제 재요청.

## 2-2. 팀원 자발적 실행

**증상**: idle 대기 지시 무시하고 team-lead 의 SendMessage 전에 자발 실행 / 검증 시작.
**왜**: critic 게이트 시점 정합성 망가짐.

스폰 프롬프트에:
```
team-lead 의 명시적 "시작" 지시 전 절대 자발 실행 금지. idle 유지.
```

team-lead 는 critic 평가 중 worktree git status 점검으로 자발 실행 조기 감지.

## 2-3. self-shutdown 패턴

**증상**: `oh-my-claudecode:code-reviewer` / `architect` (docs-verifier) 가 `run_in_background: true` 로 스폰해도 idle 직후 자체 shutdown.
**왜**: critic 만 idle 유지 성공. reviewer / verifier 는 shutdown.

**우회**: 검사 결과 준비 시점에 즉시 새로 spawn (idle 대기 의존 금지). 죽었다는 시스템 알림 받으면 침묵 말고 새로 스폰 + 즉시 검사 지시 묶음.

## 2-4. executor cwd 격리 (main repo 오염 방지)

**증상**: worktree 절대경로 명시했는데 executor 가 main repo 에서 `cd /main-repo` 로 작업.
**왜**: main 오염 → origin 다이버전스 / 다른 plan 미푸시 작업과 충돌.

executor 프롬프트에:
```
모든 cd / git / 파일 편집은 worktree 절대경로 기준만. main repo 직접 cd 금지.
의심 시 `pwd` 확인.
```

team-lead 는 executor 작업 중 `git -C {main-repo} status` 주기 점검. dirty 시 즉시 중단.

## 2-5. executor scope 확장 자체 판단

**증상**: phase 도중 task 범위 외 (pre-existing 에러 / 발견한 bug / ADR 위반 자체 변경) 를 자체 추가. 또는 `@ts-ignore` / `@ts-expect-error` 자체 추가.
**왜**: critic 게이트 우회 → 사후 평가 사이클 추가 + task 본문 / 성공 기준 어긋남.

executor 프롬프트에:
```
task 범위 외 수정은 자체 판단 금지.
@ts-ignore / @ts-nocheck / @ts-expect-error 자체 추가 = 정책 변경 → 보고 필수.
SendMessage 로 team-lead 에 보고: "X 발견, Y 수정 필요. 본 phase 포함 / 별도 plan 결정 부탁".
```

team-lead 흐름: 보고 → critic 사후 평가 → ACCEPT (scope 확장 commit 명시) 또는 REJECT (별도 plan).

## 2-6. critic v2 재평가 시 신 파일 미재읽기

**증상**: REVISE 후 v2 commit hash 받고도 v1 평가 그대로 반복 송신.
**왜**: critic 이 이전 평가 컨텍스트만 가지고 회신 → 신 파일 Read 누락.

team-lead 재평가 메시지에 **3가지 필수 포함**:
1. `Read tool 로 다음 파일을 다시 읽고 재평가해 줘` 명시 + 변경 파일 절대경로
2. 4-5개 확인 포인트 체크리스트
3. "직전 메시지가 첫 평가 사본일 수 있음 — 실제 파일 상태 기준으로 판정"

회신이 v1 동일하면 즉시 강제 재읽기.

## 2-7. code-reviewer 에 plan 비자명 설계 결정 미전달

**증상**: code-reviewer 가 plan 컨텍스트 모르면 정상 helper 사용을 권장하다 설계 의도와 충돌 (false positive LOW 양산).
**왜**: team-lead 가 일일이 판정해야 함.

team-lead 의 검사 시작 메시지에 plan 의 비자명 결정 (helper 우회 사유 / 의도된 raw pattern / 의도된 placeholder 등) 1-2 줄 첨부.

## 2-8. task 재분할 시 index.json 갱신 누락

**증상**: critic REVISE 후 phase 파일 재작성 / 추가 / 제거 시 `index.json.total_phases` + `phases` 배열 미갱신.
**왜**: 파이프라인이 신 phase 인식 못 해 executor 가 구 phase 만 실행 → plan 핵심 누락.

```bash
jq -r '.total_phases as $t | .phases | length as $p | "total=\($t), len=\($p)"' tasks/{plan}/index.json
ls tasks/{plan}/phase-*.md | wc -l   # 위 두 값과 일치
```

phase 파일과 index.json 은 같은 commit 으로 갱신.

## 2-9. cwd 추적 + 양쪽 git status 검증

**증상**: team-lead 가 task 재작성 / commit 시 cwd 가 main repo 인지 worktree 인지 헷갈림. 동일 상대경로가 다른 파일 가리킴.
**왜**: main repo 의 task 파일 의도치 않게 수정 / 삭제. system-reminder 알림이 어느 working tree 인지 명확히 표기 안 됨.

commit 전 `pwd` + 양쪽 동시 점검:
```bash
git -C /Users/.../dooray-cli status --short
git -C /Users/.../dooray-cli/.claude/worktrees/{plan} status --short
```

## 2-10. 브랜치 확인 누락 commit 사고

**증상**: skill / docs 변경 commit 직전 `git branch --show-current` 안 함 → PR 작업 브랜치에 무관 commit 박힘.
**왜**: skill 외부 작업이라도 자동 mode 가 자동 switch 하는 듯. 같은 세션 두 번 발생.

**규칙**: 모든 commit 직전 `git branch --show-current` 강제 확인. main 작업이면 main, PR 브랜치 작업이면 PR 브랜치 확인 후 commit.

## 섹션 2 소진 체크리스트

스폰 / 메시지 / 검증 / commit 단계마다 해당 패턴 self-check.

---

# 3. PR review 학습 (코드 패턴 함정)

`review-fix` 가 PR 리뷰 댓글 처리 후 재발 가능 패턴을 누적하는 자리. 같은 지적이 다음 PR 에서 반복되지 않도록.

> 누적 양식 (CLI# 또는 패턴 한 줄):
>
> ```markdown
> ## 3-N. {짧은 패턴 이름} (PR #N)
> **증상**: {1줄}
> **왜**: {1줄}
> **Good**: {해결책 + 코드 패턴}
> **검출**: {grep / find 명령}
> ```

(아직 누적 항목 없음. PR 리뷰 처리 시 `review-fix` 6.5단계 절차에 따라 채움.)

## 섹션 3 누적 규칙

- 누적 대상: 재현 가능한 라이브러리 / API / 타입 함정 (ky / vitest / commander / imapflow / mailparser / nodemailer 등)
- 누적 금지: 1회성 오타, 특정 plan 컨텍스트 종속 코멘트, 칭찬, 단순 확인 요청
- 도메인 의사결정 가치가 있으면 `docs/adr.md` 신규 ADR 로 (ADR 작성 전 점검 통과 시)

---

# 4. 레포별 +α (dooray-cli — TypeScript / Commander.js / tsup / vitest)

## CLI1. exitCode 누락

**증상**: 에러 분기에서 `process.exit(N)` 또는 `throw new DoorayCliError(msg, exitCode)` 호출 누락 → 0 으로 종료되어 호출 스크립트가 실패 인지 못함.
**Good**: 모든 에러 경로는 `DoorayCliError` 또는 명시적 `process.exit(N)`. exitCode 정책은 `src/utils/exit-codes.ts` 참조.
**검출**: `grep -nE 'console\.error.*\n.*return\b' src/commands/`.

## CLI2. ky 외 HTTP 클라이언트 사용

**증상**: `axios` / `node-fetch` / `got` import → 번들 크기 증가 + ADR-002 의 retry / timeout 정책 일관성 깨짐.
**Good**: 모든 HTTP 호출은 `src/api/client.ts` 의 ky 인스턴스 통과. 신규 외부 API 도 동일 helper 확장.
**검출**: `grep -rnE "from ['\"](axios|node-fetch|got)['\"]" src/`.

## CLI3. 캐시 일관성

**증상**: `~/.dooray/cache/` 쓰기 후 읽기 시 부분 쓰기 / 스키마 불일치 노출.
**Good**: write 는 atomic (`writeFile` to temp + rename), read 는 schema 검증 (타입 가드). ADR-004 / ADR-010 참조.
**검출**: `grep -nE 'fs\.writeFile.*cache' src/cache/` 결과 중 atomic 패턴 미적용 라인.

## CLI4. `~/.dooray/` 민감 파일의 mode 미지정

**증상**: `writeFile(path, data)` 만 호출하면 OS umask (보통 644) 로 파일 생성 → 공유 머신에서 다른 사용자가 sanitized argv (project code / postId 등) 또는 캐시된 멤버 정보를 읽을 수 있음.
**Good**: 사용자 데이터를 담는 `~/.dooray/` 하위 파일은 `writeFile(..., { mode: 0o600 })` 으로 owner-only. 특히 `last-run.json` / cache 하위 / config.json 등.
**검출**: `grep -nE 'writeFile\([^,]+,\s*[^,]+\)' src/cache/ src/config/ | grep -v "mode:"` (옵션 인자가 없는 호출).
**Why**: PR #36 review — last-run.json 이 sanitized 후에도 argv 에 프로젝트 코드 / 19자리 ID 가 남아 있어 정보 노출 표면.

## CLI5. JSON.parse 결과를 `as Type` 단언

**증상**: 디스크/네트워크에서 읽은 JSON 을 검증 없이 `as LastRun` / `as CachedMember` 등 단언. 타입 시스템은 통과하지만 런타임 형태가 다르면 후속 호출에서 `TypeError: x.y is not a function`.
**Good**: 검증 로직을 **타입 가드 함수** (`function isLastRun(o: unknown): o is LastRun`) 로 추출하고 `isLastRun(parsed) ? parsed : null` 패턴 사용. 인터페이스 필드 추가 시 가드 함수도 같이 갱신해야 컴파일 통과 — 동기화 강제.
**검출**: `grep -rnE 'JSON\.parse.*\)\s+as\b' src/` (즉시 단언 패턴).
**Why**: PR #36 review — 이전에 인라인 검증 + `as` 단언은 검증 블록과 캐스트가 따로 진화하다 결국 어긋남.

## CLI6. 사용자 데이터를 markdown 코드 블록에 직접 삽입

**증상**: `\`\`\`\n${last.errorMessage}\n\`\`\`` 처럼 외부에서 받은 문자열을 fenced code block 안에 그대로 삽입. 데이터에 `\`\`\`` 가 포함되면 GitHub Markdown 파서가 거기서 코드 블록을 닫아 본문이 깨짐 (누출 가능).
**Good**: 삽입 전 `s.replace(/\`\`\`/g, "'''")` 로 이스케이프하거나, 인용 블록 (`>`) 으로 감싸기. issue body / PR body / wiki 모두 동일.
**검출**: `grep -rnE '"\`\`\`"' src/utils/feedback-meta.ts src/` 영역의 fenced block builder 코드.
**Why**: PR #36 review — `buildLastRunBlock` 가 errorMessage 를 ` ``` ` 안에 직접 넣어 GitHub 표시가 깨질 가능성.

## CLI7. 외부 응답의 fileName 으로 경로 조립 (path traversal)

**증상**: 서버 / API 가 반환한 `fileName` 을 검증 없이 `path.join(outDir, fileName)` 에 사용. 악의적 (또는 버그있는) 서버가 `../../etc/passwd` 같은 값을 반환하면 지정 디렉토리 밖으로 파일이 기록됨.
**Good**: 외부에서 받은 fileName 은 항상 `basename(fileName)` 으로 directory component 제거 후 join. 다운로드 / 첨부 / 사용자가 통제하지 않는 모든 경로 입력에 적용.
**검출**: `grep -rnE 'join\([^)]*\bfileName\b' src/commands/` 중 `basename` 미적용 라인.
**Why**: PR #40 review — `post comment file download` 가 Dooray 응답의 fileName 을 그대로 join. 보안 측면에서 1줄로 막을 수 있는 취약점.
**재발 빈도 높음**: PR #40 (🔴) → PR #72 (🔴) 두 PR 에서 동일 버그가 반복됨.
download 명령 신설 시 `basename(decodeURIComponent(fileName))` grep 강제.

## CLI8. "정상 빈 결과" 메시지를 stderr 로 출력

**증상**: 첨부 0 개 / 댓글 0 개 같은 **정상 빈 상태** 메시지를 `process.stderr.write` 로 보냄. CLAUDE.md 컨벤션은 `데이터=stdout / 에러·진행로그=stderr`. 빈 결과는 에러가 아니므로 stderr 위반 + 자동화 파이프 처리 어색함.
**Good**: 빈 결과는 `--json` 시 `[]` / `{}` stdout, 일반 모드는 `'결과 없음'` 등 stdout 또는 무출력. `--quiet` 시 무출력.
**검출**: `grep -rnE 'stderr\.write.*없음|stderr\.write.*empty' src/commands/`.
**Why**: PR #40 review — `comment file list` 가 "첨부 없음" 을 stderr 출력 → 컨벤션 위반.

## CLI9. `--quiet` 모드에서 식별자 출력 누락

**증상**: 자동화 / 파이프 친화 모드 (`--quiet`) 에서 fileId / postId / pageId 같은 후속 처리에 필요한 식별자를 stdout 에 출력하지 않음. 호출자 (스킬 / shell pipe) 가 `dooray foo upload --quiet | xargs dooray bar` 패턴으로 체이닝 불가.
**Good**: `--quiet` 분기에서 사람용 메시지는 생략하되 **식별자 1 줄** (`fileId`, `pageId` 등) 은 stdout 출력. `--json` 과 별개로 quiet 도 자동화 진입점.
**검출**: `--quiet` 분기에서 `stdout.write` 가 0 줄인 명령 — 신규 명령 PR review 시 grep.
**Why**: PR #40 review — `comment file upload --quiet` 가 fileId 미출력 → 다음 명령 체이닝 불가.

## CLI10. 외부에서 받은 문자열을 sanitize 없이 stderr/stdout 출력

**증상**: 서버 응답·사용자 입력에서 받은 문자열 (파일명, 멤버 displayName, 에러 메시지 등) 을 그대로 `process.stderr.write` / `process.stdout.write` 로 출력. 악의적 측이 ANSI escape 시퀀스나 control char (`\x00-\x1F`, `\x7F`) 를 삽입하면 터미널 색상·커서·title 변조 가능.
**Good**: 출력 직전 `name.replace(/[\x00-\x1F\x7F]/g, "?")` 로 제거. 공통 helper (`sanitizeFileName` / `sanitizeForTerminal`) 로 추출하여 신규 출력 지점에서도 재사용.
**검출**: `grep -nE "(stderr\|stdout)\.write\(.*\\$\\{[a-zA-Z]+\\.(name\|content\|title\|message)" src/` — sanitize 안 거친 동적 출력 의심 패턴.
**Why**: PR #43 review — `guardDroppedAttachments` 가 서버 `file.name` 을 그대로 stderr 출력 → 악의적 파일명에 ANSI escape 시 터미널 변조. dooray API 는 사용자 업로드 파일명을 그대로 echo 하므로 sanitize 가 boundary 책임.

## CLI11. non-interactive / interactive 분기 동일 가드 inline 중복

**증상**: 한 명령이 두 입력 모드 (`--body` non-interactive vs `$EDITOR` interactive) 를 가지면서 동일한 사전 검사 시퀀스 (find + warn + confirm 등) 를 양쪽에 inline 으로 중복. 후속 변경 시 한쪽만 갱신되어 모드 간 동작이 달라지는 회귀 위험.
**Good**: orchestrator helper 로 추출 (예: `checkAndGuardDropped(oldBody, newBody, attachments, noConfirm)`), 두 분기에서 한 줄로 호출. helper 내부에서 검사 → 경고 → 확인 → throw 순서를 단일 정의.
**검출**: 한 명령 파일 안에서 같은 helper 가 2회 이상 호출되면서 사이에 비슷한 입력 준비 (`(... ?? []).map`) 가 반복되면 후보.
**Why**: PR #43 review — `post edit` non-interactive + interactive 두 분기가 `findDroppedAttachments → guardDroppedAttachments` 시퀀스를 inline 중복.

## CLI12. I/O + throw 결정을 한 함수에 묶음 → 단위 테스트 불가

**증상**: 한 helper 가 (1) stderr 출력, (2) readline 사용자 입력, (3) DoorayCliError throw 를 동시에 담당. vitest 에서 stdin/stdout mock 없이 단위 테스트 작성 불가 → 결국 테스트 누락.
**Good**: 책임 분리 — `printWarning(...)` (stderr 만) / `confirmPrompt(): Promise<boolean>` (입력만) / `orchestrator(...)` (throw 결정). 순수 helper 만이라도 단위 테스트로 보호.
**검출**: `async function ... Promise<void>` 안에 `process.stderr.write` + `readline.createInterface` + `throw` 셋이 동시에 있으면 분리 후보.
**Why**: PR #43 review — `guardDroppedAttachments` 가 세 책임을 묶어 테스트 작성 안 됨. 분리 후 sanitize / extract / findDropped 단위 테스트로 회귀 보호.

## CLI13. `--dry-run` / 출력 분기에서 `--json` / `--quiet` 모드 누락

**증상**: 같은 옵션 세트(`--json` / `--quiet` / `--dry-run`)를 받는 4 명령에서 dry-run 분기가 일부 명령에만 `globalOpts.json` 처리를 가지고, 나머지에는 `process.stdout.write(body + "\n")` 평문만. CLI 자동화 스크립트가 같은 플래그 조합을 명령별로 다른 형식으로 받음.
**Good**: 새 출력 분기 (`if (opts.dryRun)`, "변경사항 없음" 등) 추가 시 `globalOpts.json` / `globalOpts.quiet` 분기를 같은 자리에서 처리. helper 추출 권장 (`writeBodyOutput(body, globalOpts)`).
**검출**: `grep -nE "opts\.dryRun|process\.stdout\.write" src/commands/post/` 결과를 4 명령 사이 비교 — 한 명령에만 `JSON.stringify` 가 있으면 다른 3개도 동일 분기 필요.
**Why**: PR #44 review — `comment add` / `post create` 만 dry-run JSON 분기, `comment edit` / `post edit` 누락. 같은 `OutputOptions` 인터페이스를 공유하는 명령 그룹은 출력 분기도 동일해야 한다.

## CLI14. client 의존 helper 를 `utils/` 에 두면 layer 위반

**증상**: 새 helper (`resolveTaskLinks(client, ...)`) 가 도메인 응집을 이유로 `src/utils/task-link.ts` (기존 `escapeLinkText` / `buildTaskLink` 동거 모듈) 에 작성됨. utils 는 client 의존 없는 building blocks 가 컨벤션 — `mention.ts` 의 `prependMentions` 도 client 안 받음.
**Good**: client 를 받는 함수는 `src/resolvers/` (예: `src/resolvers/task-link.ts` 신규). 같은 도메인의 building blocks 는 utils, lookup / API 호출 orchestrator 는 resolvers 로 분리. 같은 디렉터리 이름 충돌은 layer 가 우선.
**검출**: `grep -nE "DoorayApiClient" src/utils/*.ts` 결과 0 건 유지. utils 안에 client import 가 등장하면 resolver 후보.
**Why**: PR #44 review — task-link orchestrator 를 utils 에 두는 안과 resolvers 에 두는 안 둘 다 "허용" 댓글이 있었으나, layer 컨벤션 (utils=building block, resolvers=client+cache+lookup) 에 따르면 resolvers 가 정답. 잘못 두면 utils 가 점진적으로 client 의존 모듈로 오염.

## CLI16. resolver/parser boundary 검증 (빈/공백 식별자가 API URL path 로 흘러감)

**증상**: `commentId` / `fileId` 같은 식별자를 trim·non-empty 검증 없이 `parseXxxPositional` 이 통과시킴. 사용자가 빈 문자열 / 공백만 / 인용 부호 안 빈 값을 넘기면 그대로 `GET /posts/<postId>/comments//logs//files/` 같은 깨진 URL 로 합성되어 서버 4xx (또는 더 나쁘게 path traversal 가까운 동작) 발생. `resolvePostInput` 의 numeric 검증 패턴과 비대칭.
**Good**: `parseXxxPositional` 진입부에서 모든 path 식별자에 `assertNonEmpty(value, "<label>")` (trim 후 빈 거부) 가드. discriminated union + 오버로드와 함께 "필수 secondary" 도 같은 가드 적용. `resolveCommentFileInput` 의 `assertNonEmpty` 헬퍼가 reference 구현.
**검출**: 신규 resolver/parser 추가 시 `grep -nE "throw new DoorayCliError.*가 필요|EXIT_PARAM_ERROR" src/resolvers/<file>.ts` 결과의 가드 다음에 trim 검증이 있는지 확인. 없으면 boundary 미보호.
**Why**: PR #47 review #5 — `comment-file-input.ts` 가 `commentId` / `fileId` 를 trim 없이 그대로 `client.getPostComment` URL 에 합성. resolver helper 가 향후 추가될 때마다 같은 boundary 가드 누락 위험 — 검증 책임을 caller (commands/) 가 아니라 resolver 가 단일 지점에서 진다.

## CLI15. 동일 변환 `.map` 블록이 N 파일에 복붙 → critic / planner 단계에서 헬퍼 추출 누락

**증상**: 같은 입력 (`linkInputs: string[]`) 을 같은 외부 호출 시퀀스 (`parseLinkRef → resolvePostInput → getPost → 변환`) 로 변환하는 15 줄 블록이 4 명령 파일에 그대로 복사됨. critic 이 sub-pattern 으로 지적했으나 "executor 재량" 으로 흡수 안 함 → code-reviewer 가 다시 지적 → 사후 별도 PR review-fix 로 추출.
**Good**: phase 작성 시 "동일 변환 N 파일 복붙" 이 보이면 plan 본문에 helper 명시 (`src/resolvers/<domain>.ts` 신규). critic 의 sub-pattern 도 MAJOR 로 승격할지 판단 — 4 파일 이상 복붙은 사후 review-fix 보다 phase 안에서 추출하는 게 cheaper.
**검출**: `git diff --name-only` 결과의 `commands/post/*.ts` 가 3 개 이상이고 각 diff 의 +라인 패턴이 `for/map(... await ...)` 형태로 유사하면 추출 후보.
**Why**: PR #44 review — phase-02 plan 이 인라인 `linkInputs.map` 을 4 파일에 명시 → 적용 후 review 에서 헬퍼 추출 요구. critic minor 1번에서도 "split 검증 부족" 같은 sub-pattern 을 지적했으나 본 패턴 (4 복붙 자체) 은 미지적. critic prompt 에 "동일 .map N 복붙" 검출을 명시 필요.

## CLI16. ADR-020 분기에서 silent fallback (`opts.X ?? positional`)

**증상**: positional 인자와 옵션이 같은 값 (예: `arg3` = 댓글 ID, `--comment-id` = 댓글 ID) 을 받을 때 `opts.commentId ?? arg3` 처럼 nullish coalescing 으로 옵션 우선 처리. 깔끔해 보이지만 두 입력이 동시에 들어오면 한쪽이 silent 하게 무시되어 사용자 의도 모호.
**Good**: ADR-020 의 *"모호한 입력 = 명시적 에러"* 정책 — `if (arg3 && opts.commentId) throw DoorayCliError(EXIT_PARAM_ERROR)` 후 어느 쪽이든 단독 사용. `parseGetArgs` / `parseCommentFilePositional` 등 분기 헬퍼에 동일 가드.
**검출**: `grep -rnE 'opts\.[a-zA-Z]+\s*\?\?\s*arg[0-9]' src/commands/` (옵션 우선 fallback 패턴).
**Why**: PR #46 review — `comment/get.ts` 의 `parseGetArgs` 가 `opts.commentId ?? arg3` 로 옵션 우선. 사용자가 `dooray post comment get myproject 337 id-A --comment-id id-B` 입력하면 `id-A` 가 silent 무시. ADR-020 의 분기 게이트는 모호한 입력을 거부해야 함.

## CLI17. 같은 도메인 인접 명령의 defensive 패턴 동일 적용 누락

**증상**: `comment/list.ts` 가 `buildMemberNameMap` 호출을 try-catch + 빈 `Map` fallback 으로 감싸 멤버 조회 실패 시에도 댓글 목록은 그대로 반환. `comment/get.ts` 가 신설되면서 동일 패턴 누락 → 멤버 API 실패 시 단건 댓글 조회 자체가 실패.
**Good**: 같은 도메인 (`commands/post/comment/`) 신규 명령 작성 시 인접 파일 (`list.ts`, `add.ts` 등) 의 enrich / cleanup / dry-run / 출력 분기 패턴을 grep 으로 먼저 확인하고 그대로 적용. 일관성이 회귀 방어선.
**검출**: phase 작성 / review 시 `grep -nE "try\s*\{|catch\s*\(|new Map" src/commands/post/comment/*.ts` 결과를 신규 명령과 인접 명령 사이 diff. 인접 명령에 있는 가드가 신규 명령에 없으면 의도적인지 확인.
**Why**: PR #46 review — `comment/get.ts` 가 `buildMemberNameMap` 을 raw 호출. critic / docs-verifier 모두 잡지 못했고 code-reviewer 가 PR review 단계에서 발견. plan 작성 시 *"인접 명령 동일 패턴 적용 점검"* 을 self-check 에 포함하면 사전 차단 가능.

## CLI18. dead 필드 접근 fix 후 함수명-동작 불일치

**증상**: `member?.emailAddress ?? memberId` 같은 dead 필드 접근 (`emailAddress` 가 타입에 없어 항상 fallback) 을 `.name` 등으로 fix 해 tsc 통과 시켰지만, 함수명 `memberIdToEmail` 은 그대로 둠 → 함수가 실제로는 name 을 반환하는데 호출자는 email 로 오인할 수 있음. PR #52 review 가 ADR-013 SMTP 발송 위험까지 언급 (이번 케이스는 false alarm 이었지만 패턴 자체는 실재 위험).
**Good**: dead 필드 접근 / undefined fallback fix 시점에 함수명 + 호출자 변수명 (`emails: string[]` → `names: string[]`) 까지 일괄 점검. fix scope 안에서 rename 가능하면 같은 commit 에 흡수, 별도 PR 이 깔끔하면 follow-up commit. **호출자 검색**: `grep -rn "<함수명>\b" src/` 로 caller 모두 확인 후 의미상 충돌 없는지 검토.
**검출**: tsc fix PR 작성 시 변경된 함수명을 `git diff <base>..HEAD --diff-filter=M -U0 src/` 로 추출 → 함수 시그니처가 *값의 의미를 전달* 하는데 동작이 바뀌었으면 rename 후보. 자동 검출 어렵지만 review 단계에 명시적 self-check 항목으로.
**Why**: PR #52 review — `memberIdToEmail` 이 dead `.emailAddress` fix 후 `.name` 반환하는데 함수명은 email 시사. 흐름상 SMTP 와 무관해 실제 위험 0 이었지만, 다음에 비슷한 케이스에서는 진짜 SMTP 흐름과 엮일 수 있음. tsc fix 와 rename 을 한 묶음으로 처리하는 습관이 회귀 방어.

## CLI19. `T | false` union 반환 라이브러리에 `??` 사용 부적합

**증상**: `mailparser.ParsedMail.html: string | false`. `parsed.text ?? parsed.html ?? "(default)"` 작성 시 `parsed.text === undefined` 이고 `parsed.html === false` 면 `??` 가 `false` 를 통과시켜 `body = false` 로 결과 — 타입 string 위반 + 런타임 false 노출.
**Good**: 외부 라이브러리가 `T | false` / `T | 0` / `T | ""` 반환 가능하면 `||` 사용 (falsy 전체를 default 로 흘림). 단 의도된 빈 문자열 보존이 필요하면 명시적 `typeof` / `=== false` 가드 + 한 줄 주석으로 의도 명시.
**검출**: `grep -rnE "\?\?.*(html|raw)\b" src/` 로 nullish coalescing 후보 리뷰. 타입 정의에 `| false` / `| 0` / `| ""` 이 있는 union 이면 `??` 부적합.
**Why**: PR #53 review — `parsed.text ?? parsed.html ?? "(본문 없음)"` 에서 `parsed.html: string | false` 의 `false` 통과 위험. `||` 로 교체 + 의도 주석. 다른 라이브러리 (`yaml.load` 일부 형, `dotenv` 등) 도 유사 패턴 가능.

## CLI20. 같은 옵션을 두 명령에 추가할 때 dry-run 분기 위치 비대칭

**증상**: 새 옵션 (`--cc-group` / `--to-group` 등) 을 `post edit` + `post create` 양쪽에 추가. `post edit` 은 dry-run 분기 *이후* 에 cc/to resolve 가 일어나도록 작성돼서 `--dry-run --json` 출력이 `{ body, users: { to, cc } }` 를 포함. `post create` 는 dry-run 분기가 cc/to resolve *이전* 에 조기 반환되어 `{ body }` 만 출력. 같은 옵션 + 같은 `--dry-run --json` 입력에 대해 명령마다 출력 범위 비대칭 → README 가 "포함된다" 로 일괄 서술하면 한 쪽 명령에서 docs↔코드 불일치.
**Good**: phase 작성 시 새 옵션이 두 명령 (`edit` + `create` 등) 에 들어가면 **양 명령의 dry-run 분기 라인을 phase 본문에 명시** + "dry-run JSON 출력 범위가 두 명령에서 동일한가" self-check. 범위 통일이 불가능하면 (예: create 가 신규 자원이라 resolve 비용 회피) README/SKILL.md 에 **명령별로 범위를 분리 서술**.
**검출**: phase diff 에 동일 옵션이 2 개 이상 `commands/post/*.ts` 에 추가됐으면 `grep -nE "opts\.dryRun|JSON\.stringify" <변경 파일들>` 결과 비교 — dry-run 분기 직전 코드에 무엇이 resolve 됐는지 라인 단위로 대조. 비대칭이면 docs 도 두 명령을 분리해서 서술.
**Why**: PR #55 review — `post edit` 은 dry-run 가드를 cc/to resolve 후에 두는 게 자연스러웠고 (기존 mention/link-task 패턴 그대로 적용), `post create` 는 dry-run 가드가 다른 resolve 보다 위에 있었음. README 가 "post edit/create 의 --dry-run --json 출력에 users 포함" 으로 일괄 서술 → docs-verifier UPDATE_NEEDED. CLI13 의 변형: 같은 옵션 4 명령 dry-run 분기 누락은 CLI13 이 잡고, 같은 옵션 2 명령 dry-run *위치 차이로 출력 범위 비대칭* 은 CLI20.

## CLI21. dry-run 실증 시나리오에서 non-interactive 진입 조건 누락

**증상**: phase 본문 실증 시나리오에 `--dry-run --json` 만 명시 (예: `node dist/index.js post edit <project> <number> --parent <ref> --dry-run --json`). 그런데 `post edit` 의 분기는 `nonInteractive = !!(title || body || bodyFile)` — `--dry-run` 자체는 non-interactive 진입 조건이 아니라서 interactive ($EDITOR) 분기로 빠짐. dry-run JSON 출력 블록은 non-interactive 안에만 존재 → 실증 시나리오가 통과 불가능.
**Good**: post edit/comment edit 류의 실증 시나리오에 `--dry-run` 을 쓰려면 항상 `--title "<원제목>"` 또는 `--body "..."` 동반. phase 본문 실증 단계에 "non-interactive 진입 보장을 위해 `--title` 동반 필수" 한 줄 명시.
**검출**: phase 본문에 `--dry-run` 등장 시 같은 명령 라인에 `--title` / `--body` / `--body-file` 중 하나가 있는지 grep:
```bash
grep -nE "\-\-dry-run" tasks/{plan}/phase-*.md | grep -vE "\-\-title|\-\-body"
# 결과 있으면 의심
```
**Why**: PR #62 critic REVISE — phase-01 실증 시나리오 #5 가 `--parent --dry-run --json` 만 명시. 실제 코드에서 interactive 분기로 진입해 dry-run JSON 자체가 실행 안 됨. executor 가 "통과한 것처럼" 보고하거나 디버깅 미궁 위험. comment edit / post edit / wiki page edit 동일 패턴.

## CLI22. sequential endpoint 호출 — partial-failure stderr 안내 + spinner pair 누락

**증상**: 본문 변경(`updatePost`) + 메타데이터 변경(`setPostParent` / `setPostWorkflow` / `deletePostFile` + `updatePost` 댓글 PUT 합성 등) 을 sequential 로 호출. atomic 보장 없으므로 첫 호출 성공 + 두 번째 실패 시 부분 상태 발생. catch 가 `toDoorayCliError` 로 throw 만 하면 사용자는 "전체 실패" 로 오해 → 본문 재실행으로 mention prepend 중복 등 부작용.
**Good**: sequential 호출의 catch 안에서 (1) `stopSpinner(false, "...")`, (2) `process.stderr.write("⚠  본문은 수정되었으나 X 변경에 실패했습니다. 본문 재실행 금지 — ...")`, (3) re-throw. phase 본문 작업 항목에 try/catch + stderr 안내 코드 스니펫 명시.
**검출**: phase diff 에 `client.X` + `client.Y` 두 호출이 같은 비-Promise.all 블록에 있으면 의심. grep 패턴:
```bash
git diff main..HEAD -- src/commands/ | grep -E "^\+\s+await client\." | wc -l
# 같은 함수에서 2 이상이면 sequential 패턴 — partial-failure 처리 확인
```
**Why**: PR #62 critic REVISE — `updatePost` 성공 후 `setPostParent` 실패 시 본문은 저장된 상태. 사용자가 명령 재실행하면 mention prepend 중복 / link-task 중복 추가 가능. ADR-019 (post create --workflow), ADR-024 (comment file delete) 도 동일 패턴 — sequential 추가 시 반드시 partial-failure UX 점검.

## CLI23. `as unknown as X | Y` 이중 단언 — API client 반환 타입 union 으로 우회

**증상**: API client 의 메소드 반환 타입이 spec 과 실제 응답 shape 다를 때 (예: Dooray `result` 가 nested array) resolver 단에서 `(res.result as unknown as MemberGroup[][] | MemberGroup[]).flat()` 같이 이중 단언 사용. TypeScript 의 구조적 호환성 검사가 우회되어 다른 shape mismatch 가 silent 통과할 위험.
**Good**: `MemberGroupListResponse.result: MemberGroup[] | MemberGroup[][]` 처럼 **반환 타입 자체를 union 으로 선언** + resolver 에서 `res.result.flat()` 단언 없이 호출. `Array.prototype.flat()` 시그니처가 union 양쪽 case 자동 흡수.
**검출**: 신규 resolver / parser 추가 시:
```bash
grep -nE "as unknown as .*\|" src/
# 결과 있으면 의심 — API client 반환 타입 union 으로 옮길 수 있는지 검토
```
**Why**: PR #77 review — `member-group.ts:21` 이중 단언으로 ADR-028 nested array unwrap 구현. 리뷰 권장에 따라 `MemberGroupListResponse.result` union 으로 옮기고 단언 제거 (PR #77 commit `76105b5`). 같은 패턴이 향후 spec ↔ runtime mismatch 흡수 (ADR-028 류) 에 재발 가능 — API client 단에서 union 으로 흡수하는 게 type-safety 측면에서 우선.

---

이 파일은 dooray-cli 전용. 시드 1 / 2 패턴은 fos-blog 와 동일 구조이지만 도메인별 예시는 dooray-cli 컨텍스트로 표현. 3 / 4 / ... 는 이 레포 고유.
