# Phase 01: API 메서드·타입·캐시 무효화·그룹 resolver

**Execution profile**: standard

---

## 목표

프로젝트 태그를 만들고 태그 그룹 속성을 바꾸는 데 필요한 하부 계층을 만든다.
명령 계층은 phase-02 가 이 계층을 호출하므로, 이 phase 만으로는 사용자에게 보이는 변화가 없다.

배경은 GitHub Issue #146 이다.
태그를 업무에 붙이는 일은 `post edit --tag` 로 되지만, 붙일 태그를 만드는 단계만 웹 설정 화면에 남아 있었다.
설계 근거와 지원 범위 한정 이유는 `docs/adr/041-project-tag-write-scope.md` 에 있다.
캐시 무효화를 어느 계열이 맡는지는 `docs/adr/042-cache-invalidation-on-mutation.md` 가 소유한다.
둘 다 작업 전에 읽는다.

**범위 외**:

- 명령 파일 작성과 `src/index.ts` 등록은 phase-02 다.
- 단위 테스트 작성은 phase-03 이다.
- 태그 이름·색상 수정과 태그 삭제는 공식 API 에 경로가 없어 이 plan 전체의 범위 밖이다. 만들지 않는다.

---

## 작업 항목 (5)

### 1. 요청·응답 타입 추가 (`src/api/types.ts`)

기존 `TagListResponse` 정의 아래에 이어서 넣는다.

```typescript
export interface CreateTagRequest {
  name: string;
  color: string;
}

export interface CreateTagApiResponse {
  header: DoorayApiHeader;
  result: { id: string };
}

export interface UpdateTagGroupRequest {
  mandatory: boolean;
  selectOne: boolean;
}

export type UpdateTagGroupResponse = DoorayApiUnitResponse;
```

`DoorayApiUnitResponse` 는 같은 파일 19번째 줄에 이미 있다. 새로 만들지 않고 그대로 쓴다.
`PUT tag-groups` 응답의 `result` 는 `null` 이라 이 타입이 맞다.
`UpdatePostResponse` 가 같은 방식으로 별칭을 만든 선례다.

### 2. 메서드 두 개 추가 (`src/api/client.ts`)

`getProjectTags` 바로 아래, `// ─── Member Groups ───` 주석 앞에 넣는다.

```typescript
async createProjectTag(projectId: string, body: CreateTagRequest): Promise<CreateTagApiResponse>
async updateProjectTagGroup(projectId: string, tagGroupId: string, body: UpdateTagGroupRequest): Promise<UpdateTagGroupResponse>
```

경로는 각각 다음과 같다. 공식 API 문서에서 확인한 값이다.

- `POST project/v1/projects/{projectId}/tags`
- `PUT project/v1/projects/{projectId}/tag-groups/{tagGroupId}`

본문 구현은 같은 파일의 `createPost` 와 `updatePost` 패턴을 그대로 따른다.
`this.api.post(...).json<T>()` 형태이고, `catch (e)` 에서 `throw await toDoorayCliError(e)` 로 감싼다.
`ky` 인스턴스를 우회해 직접 `fetch` 를 쓰지 않는다.
회피 항목은 `docs/pitfalls/code-review/non-ky-http-client.md` 다. HTTP 호출은 `ky` 인스턴스만 쓴다.

### 3. 태그 캐시 무효화 함수 (`src/cache/store.ts`)

`setTags` 아래에 추가한다.

```typescript
export async function clearTags(projectId: string): Promise<void>
```

`tagsPath(projectId)` 파일을 지운다. 파일이 없으면 오류를 내지 않고 조용히 끝낸다.
같은 파일에 이미 파일 삭제를 하는 코드가 있으면 그 방식을 따른다.
없으면 `node:fs/promises` 의 `rm` 을 `{ force: true }` 로 호출한다.

무효화가 필요한 이유는 `TAGS_TTL_MS` 가 24시간이기 때문이다 (`src/cache/types.ts:35`).
지우지 않으면 방금 만든 태그를 `post create --tag` 가 최대 24시간 찾지 못한다.
삭제만 하고 재조회하지 않는다. 다음 조회가 API 에서 다시 채운다.

