# Phase 01. 구현된 endpoint 와 공식 목록을 대조하는 스크립트를 만든다

**Execution profile**: deep

## 목표

`src/api/client.ts` 가 실제로 부르는 endpoint 목록을 뽑아 공식 API 목록 스냅샷과 대조하는 스크립트를 만든다.
한 번의 훑기로 끝내지 않고 반복 실행할 수 있게 두는 것이 목적이다.

**범위 외**: 틀린 서술을 고치는 것은 phase 02 다. 공개 문서는 phase 03 이다.
공식 목록 스냅샷을 브라우저로 새로 뽑는 것은 이 phase 에 없다. 아래 컨텍스트가 주는 목록을 그대로 쓴다.

## 컨텍스트

**근거 문서**: `docs/adr/046-official-api-doc-precedence.md`.

공식 API 문서는 React 앱이라 `WebFetch` 로 본문을 읽을 수 없다.
`~/.claude/scripts/browser-driver` 로 열어야 한다. 그래서 CI 에서 매번 대조할 수 없고,
공식 목록을 스냅샷 파일로 저장소에 넣는 방식을 쓴다.

스냅샷은 아래 명령으로 뽑은 것이다. 이 phase 에서 다시 뽑지 않는다.

```
# cwd: <repo root>
B=~/.claude/scripts/browser-driver
# open 은 핸들 앞에 위치 안내 한 줄을 함께 내므로 UUID 만 뽑아 쓴다
PAGE=$($B open "<공식 문서 주소>" 60000 | grep -oE '[0-9a-f-]{36}' | head -1)
$B waitjs "$PAGE" 'document.body.innerText.length > 2000' 60000
$B js "$PAGE" 'document.body.innerText' > docs/api/official-page.txt
```

공식 문서 주소는 `CLAUDE.md` 의 「API 스펙 확인 절차」가 소유한다.

`src/api/client.ts` 의 경로는 두 형태로 쓰여 있다.

- 평문: `this.api.get("wiki/v1/wikis")`
- 템플릿 리터럴: `this.api.get(`wiki/v1/wikis/${wikiId}/pages/${pageId}`)`

정규식 하나로 둘을 다 잡으려다 평문 경로를 놓친 적이 있다.
그래서 이미 구현된 `wiki/v1/wikis` 와 `common/v1/members/me` 가 미구현으로 잡혔다.
두 형태를 각각 처리한다.

## 의도 메모

- Python 이 아니라 `.mjs` 로 쓴다. CI 가 Node 만 설치하고, 검사 스텝이 `pnpm install` 앞에서 돈다.
  `.github/workflows/ci.yml` 에서 `check-pii.sh` 와 `check-public-refs.sh` 가 `pnpm install` 보다 앞에 있다.
  그래서 npm 의존성을 쓸 수 없다. `node:` 빌트인만 쓴다.
- `scripts/verify-package.mjs` 가 같은 방식의 선례다. `node:fs` 와 `node:path` 만 쓰고 `node` 가 직접 실행한다.
- TypeScript 로 쓰지 않는다. `tsx` 가 devDependency 에 없고, 있어도 `pnpm install` 앞에서는 쓸 수 없다.
- 대조 실패를 CI 에서 막지 않는다. 공식 API 에 구현되지 않은 endpoint 가 있는 것은 결함이 아니다.
  스크립트는 목록을 내고 종료 코드 0 으로 끝낸다. 사람이 읽고 판단한다.
- 스냅샷과 공식 문서가 어긋난 상태는 이 스크립트가 알려주지 못한다. ADR-046 이 그 한계를 적어 두었다.

## 작업 항목

### 1. `docs/api/official-endpoints.txt` 를 만든다

공식 문서에서 뽑은 endpoint 목록을 한 줄에 하나씩 넣는다. 형식은 `<METHOD> <경로>` 다.
경로는 공식 문서의 표기를 그대로 쓴다. `{project-id}` 처럼 하이픈이 든 placeholder 도 그대로 둔다.

파일 첫 줄에 주석으로 뽑은 날짜와 뽑은 방법을 적는다. `#` 로 시작하는 줄은 스크립트가 건너뛴다.

목록은 137줄이다. 아래는 그중 이 저장소가 다루는 영역이고, 나머지 영역도 함께 넣는다.
`calendar`, `contacts`, `drive`, `reservation`, `common`, `messenger`, `project`, `wiki` 여덟 영역이 있다.

이 phase 를 실행하는 사람은 컨텍스트에 적힌 방법으로 공식 문서를 열어 목록을 직접 뽑는다.
스냅샷을 손으로 적지 않는다. 뽑은 텍스트에서 정규식으로 추출한다.

```
# cwd: <repo root>
grep -oE '^(GET|POST|PUT|DELETE|PATCH) /[a-z0-9/{}?=.-]+' docs/api/official-page.txt | sort -u
```

`docs/api/official-page.txt` 는 저장소에 넣지 않는다. 추출한 목록만 넣는다.
`.gitignore` 에 그 파일을 더한다.

### 2. `scripts/api-endpoint-inventory.mjs` 를 만든다

`node scripts/api-endpoint-inventory.mjs` 로 실행한다. `node:fs` 와 `node:path` 만 쓴다.

하는 일은 셋이다.

첫째, `src/api/client.ts` 에서 호출 경로를 뽑는다.
`this.api.<method>(` 뒤의 첫 인자를 읽는다. 두 형태를 각각 처리한다.

