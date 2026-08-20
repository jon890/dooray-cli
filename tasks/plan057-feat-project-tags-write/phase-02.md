# Phase 02: tags 그룹 명령 전환과 create·group 명령 구현

**Execution profile**: standard

---

## 목표

`project tags` 를 하위 명령을 갖는 그룹 명령으로 바꾸고, 태그 생성과 태그 그룹 속성 변경 명령을 만든다.
사용자에게 보이는 변화가 이 phase 에서 생긴다.

phase-01 이 만든 표면을 전제한다. 아래가 없으면 phase-01 이 끝나지 않은 것이므로 멈추고 보고한다.

- `src/resolvers/tag.ts` 의 `resolveTagGroup` (읽기: 그룹 이름을 groupId 로)
- `src/services/tag.ts` 의 `createTag`, `updateTagGroup` (쓰기: API 호출 후 캐시 무효화)

이 명령들은 `src/api/client.ts` 와 `src/cache/store.ts` 를 직접 부르지 않는다.
API 호출과 캐시 무효화가 `src/services/tag.ts` 안에 이미 묶여 있다.
근거는 `docs/adr/042-cache-invalidation-on-mutation.md` 다.

설계 근거는 `docs/adr/041-project-tag-write-scope.md` 다. 작업 전에 읽는다.
사용자 흐름은 `docs/flow.md` 의 "프로젝트 태그 관리 흐름" 절에 이미 확정되어 있다. 그 문서와 어긋나게 만들지 않는다.

**범위 외**:

- 단위 테스트 작성은 phase-03 이다.
- 태그 이름·색상 수정 명령과 태그 삭제 명령은 만들지 않는다. 공식 API 에 경로가 없다.
- 태그 단건 조회 명령(`GET .../tags/{tag-id}`)도 만들지 않는다. 목록이 같은 필드를 모두 준다.

---

## 작업 항목 (5)

### 1. 색상 정규화 helper

`src/commands/project/tags-create.ts` 안에 export 된 순수 함수로 둔다.
phase-03 이 이 함수를 직접 테스트하므로 파일 밖으로 노출해야 한다.

```typescript
export function normalizeTagColor(input: string | undefined): string
```

동작은 다음과 같다.

- `undefined` 이거나 trim 후 빈 문자열이면 `"e0e0e0"` 을 반환한다.
- 앞에 붙은 `#` 을 하나 벗긴다.
- 남은 값이 6자리 hex(`/^[0-9a-fA-F]{6}$/`)가 아니면 `DoorayCliError` 를 `EXIT_PARAM_ERROR` 로 던진다.
  메시지에 입력받은 원본 값과 기대 형식을 함께 담는다.
- 통과하면 소문자로 바꿔 반환한다.

기본값이 `e0e0e0` 인 이유는 공식 문서 예시의 `ffffff` 가 흰 배경과 구분되지 않기 때문이다.

### 2. 태그 생성 명령 (`src/commands/project/tags-create.ts`)

```
dooray project tags create <project> --name "<그룹>:<태그>" [--color <hex>]
```

- `--name` 은 필수다. 없으면 `EXIT_PARAM_ERROR` 로 끝낸다.
- `--name` 은 trim 후 빈 값이면 거부한다.
- `--name` 값을 API 에 그대로 보낸다. CLI 가 `:` 를 파싱해 그룹과 태그로 쪼개지 않는다.
  그룹 해석은 서버가 한다. `"그룹:태그"` 와 `"태그"` 둘 다 서버가 받는 형식이다.
- `resolveProject` 로 projectId 를 얻고 `createTag(client, projectId, { name, color })` 를 호출한다.
  반환값이 만들어진 태그 id 다.
- 캐시 무효화는 `createTag` 안에서 일어난다. 명령이 `clearTags` 를 따로 부르지 않는다.

**옵션을 어느 객체에서 읽는지가 여기서 갈린다.**

- `--name` 과 `--color` 는 이 명령의 `opts()` 로 읽는다.
- `--json` 과 `--quiet` 는 `optsWithGlobals()` 로 읽는다.

`optsWithGlobals()` 를 `--color` 에 쓰면 값이 조용히 버려진다.
`src/index.ts:65` 에 전역 `--no-color` 가 있고, Commander 가 조상 옵션을 자식 위에 덮어쓰기 때문이다.
worktree 에서 재현한 결과는 이렇다.

| 입력 | `opts()` | `optsWithGlobals()` |
| --- | --- | --- |
| `--name a` | `{name:"a"}` | `{name:"a", color:true}` |
| `--name a --color c6eab3` | `{name:"a", color:"c6eab3"}` | `{name:"a", color:true}` |

