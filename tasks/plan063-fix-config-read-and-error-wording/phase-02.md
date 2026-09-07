# Phase 02. 사용자 오류 메시지에서 내부 ADR 번호와 API 용어를 뺀다

**Execution profile**: standard

## 목표

사용자에게 보이는 출력에서 내부 ADR 번호를 없애고, Dooray API 내부 용어를 사용자가 아는 말로 바꾼다.

**범위 외**: `getConfig` 의 상태 구분은 phase 01 이다.
동작을 바꾸지 않는다. 문구만 바꾼다.
주석의 ADR 번호는 그대로 둔다. 노출되지 않고 다음 구현자가 근거로 읽는다.

## 컨텍스트

**근거 문서**: `docs/adr/030-resolveproject-numeric-fallback.md`,
`docs/adr/028-member-group-response-shape.md`.

사용자 출력 문자열 중 ADR 번호를 담은 곳은 둘이다 (Issue #152).

| 위치 | 지금 문구 |
| --- | --- |
| `src/resolvers/project.ts` | `member=me 응답에 없는 프로젝트는 projectId (15+자리 numeric) 직접 입력으로 우회 가능 (ADR-030)` |
| `src/resolvers/member-group.ts` | `⚠ N개 그룹에 code 가 없어 매칭에서 제외했습니다 (ADR-028).` |

실제 위치는 grep 으로 다시 확인한다.

```bash
# cwd: <repo root>
grep -rn "ADR-[0-9]" src --include="*.ts" | grep -v "^\s*//" | grep -vE "^\S+:\s*(//|\*)"
```

주석이 아닌 자리만 대상이다. 나머지 마흔아홉 곳은 주석이라 노출되지 않는다.

`member=me` 도 같은 문제다. Dooray API 의 질의 파라미터 이름이라 CLI 사용자가 아는 개념이 아니다.

이슈가 제안한 문구는 이렇다.

```
오류: 프로젝트를 찾을 수 없습니다: <project-name>
  개인 프로젝트라면 캐시를 갱신하세요: dooray project list --type private
  목록에 없는 프로젝트는 projectId 를 직접 넣으면 됩니다 (15자리 이상 숫자)
```

**`plan059` 가 같은 파일을 건드린다.**
그 plan 의 phase 02 가 `src/resolvers/project.ts` 의 `PROJECT_ID_RE` 를 export 하고
`src/resolvers/wiki.ts` 가 그것을 가져다 쓴다.
줄이 다르므로 자동 머지가 되지만, 이 phase 를 실행할 때 그 export 가 이미 있는지 확인한다.
없으면 `plan059` 가 아직 머지되지 않은 것이고, 그래도 이 phase 는 진행할 수 있다.

## 의도 메모

- ADR 번호를 주석으로 옮기지 않는다. 이미 같은 파일의 주석에 근거가 적혀 있다.
  `src/resolvers/project.ts` 의 numeric 우회 분기에 `ADR-030` 주석이 있고
  `src/resolvers/member-group.ts` 의 필터 자리에 `ADR-028` 주석이 있다.
  출력에서 빼면 근거가 사라지는 것이 아니다.
- `15+자리 numeric` 을 `15자리 이상 숫자` 로 바꾼다. `numeric` 은 코드 용어다.
- `member=me 응답에 없는` 을 `목록에 없는` 으로 바꾼다. 사용자는 그 목록을 `dooray project list` 로 본다.
- `member-group.ts` 의 경고에서 번호만 뺀다. 몇 개가 왜 빠졌는지는 문장이 이미 말한다.
- 동작을 바꾸지 않는다. 종료 코드와 분기 조건을 손대지 않는다.

## 작업 항목

### 1. `src/resolvers/project.ts` 의 오류 문구를 고친다

`프로젝트를 찾을 수 없습니다` 를 던지는 자리다. 세 줄 중 뒤 둘을 고친다.

- 개인 프로젝트 안내는 명령을 문장 끝에 두는 형태로 바꾼다.
  `개인 프로젝트라면 캐시를 갱신하세요: dooray project list --type private` 로 한다.
- 우회 안내에서 `member=me 응답에 없는` 을 `목록에 없는` 으로,
  `(15+자리 numeric)` 을 `(15자리 이상 숫자)` 로 바꾸고 `(ADR-030)` 을 뺀다.
  `목록에 없는 프로젝트는 projectId 를 직접 넣으면 됩니다 (15자리 이상 숫자)` 로 한다.

첫 줄의 `프로젝트를 찾을 수 없습니다: <입력값>` 은 그대로 둔다.

같은 파일의 numeric 우회 분기에 있는 `ADR-030` 주석은 그대로 둔다.

### 2. `src/resolvers/member-group.ts` 의 경고 문구를 고친다

`⚠  N개 그룹에 code 가 없어 매칭에서 제외했습니다 (ADR-028).` 에서 `(ADR-028)` 을 뺀다.
두 번째 줄의 우회 안내는 그대로 둔다.

그 자리 위에 `// ADR 번호 정정: ADR-026 → ADR-028` 이라는 주석이 있다.
출력에서 번호를 빼면 그 주석이 가리키는 대상이 사라진다.
주석을 지우지 말고 무엇을 정정한 것인지 알 수 있게 다시 쓴다.
필터 근거가 ADR-028 이라는 뜻으로 남긴다.

### 3. 사용자 출력에 ADR 번호가 남지 않았는지 훑는다

```bash
# cwd: <repo root>
grep -rn "ADR-[0-9]" src --include="*.ts" | grep -viE "//|/\*|\*"
```

아무 줄도 나오지 않아야 한다. 나오면 그 자리도 고친다.
`.test.ts` 에서 문구를 검증하는 자리가 걸리면 함께 고친다.

API 내부 용어도 훑는다.

```bash
# cwd: <repo root>
grep -rnE "member=me|organizationMemberId|parentPageId|postNumber" src --include="*.ts" | grep -viE "//|/\*|\*" | head -20
```

사용자 출력 문자열에 있는 것만 대상이다.
함수 인자 이름과 타입 필드 이름은 코드이므로 바꾸지 않는다.
찾은 것과 그대로 둔 것을 각각 보고에 적는다.

### 4. `src/resolvers/project.test.ts` 와 `src/resolvers/member-group.test.ts` 에 문구 테스트를 더한다

기존 파일이 있으면 더하고 없으면 만든다.

`project` 쪽에서 확인할 것은 이렇다.

- 프로젝트를 찾지 못했을 때 오류 메시지에 `ADR` 이 들어가지 않는다.
- 그 메시지에 `member=me` 가 들어가지 않는다.
- 그 메시지에 `dooray project list --type private` 가 들어간다.
- 그 메시지에 `15자리 이상 숫자` 가 들어간다.
- 종료 코드가 `EXIT_PARAM_ERROR` 다.

`member-group` 쪽에서 확인할 것은 이렇다.

- code 가 없는 그룹이 있을 때 stderr 경고에 `ADR` 이 들어가지 않는다.
- 그 경고에 제외한 개수가 들어간다.

여러 줄 메시지를 정규식 하나로 이어 검사하지 않는다.
메시지에 각 문구가 들어 있는지를 따로 확인한다.

테스트 대상 파일 자체를 `vi.mock` 하지 않는다. 같은 파일 안의 함수 참조가 교체되지 않아 실제 구현이 불린다.

### 5. `docs/adr/INDEX.md` 에 ADR-049 를 등재한다

한 줄을 append 한다. 기존 줄을 고치지 않는다.
동시에 도는 다른 planning 과 같은 줄을 건드리지 않기 위해서다.

Issue #152 는 문구만 바꾸고 결정을 담지 않으므로 ADR 을 만들지 않는다.
되돌리는 비용이 낮고 시스템의 핵심 개념을 정하지 않는다.

### 6. `docs/flow.md` 와 `docs/data-schema.md` 의 config 서술을 phase 01 에 맞춘다

phase 01 이 `getConfig` 의 반환형을 바꿨다. 그 사실이 문서에 반영돼야 한다.

- `docs/data-schema.md` 의 config 절에 네 상태를 적는다.
  `absent`, `invalid`, `unreadable`, `ok` 이고 각각이 무엇을 뜻하는지 한 줄씩이다.
  ADR-049 를 가리킨다.
- `docs/flow.md` 의 캐시 흐름 절에 한 문장을 더한다.
  이전 설정을 읽지 못한 상태에서 설정을 바꾸면 캐시 전체를 지운다는 것이다.
  이전 계정을 알 수 없기 때문이라는 이유를 함께 적는다.

`docs/code-architecture.md` 의 `config/` 트리에 `store.ts` 설명이 있으면 반환형을 반영한다.

### 7. 문서와 검사를 이 phase 의 테스트로 돌린다

```bash
# cwd: <repo root>
pnpm test
bash scripts/check-pii.sh
bash scripts/check-public-refs.sh
bash ~/.claude/scripts/korean-style-check.sh docs/flow.md docs/data-schema.md docs/code-architecture.md docs/adr/INDEX.md
```

넷 다 종료 코드 0 이어야 한다.

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm run build
pnpm test
```

셋 다 통과해야 한다.

```bash
# cwd: <repo root>
pnpm vitest run src/resolvers/project.test.ts src/resolvers/member-group.test.ts
```

사용자 출력에 내부 참조가 남지 않았는지 확인한다.

```bash
# cwd: <repo root>
grep -rn "ADR-[0-9]" src --include="*.ts" | grep -viE "//|/\*|\*" | wc -l   # = 0
grep -rc "member=me" src/resolvers/project.ts                              # = 0
grep -c "15자리 이상 숫자" src/resolvers/project.ts                          # = 1
grep -c "ADR-028)" src/resolvers/member-group.ts                           # = 0
grep -c "ADR-049" docs/adr/INDEX.md                                        # = 1
```

다섯 기대값이 모두 맞아야 한다.

실제 출력으로 확인한다.

```bash
# cwd: <repo root>
node dist/index.js post list NONEXIST 2>&1 | grep -c "ADR"        # = 0
node dist/index.js post list NONEXIST 2>&1 | grep -c "member=me"  # = 0
node dist/index.js post list NONEXIST 2>&1 | grep -c "project list --type private"   # = 1
```

셋 다 기대값이 맞아야 한다. `NONEXIST` 는 `scripts/check-pii.sh` 의 `OK_PROJECTS` 에 있는 값이다.

## plan 완료 마킹

이 plan 의 마지막 phase 다. 위 검증을 모두 통과시킨 뒤 `index.json` 을 고치고,
**이 phase 의 단일 commit 에 그 변경을 함께 넣는다.** 별도 commit 이나 amend 로 미루지 않는다.

```bash
# cwd: <repo root>
PLAN=tasks/plan063-fix-config-read-and-error-wording
sed -i '' 's/"status": "pending"/"status": "completed"/g' $PLAN/index.json
sed -i '' 's/"current_phase": 1/"current_phase": 2/' $PLAN/index.json
grep -c '"status": "completed"' $PLAN/index.json     # = 3 (최상위 1 + phase 2)
grep -c '"current_phase": 2' $PLAN/index.json        # = 1
```

두 기대값이 맞아야 한다. `phases` 배열 항목에 `status` 키가 없으면 먼저 각 항목에 넣는다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/resolvers/project.ts` | 수정 |
| `src/resolvers/member-group.ts` | 수정 |
| `src/resolvers/project.test.ts` | 신규 또는 수정 |
| `src/resolvers/member-group.test.ts` | 수정 |
| `docs/adr/INDEX.md` | 수정 |
| `docs/data-schema.md` | 수정 |
| `docs/flow.md` | 수정 |
| `docs/code-architecture.md` | 수정 |
| `tasks/plan063-fix-config-read-and-error-wording/index.json` | 수정 |