- 큰따옴표나 작은따옴표로 감싼 평문
- 백틱으로 감싼 템플릿 리터럴. `${...}` 를 `{id}` 로 바꾼다

메서드 이름도 함께 뽑는다. `get`, `post`, `put`, `delete`, `patch` 다.
`searchParams` 나 두 번째 인자는 무시한다.

둘째, `docs/api/official-endpoints.txt` 를 읽어 같은 형태로 정규화한다.
placeholder 이름이 무엇이든 `{id}` 로 바꾼다. 앞의 `/` 를 뗀다. 쿼리 문자열이 붙어 있으면 뗀다.

셋째, 셋으로 갈라 출력한다.

- 공식에 있고 구현에도 있는 것의 개수
- 공식에 있고 구현에 없는 것의 목록. 영역별로 묶어 낸다
- 구현에 있고 공식에 없는 것의 목록. 이것이 중요하다.
  비공식 endpoint 를 쓰고 있다는 뜻이거나, 스냅샷이 낡았다는 뜻이다

종료 코드는 항상 0 이다. 세 번째 목록이 비지 않아도 실패로 보지 않는다.

`--json` 을 주면 사람이 읽는 출력 대신 JSON 을 낸다.
`{ matched: number, missingInImpl: string[], missingInOfficial: string[] }` 형태로 한다.

### 3. `package.json` 에 실행 항목을 더한다

`scripts` 에 `"api:inventory": "node scripts/api-endpoint-inventory.mjs"` 를 더한다.
`verify:package` 가 같은 형태로 이미 들어 있다.

CI 에는 넣지 않는다. 공식에 있고 구현에 없는 것이 정상 상태이므로 통과 조건으로 쓸 수 없다.

### 4. `scripts/api-endpoint-inventory.test.mjs` 로 추출 규칙을 검증하는 테스트를 만든다

vitest 가 `.mjs` 를 집어가는지 먼저 확인한다. `vitest.config` 나 `package.json` 의 설정을 본다.
집어가지 않으면 추출 함수를 `scripts/api-endpoint-inventory.mjs` 에서 export 하고
테스트 파일은 `src/` 밖에 두되 vitest 의 `include` 에 그 경로를 더한다.

검증할 것은 이렇다. 실제 파일을 읽지 않고 문자열을 직접 넘긴다.

- 평문 경로를 뽑는다. `this.api.get("wiki/v1/wikis")` 에서 `GET wiki/v1/wikis` 가 나온다.
- 템플릿 리터럴을 뽑고 `${...}` 를 `{id}` 로 바꾼다.
  두 개가 든 경로에서 둘 다 바뀐다.
- `searchParams` 가 든 두 번째 인자가 결과에 섞이지 않는다.
- 공식 목록의 placeholder 이름이 달라도 같은 경로로 정규화된다.
  `{project-id}` 와 `{projectId}` 가 모두 `{id}` 가 된다.
- 쿼리 문자열이 붙은 공식 경로에서 쿼리가 떨어진다.
  `files/{file-id}?media=raw` 가 `files/{id}` 가 된다.
- `#` 로 시작하는 주석 줄을 건너뛴다.

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm run build
pnpm test
```

셋 다 통과해야 한다.

스크립트가 실제로 도는지 확인한다.

```bash
# cwd: <repo root>
node scripts/api-endpoint-inventory.mjs > /dev/null; echo $?   # = 0
node scripts/api-endpoint-inventory.mjs --json | node -e 'const d=JSON.parse(require("node:fs").readFileSync(0,"utf8"));console.log(d.matched>0, Array.isArray(d.missingInImpl), Array.isArray(d.missingInOfficial))'
```

두 번째 명령이 `true true true` 를 내야 한다.

평문 경로를 놓치지 않는지 확인한다. 이것이 이 phase 의 핵심이다.

```bash
# cwd: <repo root>
node scripts/api-endpoint-inventory.mjs --json \
  | node -e 'const d=JSON.parse(require("node:fs").readFileSync(0,"utf8"));const bad=d.missingInImpl.filter(x=>/wiki\/v1\/wikis$|common\/v1\/members\/me$/.test(x));console.log("오탐:", bad.length)'
```

`오탐: 0` 이 나와야 한다.
`wiki/v1/wikis` 와 `common/v1/members/me` 는 평문으로 구현되어 있으므로 미구현으로 잡히면 추출이 틀린 것이다.

의존성을 쓰지 않았는지 확인한다.

```bash
# cwd: <repo root>
grep -cE "^import .* from \"(node:)" scripts/api-endpoint-inventory.mjs   # >= 1
grep -cE "^import .* from \"[^n]" scripts/api-endpoint-inventory.mjs      # = 0
```

두 번째가 0 이어야 한다. `node:` 로 시작하지 않는 import 가 있으면 CI 의 `pnpm install` 앞 단계에서 실패한다.

개인 식별 정보 검사를 통과시킨다.

```bash
# cwd: <repo root>
bash scripts/check-pii.sh
```

`docs/api/official-endpoints.txt` 에 실제 ID 나 사내 도메인이 섞이지 않았는지 이 검사가 본다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `docs/api/official-endpoints.txt` | 신규 |
| `scripts/api-endpoint-inventory.mjs` | 신규 |
| `scripts/api-endpoint-inventory.test.mjs` | 신규 |
| `package.json` | 수정 |
| `.gitignore` | 수정 |