그대로 두면 `normalizeTagColor(true)` 가 불려 boolean 에 `.trim()` 을 호출하다 런타임 예외가 난다.
옵션 이름을 `--tag-color` 로 바꾸는 대안은 쓰지 않는다.
`README.md`, `docs/flow.md`, `skills/dooray-cli/SKILL.md` 가 이미 `--color` 로 적고 있다.

출력 세 모드를 모두 채운다.

| 모드 | 출력 |
| --- | --- |
| 기본 | 사람이 읽는 한 줄. 만든 태그 이름과 id |
| `--json` | `{ "id": "<tagId>", "name": "<입력한 name>", "color": "<정규화된 color>" }` |
| `--quiet` | `<tagId>` 한 줄만 |

`--quiet` 에서 id 를 반드시 낸다. 후속 명령으로 파이프하는 진입점이다.
회피 항목은 `docs/pitfalls/code-review/quiet-mode-missing-identifier.md` 다.

**`formatters/table.ts` 의 `output()` 을 쓰지 않는다.** 그 helper 는 `raw: unknown[]` 을 받아 배열을 그대로 내므로
`--json` 이 `[{...}]` 가 된다. 이 명령의 `--json` 은 단일 객체다.
단건 생성의 선례는 `src/commands/post/create.ts:241-247` 이고, `printJson` 과 `process.stdout.write` 를 직접 쓴다.
`src/commands/wiki/page-create.ts` 도 같다. 두 새 명령 모두 그 형태를 따른다.

스피너는 검증과 정규화가 모두 끝난 뒤에 시작한다.
`--name` 검증과 `normalizeTagColor` 를 `startSpinner` 앞에 둔다.
회피 항목은 `docs/pitfalls/code-review/spinner-before-validation.md` 다.
파라미터 오류가 스피너 애니메이션과 섞여 나오는 것을 막는다.

스피너를 켠 뒤의 외부 호출은 `try`/`catch` 로 감싸고 `catch` 에서 `stopSpinner(false, ...)` 후 다시 던진다.
`resolveProject`, `resolveTagGroup`, `createTag`, `updateTagGroup` 이 모두 여기 해당한다.
회피 항목은 `docs/pitfalls/code-review/spinner-missing-try-catch.md` 다.
기존 `tags.ts` 에는 이 처리가 없다. 그 파일을 따라 쓰면 새 코드에 같은 누락이 들어간다.

같은 디렉터리의 `groups.ts` 와 `tags.ts` 가 `getConfigOrThrow`, `DoorayApiClient`,
`startSpinner`, `stopSpinner` 를 쓰는 방식을 그대로 따른다.
`optsWithGlobals` 와 `output` 은 따르지 않는다. 위 두 절이 그 둘을 각각 좁히고 금지한다.

### 3. 태그 그룹 속성 변경 명령 (`src/commands/project/tags-group.ts`)

```
dooray project tags group <project> <그룹> [--mandatory] [--no-mandatory] [--select-one] [--no-select-one]
```

- `<그룹>` 은 그룹 이름이고 `resolveTagGroup` 으로 해석한다.
- 네 옵션이 모두 없으면 바꿀 것이 없으므로 `EXIT_PARAM_ERROR` 로 끝낸다.
  API 를 호출하지 않고, 무엇을 지정해야 하는지 안내한다.
- 지정하지 않은 쪽은 `resolveTagGroup` 이 돌려준 현재 값을 그대로 실어 보낸다.
  `PUT tag-groups` 가 `mandatory` 와 `selectOne` 을 함께 받으므로, 병합하지 않으면 지정하지 않은 쪽이 초기화된다.
- `updateTagGroup(client, projectId, group.id, { mandatory, selectOne })` 를 호출한다.
- 캐시 무효화는 그 함수 안에서 일어난다. 명령이 `clearTags` 를 따로 부르지 않는다.

Commander 의 `--no-` 접두는 같은 이름 옵션의 기본값을 뒤집는다.
`--mandatory` 와 `--no-mandatory` 를 함께 등록할 때 지정 여부를 구분할 수 있어야 한다.
`opts()` 의 값이 `undefined` 인지로 판별하고, 기본값을 주는 형태로 등록하지 않는다.
등록 방식을 정한 뒤 실제로 네 조합을 실행해 지정 여부 판별이 맞는지 확인한다.

출력 세 모드를 모두 채운다.

| 모드 | 출력 |
| --- | --- |
| 기본 | 그룹 이름과 바뀐 뒤의 두 속성값 |
| `--json` | `{ "id": "<groupId>", "name": "<그룹명>", "mandatory": <bool>, "selectOne": <bool> }` |
| `--quiet` | `<groupId>` 한 줄만 |

`PUT` 응답의 `result` 가 `null` 이라 서버가 바뀐 값을 돌려주지 않는다.
그래서 출력은 요청에 실어 보낸 값으로 구성한다. 별도 재조회를 하지 않는다.

