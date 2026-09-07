# Phase 03. post 입력 오류가 실제 실행 인자로 만든 완성 명령을 보여준다

**Execution profile**: deep

## 목표

post 입력 분류가 안내 오류를 던질 때, 실행된 인자에서 positional 을 빼고 `--id <postId>` 를 끼운
명령 한 줄을 보여준다. 그 줄을 복사해 붙이면 그대로 실행된다.

지금은 어떤 하위 명령에서 오류가 나도 `dooray post get --id <id>` 로 고정되어 있다.
실행한 명령이 무엇이었는지도, project 를 함께 빼야 한다는 것도, 원래 쓰던 옵션도 안내에 없다.

**범위 외**: 위키 쪽 `resolveWikiPageInput` 의 안내는 고치지 않는다.
`wiki list --search` 는 phase 01, `wiki page get` 은 phase 02 다. README 와 스킬 문서는 phase 04 다.
positional 에 온 postId 를 그대로 받아들이는 것은 하지 않는다. ADR-020 이 기각한 자동 인식이다.

## 컨텍스트

**근거 문서**: `docs/adr/044-post-input-error-completed-command.md`,
`docs/adr/020-post-input-unification-vitest.md` 의 「보강 (Issue #82/#83, 2026-06)」 절,
`docs/code-architecture.md` 의 `utils/` 트리.

사용자가 실제로 겪은 왕복이다.

```
$ dooray post comment add <project> <internal-id> --body-file ./body.md
오류: "<internal-id>" 는 내부 ID(postId)로 보입니다.
업무 번호(#N)가 아닌 내부 ID 로 조회하려면 --id 옵션을 사용하세요:
  dooray post get --id <internal-id>

$ dooray post comment add <project> --id <internal-id> --body-file ./body.md
오류: --id/--url과 positional 인자(<project> <post-number>)는 동시에 사용할 수 없습니다.
```

현재 상태는 이렇다.

- `src/resolvers/post-input.ts` 의 `resolvePostInput(client, args)` 가 입력 분기를 소유한다.
  `PostInputArgs` 는 `projectArg`, `postNumberArg`, `idOpt`, `urlOpt` 넷을 받는다.
- 안내 오류가 나오는 자리가 셋이다.
  `--id` 에 업무 번호가 온 경우, `--id` 에 URL 이 온 경우, positional 두 번째에 postId 가 온 경우다.
  세 곳 모두 `dooray post get` 을 문자열로 박아 두었다.
- `classifyPostInputToken` 이 토큰을 `postId`(15자리 이상 numeric), `postNumber`, `url`, `project` 로 나눈다.
- `resolvePostInput` 을 부르는 파일이 `src/commands` 아래 18개다.
  그중 `src/commands/delete-confirmation-policy.test.ts` 와 `src/commands/post/edit.test.ts` 는 테스트라 명령 파일은 16개다.
  16개는 이렇다. `post/comment/` 의 `add.ts`, `delete.ts`, `edit.ts`, `get.ts`, `latest.ts`, `list.ts`,
  `post/` 의 `create.ts`, `done.ts`, `edit.ts`, `get.ts`, `workflow.ts`,
  `post/file/` 의 `delete.ts`, `download-all.ts`, `download.ts`, `list.ts`, `upload.ts` 다.
- `src/utils/argv-sanitize.ts` 가 이미 argv 를 다루는 순수 함수다. 새 함수를 그 옆에 둔다.

ADR-020 의 방향은 유지한다. 그 ADR 은 positional numeric 을 postId 로 자동 인식하는 것을 두 번 기각했다.
15자리 임계가 임의값이라 ID 체계가 바뀌면 자동 인식만 틀리고 `--id` 명시 경로는 영향받지 않는다는 것이 근거다.
따라서 이 오류는 없앨 대상이 아니고 안내의 완성도만 올린다.

**미머지 plan 과의 관계**: `plan056-fix-mail-get-input` 이 원격에 머지되지 않은 채 남아 있고
`docs/adr/040-mail-url-to-uid-lookup.md` 를 갖고 있다. 이 plan 이 쓰는 043 과 044 와 번호가 겹치지 않는다.
다만 그 브랜치가 `docs/adr/INDEX.md` 와 `CLAUDE.md` 와 `docs/flow.md` 와 `skills/dooray-cli/SKILL.md` 를 함께 건드린다.
rebase 나 머지에서 부딪히면 **이 plan 쪽을 final 로 본다.** plan056 은 mail 영역이고 이 plan 은 위키와 post 영역이라 내용이 겹치지 않는다.
같은 파일의 다른 줄이므로 양쪽을 모두 살린다.

## 의도 메모

- 옵션을 다시 조립하지 않는다. `post comment add` 만 해도 `--body`, `--body-file`, `--mention`,
  `--mention-group`, `--link-task`, `--dry-run` 을 받고 명령마다 목록이 다르다.
  조립 코드를 두면 옵션이 늘 때마다 그곳도 고쳐야 하고, 잊으면 안내에서 옵션이 빠진다.
- 호출부가 명령 이름을 문자열로 넘기는 방식을 기각했다. 명령 이름이 바뀌면 문자열이 갈라지고 검사가 잡지 못한다.
  실행된 argv 를 넘기면 명령 이름이 그 안에 이미 들어 있다.
- 안내를 `[나머지 옵션은 그대로]` 로 줄이는 것을 기각했다. 복사해 바로 실행할 수 없어 왕복이 남는다.
- 여러 줄 오류 메시지를 테스트할 때 `.toThrow(/A.*B/)` 를 쓰지 않는다.
  메시지에 줄바꿈이 있어 `.` 가 그것을 넘지 못해 테스트가 항상 실패한다.
  `s` 플래그를 붙이거나 `expect(err.message).toContain(...)` 을 각각 확인한다.

## Blocked 조건

- `grep -rln "resolvePostInput" src/commands` 결과가 비면 `PHASE_BLOCKED: resolvePostInput 호출부를 찾지 못했다` 를 출력하고 멈춘다.

## 작업 항목

### 1. `src/utils/command-hint.ts` 를 새로 만든다

순수 함수 둘을 export 한다. 외부 상태를 읽지 않는다.

```ts
export function shellQuote(token: string): string;
export function buildIdModeCommand(argv: string[], positionals: string[], postId: string): string;
```

`shellQuote` 는 이렇게 판정한다.

- 토큰이 `/^[A-Za-z0-9._\/:@=-]+$/` 에만 해당하면 그대로 돌려준다.
- 그렇지 않으면 단일 인용부호로 감싸고, 토큰 안의 단일 인용부호는 `'\''` 로 바꾼다.

`buildIdModeCommand` 는 이렇게 만든다.

- `argv` 를 앞에서부터 훑는다. `--` 로 시작하는 토큰을 만나면 그 토큰과 **다음 토큰**을 그대로 유지하고 두 칸 건너뛴다.
  이것이 옵션 값을 positional 로 착각하지 않게 하는 장치다. `--body-file 337` 처럼 옵션 값이 업무 번호와 같을 수 있다.
- `--` 로 시작하지 않는 토큰은 `positionals` 에 있는 값과 비교한다.
  일치하면 결과에서 빼고 그 값을 `positionals` 에서도 하나 지운다. 같은 값이 두 번 와도 한 번만 지운다.
  일치하지 않으면 결과에 남긴다. 하위 명령 이름이 이 경로로 살아남는다.
- `=` 를 포함한 `--opt=value` 형태는 한 토큰으로 보고 다음 토큰을 건너뛰지 않는다.
- 남은 토큰 뒤에 `--id` 와 `postId` 를 붙인다.
- 각 토큰에 `shellQuote` 를 적용해 공백 하나로 이어 붙이고, 앞에 `dooray ` 를 붙여 돌려준다.

### 2. `src/resolvers/post-input.ts` 가 argv 를 받아 안내에 쓴다

`PostInputArgs` 에 `argv?: string[]` 를 더한다. 실행된 인자 배열이고 `process.argv.slice(2)` 값이다.

안내 오류 세 곳을 고친다. 각 자리에서 `buildIdModeCommand` 로 만든 한 줄을 보여준다.

- positional 두 번째가 postId 인 경우:
  `positionals` 는 `[projectArg, postNumberArg]` 중 값이 있는 것들이고, `postId` 는 `postNumberArg` 다.
- `--id` 에 업무 번호가 온 경우: 지금 문구를 유지한다. 이 경우는 `--id` 를 빼고 positional 로 가야 하므로 완성 명령의 방향이 반대다.
- `--id` 에 URL 이 온 경우: 지금 문구를 유지한다. 같은 이유다.

positional 두 번째가 postId 인 경우의 문구는 이렇다.

```
"<입력값>" 는 내부 ID(postId)로 보입니다.
업무 번호(#N)가 아닌 내부 ID 로 지정하려면 <project> 를 빼고 --id 를 씁니다:
  <완성 명령>
```

`argv` 가 주어지지 않았으면 완성 명령을 만들지 않고 지금 문구를 그대로 쓴다.
테스트가 `argv` 없이 `resolvePostInput` 을 부르는 기존 경로를 깨지 않기 위해서다.

### 3. `resolvePostInput` 호출부 전부가 `argv` 를 넘긴다

위 컨텍스트에 적은 명령 파일 16개를 고친다. 테스트 파일 둘은 고치지 않는다.
`src/resolvers/task-link.ts` 와 `src/resolvers/comment-file-input.ts` 도 `resolvePostInput` 을 부르므로 함께 본다.

각 호출부에서 `resolvePostInput(client, { ..., argv: process.argv.slice(2) })` 로 인자 하나를 더한다.
다른 인자는 그대로 둔다.

`src/resolvers/task-link.ts` 와 `src/resolvers/comment-file-input.ts` 는 명령이 아니라 resolver 다.
그 둘은 `argv` 를 넘기지 않는다. 그 경로의 오류는 사용자가 친 명령과 대응하지 않는다.

### 4. `src/utils/command-hint.test.ts` 를 새로 만든다

- `post comment add <project> <postId> --body-file ./body.md` 에서
  `dooray post comment add --body-file ./body.md --id <postId>` 가 나온다.
- 옵션 값이 positional 과 같은 문자열인 경우를 본다.
  `post get my-project 337 --body-file 337` 에서 `--body-file 337` 이 유지되고 positional `337` 만 빠진다.
- `--opt=value` 형태가 한 토큰으로 유지된다.
- 공백이 든 값이 단일 인용부호로 감싸진다.
- 단일 인용부호가 든 값이 `'\''` 로 바뀐다.
- positional 이 하나뿐인 경우에도 동작한다.
- `positionals` 에 없는 비옵션 토큰(하위 명령 이름)이 결과에 남는다.

### 5. `src/resolvers/post-input.test.ts` 에 안내 문구 테스트를 더한다

기존 파일에 더한다.

- `argv` 를 주고 positional 두 번째에 postId 를 넣으면, 오류 메시지에 실행한 하위 명령 이름이 들어간다.
- 그 메시지에 `--body-file` 처럼 사용자가 준 옵션이 유지된다.
- 그 메시지에 project 값이 남아 있지 않다.
- `argv` 를 주지 않으면 기존 문구가 그대로 나온다.
- 종료 코드가 `EXIT_PARAM_ERROR` 다.

postId 자리에는 `scripts/check-pii.sh` 의 `OK_IDS` 에 있는 값을 쓴다.

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm run build
pnpm test
```

셋 다 통과해야 한다. 이 phase 의 테스트를 따로 돌린다.

```bash
# cwd: <repo root>
pnpm vitest run src/utils/command-hint.test.ts src/resolvers/post-input.test.ts
```

호출부를 빠뜨리지 않았는지 확인한다.

```bash
# cwd: <repo root>
# resolvePostInput 을 부르는 명령 파일 수
grep -rln "resolvePostInput" src/commands | wc -l

# 그중 argv 를 넘기는 파일 수. 위와 같아야 한다
grep -rln "argv: process.argv.slice(2)" src/commands | wc -l
```

첫 수는 18, 둘째 수는 16 이어야 한다. 차이 둘은 테스트 파일이다.

안내가 실제로 완성 명령을 담는지 실행 결과로 판정한다.

```bash
# cwd: <repo root>
OUT=$(node dist/index.js post comment add my-project 1234567890123456789 --body-file ./x.md 2>&1); CODE=$?
echo "$OUT" | grep -c "dooray post comment add"      # = 1
echo "$OUT" | grep -c -- "--body-file ./x.md"        # = 1
echo "$OUT" | grep -c -- "--id 1234567890123456789"  # = 1
echo "$OUT" | grep -c "add my-project"                     # = 0
echo "$CODE"                                          # = 3
```

다섯 기대값이 모두 맞아야 한다. `grep -c "add my-project"` 가 0 이 아니면 project 값이 안내에 남아 있다.

개인 식별 정보 검사를 통과시킨다.

```bash
# cwd: <repo root>
bash scripts/check-pii.sh
```

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/utils/command-hint.ts` | 신규 |
| `src/utils/command-hint.test.ts` | 신규 |
| `src/resolvers/post-input.ts` | 수정 |
| `src/resolvers/post-input.test.ts` | 수정 |
| `src/commands/post/**` 의 `resolvePostInput` 호출부 | 수정 |