회피 항목은 `docs/pitfalls/plan/missing-four-surface-guard.md` 다. 캐시 불변식은 writer 와 reader 양쪽을 본다.
이 변경은 필드를 늘리지 않고 삭제 경로만 추가하므로 `CachedTag` 타입과 reader 는 손대지 않는다.
그 판단이 맞는지 `grep -n "CachedTag" src/` 로 확인하고, 새 필드가 필요 없다는 것을 확인한 뒤 넘어간다.

`clearTags` 를 명령 파일에서 직접 부르지 않는다. 아래 5번 항목의 쓰기 함수만 부른다.

### 4. 그룹 이름을 groupId 로 바꾸는 resolver (`src/resolvers/tag.ts`)

파일 끝에 추가한다.

```typescript
export interface ResolvedTagGroup {
  id: string;
  name: string;
  mandatory: boolean;
  selectOne: boolean;
}

export async function resolveTagGroup(
  client: DoorayApiClient,
  projectId: string,
  input: string,
): Promise<ResolvedTagGroup>
```

동작은 다음과 같다.

1. 진입부에서 `input` 을 trim 하고, 빈 문자열이면 `DoorayCliError` 를 `EXIT_PARAM_ERROR` 로 던진다.
   빈 값이 URL path 로 흘러가 `PUT .../tag-groups/` 같은 깨진 경로가 되는 것을 막는다.
2. `ensureTags(client, projectId)` 로 태그 목록을 얻는다.
3. `groupId` 가 있는 태그만 모아 `groupId` 기준으로 중복을 제거한 그룹 목록을 만든다.
4. 그 목록에 `matchByName` 을 적용해 하나를 고른다. 세 번째 인자 라벨은 `"태그 그룹"` 이다.
   후보 표시 함수는 `(g) => \`${g.name} (${g.id})\`` 형태로 한다.
5. 그룹 목록이 비어 있으면 모호성 에러가 아니라 별도 안내를 던진다.
   태그가 하나도 없으면 그룹을 알 수 없다는 사실과, 태그를 먼저 만들라는 안내를 담는다.

`matchByName` 은 같은 파일이 이미 `import` 하고 있다. 정확일치 다음 부분일치, 모호하면 후보 목록 에러라는
기존 정책을 그대로 쓴다. 새 매칭 규칙을 만들지 않는다.

시그니처는 `matchByName(items, input, label, renderCandidate, options?)` 이고
타입 제약이 `T extends NameRecord` 라 항목에 `name` 필드가 있어야 한다.
`ResolvedTagGroup` 이 `name` 을 가지므로 그대로 넘길 수 있다.

회피 항목 둘을 함께 지킨다.

- `docs/pitfalls/code-review/resolver-parser-boundary-empty-identifier.md`: path 식별자는 resolver 진입부에서 trim 후 빈 값을 거부한다.
- `docs/pitfalls/plan/inconsistent-resolver-validation-policy.md`: 기존 resolver 와 다른 검증 정책을 만들지 않는다.

그룹 정보를 태그 목록에서 파생하는 이유는 그룹 목록을 주는 API 경로가 없기 때문이다.
그래서 태그가 하나도 없는 그룹은 찾을 수 없다. 이 제약은 ADR-041 에 기록되어 있다.

### 5. 태그 쓰기 함수와 캐시 무효화 (`src/resolvers/tag.ts`)

API 호출과 캐시 무효화를 한 함수 안에 묶는다. 같은 파일에 추가한다.

```typescript
export async function createTag(
  client: DoorayApiClient,
  projectId: string,
  body: CreateTagRequest,
): Promise<string>

export async function updateTagGroup(
  client: DoorayApiClient,
  projectId: string,
  tagGroupId: string,
  body: UpdateTagGroupRequest,
): Promise<void>
```

`createTag` 는 `client.createProjectTag` 를 부르고 응답의 `result.id` 를 반환한다.
`updateTagGroup` 은 `client.updateProjectTagGroup` 을 부른다.
둘 다 호출이 성공한 뒤에 `clearTags(projectId)` 를 부른다.