### 4. tags 명령을 그룹 명령으로 전환 (`src/commands/project/tags.ts`)

기존 `dooray project tags <project>` 호출이 그대로 동작해야 한다.
이미 `README.md` 와 `skills/dooray-cli/SKILL.md` 에 실려 있어 사용자 스크립트가 쓰고 있다.

목록 조회 동작을 두 경로에서 쓸 수 있게 만든다.

- `dooray project tags <project>`: 인자를 직접 받는 기존 형태
- `dooray project tags list <project>`: 하위 명령 형태

구현 방향은 다음과 같다.

1. 현재 `.action()` 안의 목록 조회 로직을 같은 파일의 함수로 뽑는다.
   예를 들어 `async function runTagsList(project: string, opts: OutputOptions): Promise<void>` 형태다.
2. `projectTagsCommand` 를 그룹 명령으로 두고 `.argument("[project]", ...)` 와 `.action()` 을 함께 등록한다.
   `project` 가 주어지면 `runTagsList` 를 호출하고, 없으면 도움말을 출력한다.
3. `list` 하위 명령을 `projectTagsListCommand` 라는 이름으로 만들어 같은 `runTagsList` 를 호출하고 `export` 한다.
   `tags.ts` 안에서 `addCommand` 하지 않는다. 등록은 아래 5번 항목이 `src/index.ts` 에서 한 곳에 모아 한다.

`runTagsList` 의 두 번째 인자로 넘길 `OutputOptions` 는 **그 경로를 탄 command 객체의 `optsWithGlobals()`** 다.
부모 경로는 `projectTagsCommand.optsWithGlobals()`, `list` 경로는 `projectTagsListCommand.optsWithGlobals()` 다.
현재 `tags.ts:14` 는 클로저로 `projectTagsCommand` 를 직접 참조한다. 그대로 두면 `list` 경로에서 어긋난다.

**실측은 team-lead 가 이미 끝냈다.** worktree 에서 같은 구조를 조립해 넷을 모두 확인했다.

| 입력 | 라우팅 |
| --- | --- |
| `project tags my-project` | 부모 action 이 받아 목록 경로 |
| `project tags list my-project` | `list` 하위 명령 |
| `project tags create my-project --name x:y` | `create` 하위 명령 |
| `project tags group my-project "배포환경"` | `group` 하위 명령 |
| `project tags` (인자 없음) | 부모 action 이 `project === undefined` 로 진입 |

구현 후 빌드해서 아래 넷을 다시 실행해 실제 번들에서도 같은지 확인한다.

```bash
# cwd: <repo root>
pnpm run build
node dist/index.js project tags --help
node dist/index.js project tags create --help
node dist/index.js project tags group --help
node dist/index.js project tags list --help
```

네 명령의 도움말이 각각 제대로 나와야 한다.

실측 결과가 뒤집혀 두 형태가 함께 동작하지 않으면, 억지로 우회하지 말고 멈추고 보고한다.
그 경우의 대안은 `project tags` 를 지금의 leaf 명령으로 되돌리고
새 명령을 `project tag-create` 와 `project tag-group` 이라는 별개 이름으로 두는 것이다.
이 대안을 고르면 `README.md`, `docs/flow.md`, `skills/dooray-cli/SKILL.md` 의 명령 표기도 함께 고쳐야 하므로
직접 결정하지 말고 보고한다.

### 5. 명령 등록 (`src/index.ts`)

`projectTagsCommand` 아래에 두 하위 명령을 붙인다.
`wikiPageCommand` 가 하위 명령을 붙이는 방식과 같은 위치에 같은 형태로 쓴다.

```typescript
projectTagsCommand.addCommand(projectTagsListCommand);
projectTagsCommand.addCommand(projectTagsCreateCommand);
projectTagsCommand.addCommand(projectTagsGroupCommand);
```

`projectCommand.addCommand(projectTagsCommand)` 는 이미 있다. 중복으로 추가하지 않는다.

### 6. README 의 프로젝트 구조에 `services/` 를 반영 (`README.md`)

`docs/code-architecture.md` 는 이미 `services/` 를 담고 있는데 `README.md` 의 "프로젝트 구조" 절은 아직 아니다.
두 문서가 어긋난 채로 두면 docs-verifier 단계에서 되돌아온다.

- 코드 블록의 `resolvers/` 줄 아래에 `services/` 한 줄을 넣는다.
  설명은 "API 를 호출해 상태를 바꾸고 그 엔티티의 캐시를 지우는 계층" 으로 한다.
- 그 아래 "의존 방향은 `api/` → `resolvers/` → `commands/` → `formatters/` 다" 문장을
  `services/` 가 들어간 형태로 고친다. `services/` 는 `api/` 와 `cache/` 에 의존하고 `resolvers/` 에는 의존하지 않는다.
  둘을 조합하는 것은 `commands/` 다.

