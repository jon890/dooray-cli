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

출력 세 모드를 모두 채운다.

| 모드 | 출력 |
| --- | --- |
| 기본 | 사람이 읽는 한 줄. 만든 태그 이름과 id |
| `--json` | `{ "id": "<tagId>", "name": "<입력한 name>", "color": "<정규화된 color>" }` |
| `--quiet` | `<tagId>` 한 줄만 |

`--quiet` 에서 id 를 반드시 낸다. 후속 명령으로 파이프하는 진입점이다.
회피 항목은 `docs/pitfalls/code-review/quiet-mode-missing-identifier.md` 다.

스피너는 검증과 정규화가 모두 끝난 뒤에 시작한다.
`--name` 검증과 `normalizeTagColor` 를 `startSpinner` 앞에 둔다.
회피 항목은 `docs/pitfalls/code-review/spinner-before-validation.md` 다.
파라미터 오류가 스피너 애니메이션과 섞여 나오는 것을 막는다.

같은 디렉터리의 `groups.ts` 와 `tags.ts` 가 `optsWithGlobals`, `getConfigOrThrow`, `DoorayApiClient`,
`startSpinner`, `stopSpinner`, `output` 을 쓰는 방식을 그대로 따른다.

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
3. `list` 하위 명령을 등록해 같은 `runTagsList` 를 호출한다.

**여기서 실측이 필요하다.** Commander 는 하위 명령을 가진 command 에도 argument 와 action 을 둘 수 있지만,
첫 positional 이 등록된 하위 명령 이름과 겹칠 때의 라우팅을 코드만 보고 단정하지 않는다.
빌드한 뒤 아래 넷을 실제로 실행해 확인한다.

```bash
# cwd: <repo root>
pnpm run build
node dist/index.js project tags --help
node dist/index.js project tags create --help
node dist/index.js project tags group --help
node dist/index.js project tags list --help
```

네 명령의 도움말이 각각 제대로 나와야 한다.

기존 형태와 하위 명령 형태가 함께 동작하지 않으면, 억지로 우회하지 말고 멈추고 보고한다.
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

---

## Critical Files

| 파일 | 변경 |
| --- | --- |
| `src/commands/project/tags.ts` | 수정 |
| `src/commands/project/tags-create.ts` | 신규 |
| `src/commands/project/tags-group.ts` | 신규 |
| `src/index.ts` | 수정 |

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
- 명령이 API 클라이언트와 캐시를 직접 부르지 않는 이유는 캐시 무효화를 잊을 수 있는 자리를
  없애기 위해서다. 두 함수를 부르는 것 말고는 선택지가 없어야 한다.
