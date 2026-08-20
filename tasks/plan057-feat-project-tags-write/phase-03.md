# Phase 03: 단위 테스트와 통합 검증

**Execution profile**: standard

---

## 목표

phase-01 과 phase-02 가 만든 순수 로직에 단위 테스트를 붙이고, plan 전체를 통합 검증한 뒤 완료로 마킹한다.

**범위 외**:

- 새 기능 추가와 동작 변경은 하지 않는다. 테스트가 결함을 찾으면 그것만 고친다.
- 실제 Dooray API 를 호출하는 통합 테스트는 만들지 않는다. 기존 테스트가 모두 API 를 mock 한다.

---

## 작업 항목 (4)

### 1. 색상 정규화 테스트

`src/commands/project/tags-create.test.ts` 를 만든다.
`normalizeTagColor` 를 대상으로 하고, 아래 경우를 모두 덮는다.

| 입력 | 기대 |
| --- | --- |
| `undefined` | `"e0e0e0"` |
| `""` 와 `"   "` | `"e0e0e0"` |
| `"c6eab3"` | `"c6eab3"` |
| `"#c6eab3"` | `"c6eab3"` |
| `"C6EAB3"` | `"c6eab3"` |
| `"xyz"` | `DoorayCliError` 를 던지고 `exitCode` 가 `EXIT_PARAM_ERROR` |
| `"c6eab"` (5자리) | 같은 에러 |
| `"c6eab3ff"` (8자리) | 같은 에러 |
| `"##c6eab3"` | 같은 에러 (`#` 은 하나만 벗긴다) |

에러 검증은 던져진 예외의 `exitCode` 까지 확인한다.
`expect(...).toThrow()` 만 쓰면 다른 이유로 던져진 예외도 통과한다.
회피 항목은 `docs/pitfalls/code-review/exit-code-missing.md` 다.

### 2. 그룹 resolver 테스트

`src/resolvers/tag.test.ts` 는 이미 있다. 거기에 이어 쓴다.
`resolveTagGroup` 을 대상으로 하고 아래를 덮는다.

- 그룹 이름 정확일치로 하나를 찾는다. 반환값의 `id`, `name`, `mandatory`, `selectOne` 이 모두 맞다.
- 같은 그룹에 속한 태그가 여럿일 때 그룹이 하나로 합쳐진다. 중복 제거가 동작한다.
- 이름 부분일치가 여러 그룹에 걸리면 던진다.
- 태그 목록이 비었을 때 태그를 먼저 만들라는 안내를 담은 에러를 던진다.
- 빈 문자열과 공백만 있는 입력을 `EXIT_PARAM_ERROR` 로 거부한다.
- 그룹이 없는 태그(`groupId` 가 `null`)만 있을 때도 위와 같은 빈 목록 에러가 된다.

mock 은 기존 테스트의 방식을 그대로 따른다.
`src/` 안의 다른 `*.test.ts` 가 `DoorayApiClient` 와 캐시를 어떻게 mock 하는지 먼저 확인하고 같은 형태로 쓴다.

두 가지를 피한다.

- 테스트가 자기 자신을 mock 해서 실제 구현을 검사하지 않는 형태.
  회피 항목은 `docs/pitfalls/plan/test-self-mock.md` 다.
- mock 의 reject 값이 실제 구현이 던지는 것과 달라 통과하는 형태.
  회피 항목은 `docs/pitfalls/code-review/mock-reject-value-not-mirroring-production.md` 다.

테스트 fixture 에 실제 사내 식별자를 쓰지 않는다.
프로젝트는 `my-project`, 긴 숫자 id 는 자리수만 맞춘 가상 값을 쓴다.
회피 항목은 `docs/pitfalls/code-review/src-test-fixture-internal-identifier.md` 다.

### 3. 쓰기 함수의 캐시 무효화 테스트

`src/services/tag.test.ts` 를 만든다. `createTag` 와 `updateTagGroup` 각각에 대해 셋을 덮는다.

1. 호출이 성공하면 그 프로젝트의 `clearTags` 가 불린다. `createTag` 는 태그 id 를 돌려준다.
2. `clearTags` 가 던져도 두 함수가 정상 반환한다.
3. API 호출 자체가 실패하면 그대로 던지고 `clearTags` 를 부르지 않는다.