`docs/code-architecture.md` 의 해당 문장을 먼저 읽고 그 표현과 어긋나지 않게 쓴다.
`README.md` 는 공개 문서이므로 `ADR-041` 같은 내부 참조 번호를 넣지 않는다.

---

## Critical Files

| 파일 | 변경 |
| --- | --- |
| `src/commands/project/tags.ts` | 수정 |
| `src/commands/project/tags-create.ts` | 신규 |
| `src/commands/project/tags-group.ts` | 신규 |
| `src/index.ts` | 수정 |
| `README.md` | 수정 |

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm run build
pnpm test
```

셋 모두 통과해야 한다.

도움말 네 개가 나오는지 확인한다.

```bash
# cwd: <repo root>
node dist/index.js project tags --help
node dist/index.js project tags list --help
node dist/index.js project tags create --help
node dist/index.js project tags group --help
```

세 출력 모드가 모두 채워졌는지 확인한다. 아래 grep 이 두 파일 모두에서 결과를 내야 한다.

```bash
# cwd: <repo root>
grep -n "quiet" src/commands/project/tags-create.ts src/commands/project/tags-group.ts
```

명령이 캐시와 API 클라이언트를 직접 부르지 않는지 확인한다. 아래 출력이 없어야 한다.

```bash
# cwd: <repo root>
grep -n "clearTags\|createProjectTag\|updateProjectTagGroup" \
  src/commands/project/tags-create.ts src/commands/project/tags-group.ts
```

회피 항목은 `docs/pitfalls/code-review/mutation-without-cache-invalidation.md` 다.

`--color` 를 `optsWithGlobals()` 로 읽지 않는지 확인한다. 아래 두 grep 이 **결과를 내지 않아야** 한다.

```bash
# cwd: <repo root>
grep -nE "optsWithGlobals\(\)[^;]*\.(color|name)" src/commands/project/tags-create.ts
grep -nE "\.(color|name)[^;]*optsWithGlobals\(\)" src/commands/project/tags-create.ts
```

눈으로 대조하는 검증은 쓰지 않는다. 회피 항목은 `docs/pitfalls/plan/manual-eyeball-verification.md` 다.

`README.md` 가 `services/` 를 담는지 확인한다. 두 grep 이 모두 결과를 내야 한다.

```bash
# cwd: <repo root>
grep -n "services/" README.md
grep -n "services" docs/code-architecture.md | head -3
```

스피너가 검증 뒤에 오는지 확인한다. 각 파일에서 `startSpinner` 가 파라미터 검증보다 아래에 있어야 한다.

```bash
# cwd: <repo root>
grep -n "startSpinner\|EXIT_PARAM_ERROR\|normalizeTagColor" \
  src/commands/project/tags-create.ts src/commands/project/tags-group.ts
```

공개 문서 검사를 통과해야 한다.

```bash
# cwd: <repo root>
bash scripts/check-public-refs.sh
bash scripts/check-pii.sh
```

## 의도 메모

- `--name` 을 CLI 가 파싱하지 않는 이유는 `"그룹:태그"` 해석이 서버 몫이기 때문이다.
  CLI 가 쪼개서 다시 합치면 이스케이프 규칙을 CLI 가 떠안게 되고, 서버 규칙이 바뀌면 어긋난다.
- 그룹 속성을 병합해 보내는 이유는 `PUT tag-groups` 가 두 필드를 함께 받기 때문이다.
  `post edit` 이 제목·본문을 다시 실어 보내는 것과 같은 이유다.
- `--name` 반복 허용을 기각했다. API 가 단건만 받아 CLI 가 순차 호출하게 되고,
  중간 실패 시 어디까지 만들어졌는지를 따로 알려야 한다. 명령 하나가 호출 하나에 대응하는 편이 단순하다.
- 기존 `project tags <project>` 를 남기는 이유는 그 형태가 공개 문서에 이미 실려 있어서다.
  하위 명령만 남기면 사용자 스크립트가 조용히 깨진다.
- 이 라우팅에는 대가가 하나 있다. 프로젝트 코드가 `list`, `create`, `group` 중 하나와 같으면
  그 인자가 하위 명령으로 먹혀 목록이 아니라 그 명령으로 간다.
  Dooray 프로젝트 코드가 이 세 낱말과 같을 확률이 낮아 그대로 둔다.
  피하려면 하위 명령 이름을 프로젝트 코드가 될 수 없는 형태로 바꿔야 하는데, 공개 문서가 이미 이 이름으로 적혀 있다.
- 명령이 API 클라이언트와 캐시를 직접 부르지 않는 이유는 캐시 무효화를 잊을 수 있는 자리를
  없애기 위해서다. 두 함수를 부르는 것 말고는 선택지가 없어야 한다.