캐시 삭제가 실패해도 함수는 정상 반환한다. 예외를 밖으로 던지지 않는다.
대신 `stderr` 로 경고를 한 줄 내고 `dooray cache clear` 를 안내한다.
이 시점에 API 호출은 이미 성공했으므로, 실패로 만들면 사용자가 재시도해 태그가 한 번 더 만들어진다.
경고 출력은 `src/utils/` 에 이미 있는 stderr 출력 방식을 찾아 그것을 쓴다. 새로 만들지 않는다.

이 배치의 근거는 `docs/adr/042-cache-invalidation-on-mutation.md` 다.
캐시를 읽는 계열이 무효화도 맡아, 호출자가 무효화를 잊을 수 없게 하는 것이 목적이다.
그래서 phase-02 의 명령 파일은 `client.createProjectTag` 와 `clearTags` 를 직접 부르지 않고
이 두 함수만 부른다.

회피 항목은 `docs/pitfalls/code-review/mutation-without-cache-invalidation.md` 다.

---

## Critical Files

| 파일 | 변경 |
| --- | --- |
| `src/api/types.ts` | 수정 |
| `src/api/client.ts` | 수정 |
| `src/cache/store.ts` | 수정 |
| `src/resolvers/tag.ts` | 수정 |

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm run build
pnpm test
```

셋 모두 통과해야 한다.
`pnpm tsc --noEmit` 은 번들에 쓰이지 않는 타입 전용 검사라 빌드와 별개로 반드시 돌린다.

경로와 시그니처를 문자열로 확인한다.

```bash
# cwd: <repo root>
grep -n "createProjectTag\|updateProjectTagGroup" src/api/client.ts
grep -n "project/v1/projects/\${projectId}/tags\`" src/api/client.ts
grep -n "tag-groups/\${tagGroupId}" src/api/client.ts
grep -n "clearTags" src/cache/store.ts
grep -n "resolveTagGroup\|createTag\|updateTagGroup" src/resolvers/tag.ts
```

다섯 grep 이 모두 결과를 내야 한다.

쓰기 함수가 캐시를 지우는지 확인한다. 아래 결과가 2 여야 한다.

```bash
# cwd: <repo root>
grep -c "clearTags" src/resolvers/tag.ts
```

`api/client.ts` 가 캐시를 부르지 않는지 확인한다. 아래 출력이 없어야 한다.
`api/client` 는 순수 HTTP 래퍼라 캐시를 알지 못한다.

```bash
# cwd: <repo root>
grep -n "cache/store\|clearTags" src/api/client.ts
```

`toDoorayCliError` 로 감쌌는지 확인한다. 아래 결과가 2 여야 한다.

```bash
# cwd: <repo root>
sed -n '/async createProjectTag/,/^  }/p;/async updateProjectTagGroup/,/^  }/p' src/api/client.ts \
  | grep -c "toDoorayCliError"
```

## 의도 메모

- `DoorayApiUnitResponse` 를 재사용하는 이유는 `PUT tag-groups` 응답의 `result` 가 `null` 이라서다.
  전용 응답 타입을 새로 만들면 같은 모양의 타입이 하나 더 생긴다.
- 캐시를 지우기만 하고 재조회하지 않는 이유는 재조회가 API 호출을 하나 더 쓰기 때문이다.
  다음 조회가 어차피 채우므로 생성 명령이 그 비용을 낼 이유가 없다.
- 캐시 TTL 을 짧게 바꾸는 대안을 기각했다. 태그 조회 전반이 느려진다.
  변경을 일으킨 명령이 자기 캐시를 지우는 편이 범위가 좁다.
- 이 phase 가 phase-02 의 명령 세 개가 호출할 표면을 모두 확정한다.
  시그니처가 흔들리면 phase-02 를 다시 써야 한다.
- 무효화를 resolver 계열에 둔 이유는 그 캐시를 읽는 책임이 이미 여기 있어서다.
  명령이 무효화를 부르는 형태로 두면, 새 mutation 명령을 짜는 사람이 그것을 기억해야 하고
  잊어도 어떤 검사도 잡지 못한다. 증상이 24시간짜리 지연이라 원인을 찾기 어렵다.
- 캐시 삭제 실패를 성공으로 넘기는 이유는 그 시점에 API 호출이 이미 끝났기 때문이다.
  실패로 만들면 재시도가 중복 생성을 부른다. 캐시가 낡은 것보다 그게 나쁘다.