3번을 빠뜨리지 않는다. 1번과 대칭이고, 이것이 없으면 무효화를 호출 앞으로 옮기는 변경이 통과한다.
실패한 변경에 캐시를 지울 이유가 없다.

mock 의 reject 값을 실제 구현이 던지는 것과 같은 형태로 만든다.
`clearTags` 는 `node:fs` 의 `rm` 을 부르므로 raw `Error` 가 올라온다.
`api/client` 의 throw path 는 `toDoorayCliError` 를 거쳐 `EXIT_API_ERROR` 를 단다.
회피 항목은 `docs/pitfalls/code-review/mock-reject-value-not-mirroring-production.md` 와
`docs/pitfalls/plan/test-self-mock.md` 다.

이 항목은 ADR-042 의 핵심 불변식을 고정한다. `services` 계열이 이번에 생겼고
앞으로 mutation 이 붙을 때마다 같은 불변식이 따라온다.

### 4. 통합 검증과 완료 마킹

아래 검증을 모두 통과시킨 뒤 `tasks/plan057-feat-project-tags-write/index.json` 을 고친다.

- `status` 를 `"completed"` 로 바꾼다.
- `current_phase` 를 `3` 으로 둔다.
- `phases` 배열 세 항목의 `status` 를 모두 `"completed"` 로 바꾼다.
- `updated_at` 을 실행한 날짜로 바꾼다.

---

## Critical Files

| 파일 | 변경 |
| --- | --- |
| `src/commands/project/tags-create.test.ts` | 신규 |
| `src/resolvers/tag.test.ts` | 수정 |
| `src/services/tag.test.ts` | 신규 |
| `docs/pitfalls/code-review/mutation-without-cache-invalidation.md` | 수정 |
| `tasks/plan057-feat-project-tags-write/index.json` | 수정 |

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm run build
pnpm test
```

셋 모두 통과해야 한다.

새 테스트가 실제로 실행됐는지 확인한다. 두 파일 이름이 결과에 나와야 한다.

```bash
# cwd: <repo root>
npx vitest run --reporter=verbose 2>&1 | grep -E "tags-create|resolvers/tag|services/tag"
```

`pnpm test` 의 기본 reporter 는 통과한 파일 이름을 찍지 않는다. `--reporter=verbose` 가 필요하다.
세 파일 이름이 모두 나와야 한다.

공개 문서와 개인 식별 정보 검사를 통과해야 한다.

```bash
# cwd: <repo root>
bash scripts/check-public-refs.sh
bash scripts/check-pii.sh
```

문서와 구현이 어긋나지 않는지 확인한다.
아래 명령의 출력에 적힌 옵션과 기본값이 `docs/flow.md` 의 "프로젝트 태그 관리 흐름" 절,
`README.md` 의 "프로젝트 태그 만들기" 절과 일치해야 한다.

```bash
# cwd: <repo root>
node dist/index.js project tags create --help
node dist/index.js project tags group --help
```

설계는 `docs/adr/041-project-tag-write-scope.md` 가 소유한다.
그 결정과 다르게 구현됐으면 구현을 고친다.
ADR 과 구현은 맞는데 `README.md` 나 `docs/flow.md` 의 표현만 다르면 문서를 고쳐도 되지만,
어느 쪽을 고칠지는 스스로 정하지 말고 team-lead 에게 보고해 결정을 받는다.

## 의도 메모

- 순수 함수 둘만 단위 테스트로 덮는 이유는 나머지가 API 호출과 출력이라서다.
  그 부분은 mock 을 두껍게 쌓아도 실제 서버 동작을 확인하지 못한다.
- 색상 정규화를 별도 함수로 뽑아 테스트하는 이유는 잘못된 hex 가 API 400 으로 나가는 것을
  클라이언트에서 먼저 막았는지 확인할 수 있는 유일한 지점이기 때문이다.
- 도움말 출력과 문서를 대조하는 이유는 이 plan 이 7단계에서 문서를 먼저 쓰고 구현을 나중에 하기 때문이다.
  문서가 앞서 있으므로 어긋남은 구현 쪽 결함일 가능성이 높다.
