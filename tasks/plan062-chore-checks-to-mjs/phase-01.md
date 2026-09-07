# Phase 01. 검사 스크립트 둘을 `.mjs` 로 옮기고 테스트를 붙인다

**Execution profile**: standard

## 목표

`scripts/check-pii.sh` 와 `scripts/check-public-refs.sh` 를 `.mjs` 로 옮긴다.
검사 규칙을 함수로 export 해 vitest 로 검증한다.

**범위 외**: 호출 지점 갱신과 CI 수정은 phase 02 다.
검사 규칙 자체를 바꾸지 않는다. 화이트리스트 항목을 더하거나 빼지 않는다.
`scripts/verify-package.mjs` 는 이미 `.mjs` 라 대상이 아니다.

## 컨텍스트

**근거 문서**: `docs/adr/048-checks-to-mjs.md`.

`scripts/check-pii.sh` 는 77줄이고 세 축을 검사한다.

1. 공개 화이트리스트 밖의 URL 과 이메일 도메인. `https://` 나 `@` 접두를 요구해 코드의 property 접근을 배제한다.
   화이트리스트는 호스트 경계에 앵커한다. 앵커가 없으면 `dooray.com` 이 `evil-dooray.com` 안에서 매치된다.
2. 허용 목록 밖의 15자리 이상 numeric. `grep -o` 로 매치 단위로 뽑는다.
   줄 단위로 거르면 허용 ID 와 실제 ID 가 한 줄에 같이 있을 때 그 줄 전체가 걸러져 실제 ID 가 빠져나간다.
3. CLI 예시의 project 인자. 허용 목록 밖이면 사람이 확인한다.
   project 자리에 하위 명령 이름이 오는 형태는 검출에서 뺀다.

`scripts/check-public-refs.sh` 는 21줄이고 `README.md` 와 `skills/` 에서
`ADR-[0-9]+` 와 `Issue #[0-9]+` 와 `task [0-9]+` 를 찾는다.

**두 스크립트의 주석이 그 판정 근거를 담고 있다. 옮길 때 주석을 함께 옮긴다.**
왜 앵커가 필요한지, 왜 `grep -o` 인지, 왜 하위 명령을 빼는지가 거기 있다.
지우면 다음 사람이 같은 실수를 다시 한다.

옮기는 이유는 셸의 배열 확장이다. `check-pii.sh` 의 첫 주석이 적고 있다.
`SCAN` 배열이 다른 셸에서 첫 원소 하나로 줄어 검사 범위가 아홉에서 하나가 된 적이 있다.
검사는 그래도 통과하므로 범위가 줄었다는 것이 드러나지 않는다.

`scripts/verify-package.mjs` 가 선례다. `node:fs` 와 `node:path` 만 쓰고 `node` 가 직접 실행한다.

## 의도 메모

- npm 의존성을 쓰지 않는다. CI 의 검사 스텝이 `pnpm install` 앞에서 돈다.
  `node:` 로 시작하는 import 만 쓴다.
- TypeScript 로 쓰지 않는다. `tsx` 가 devDependency 에 없고, 있어도 설치 앞에서는 쓸 수 없다.
- 검사 규칙을 바꾸지 않는다. 이 phase 는 옮기는 작업이다.
  옮기면서 발견한 규칙의 결함은 고치지 말고 보고에 적는다.
- 파일 훑기를 셸의 `grep -r` 대신 직접 구현한다. `node:fs` 의 `readdir` 을 재귀로 쓴다.
  `.git` 과 `node_modules` 와 `dist` 와 `worktrees` 를 건너뛴다.
  `worktrees` 를 빼는 것이 중요하다. 다른 브랜치의 사본이 그 아래 있어 넣으면 검사가 중복되고 느려진다.
- 출력 형식과 종료 코드를 그대로 유지한다. CI 와 사람이 그것을 읽는다.
  위반이 있으면 1, 깨끗하면 0 이다.
- **검사기의 테스트 데이터가 검사기 자신에게 걸린다.** 위반 사례를 소스에 그대로 적으면
  `check-pii` 가 그것을 잡아 CI 가 실패한다.
  위반 사례는 실행 시점에 조각을 이어 만든다. 화이트리스트 밖 도메인과 실제처럼 보이는 긴 숫자가 그 대상이다.
  긴 숫자는 `OK_IDS` 에 있는 값을 쓰면 되지만, 그러면 위반으로 잡히지 않아 판정을 검증하지 못한다.
  그래서 그쪽도 이어 만든다.

## 작업 항목

### 1. `scripts/check-public-refs.mjs` 를 만든다

기존 셸 스크립트와 같은 일을 한다. 먼저 이것을 옮긴다. 21줄이라 규칙이 단순하다.

- 검사 대상은 `README.md` 와 `skills/` 아래 모든 파일이다.
- 정규식은 `/ADR-[0-9]+|Issue #[0-9]+|task [0-9]+/` 다.
- 위반이 있으면 `[위반] 공개 문서에 내부 추적 번호가 있다 — 번호를 빼고 문장을 다시 쓴다` 를 출력하고
  파일과 줄 번호와 줄 내용을 이어 낸 뒤 종료 코드 1 로 끝난다.
- 깨끗하면 `공개 문서 내부 참조 검사 통과` 를 출력하고 0 으로 끝난다.

파일 훑기와 정규식 판정을 함수로 나눠 export 한다.

- `walkFiles(roots, options)` 는 경로 목록을 돌려준다. `.git` 과 `node_modules` 와 `dist` 와 `worktrees` 를 건너뛴다.
- `findInternalRefs(text)` 는 매치 목록을 돌려준다. 파일을 읽지 않는다.

`main` 은 이 둘을 엮고 출력과 종료 코드를 맡는다.
`import.meta.url` 로 직접 실행 여부를 판정해, 테스트가 import 할 때 `main` 이 돌지 않게 한다.

### 2. `scripts/check-pii.mjs` 를 만든다

세 축을 각각 함수로 나눠 export 한다. 각 함수는 문자열을 받고 매치 목록을 돌려준다.
파일을 읽지 않으므로 단위 테스트가 붙는다.

- `findForeignDomains(text, okDomains)`
- `findLongIds(text, okIds)`
- `findUnknownProjects(text, okProjects, subcommands)`

화이트리스트 넷을 모듈 상단 상수로 두고 export 한다.
`SCAN`, `OK_DOMAINS`, `OK_IDS`, `OK_PROJECTS` 다.
기존 셸 스크립트의 값을 그대로 옮긴다. 항목을 더하거나 빼지 않는다.

`OK_DOMAINS` 는 호스트 경계에 앵커한다.
정규식으로 옮길 때 그 성질이 유지되는지 반드시 확인한다.
`dooray.com` 이 `evil-dooray.com` 안에서 매치되면 typosquat 이 통과한다.
그 주석을 함께 옮긴다.

`findLongIds` 는 매치 단위로 판정한다. 줄 단위로 거르지 않는다.
허용 ID 와 실제 ID 가 한 줄에 같이 있을 때 그 줄 전체가 걸러지는 것을 막는 것이 그 이유다.
그 주석도 함께 옮긴다.

`findUnknownProjects` 는 project 자리에 하위 명령 이름이 오는 형태를 검출에서 뺀다.
기존 스크립트의 `SUBCOMMANDS` 값을 그대로 옮긴다.
`<` 로 시작하는 placeholder 는 정규식이 애초에 잡지 않는다는 주석도 옮긴다.

출력은 기존과 같다. 축별로 `[위반] <사유>` 를 내고 매치를 이어 낸다.
위반이 하나라도 있으면 종료 코드 1, 없으면 `개인 식별 정보 검사 통과` 를 내고 0 이다.

### 3. 기존 셸 스크립트 둘을 삭제한다

`git rm scripts/check-pii.sh scripts/check-public-refs.sh` 로 지운다.
호출 지점 갱신은 phase 02 가 맡으므로 이 phase 가 끝난 시점에는 CI 가 깨진 상태다.
그것이 정상이다. 두 phase 를 한 PR 로 묶는다.

### 4. `package.json` 에 실행 항목을 더한다

`scripts` 에 둘을 더한다.

- `"check:pii": "node scripts/check-pii.mjs"`
- `"check:refs": "node scripts/check-public-refs.mjs"`

`verify:package` 가 같은 형태로 이미 들어 있다.

### 5. `scripts/check-pii.test.mjs` 와 `scripts/check-public-refs.test.mjs` 로 검사 규칙을 검증하는 테스트를 만든다

vitest 가 `scripts/` 의 `.mjs` 를 집어가는지 먼저 확인한다.
`vitest.config` 나 `package.json` 의 설정을 본다. 집어가지 않으면 `include` 에 그 경로를 더한다.

`check-pii` 쪽에서 확인할 것은 이렇다.

- `findForeignDomains` 가 화이트리스트 안의 도메인을 통과시킨다. `https://github.com/x` 가 걸리지 않는다.
- **호스트 경계 앵커.** 허용 도메인 앞에 다른 문자가 붙은 도메인이 위반으로 잡힌다.
  앵커가 빠지면 이 테스트가 실패한다. 이 항목이 이 phase 의 핵심이다.

  이 테스트 케이스에는 함정이 있다. 그 문자열을 소스에 그대로 적으면
  `check-pii` 자신이 그것을 화이트리스트 밖 도메인으로 잡아 CI 가 실패한다.
  검사기가 자기 테스트를 막는 상태가 된다.
  그래서 문자열을 실행 시점에 이어 만든다. 접두어와 허용 도메인을 따로 두고 더한다.
  정규식은 이어진 결과를 보므로 판정은 같고, 소스에는 그 도메인이 통째로 남지 않는다.
- `@` 접두 이메일을 본다. `user@example.com` 이 통과하고 화이트리스트 밖 도메인의 이메일이 걸린다.
- 코드의 property 접근을 배제한다. `obj.com` 이나 `x.net` 이 걸리지 않는다.
- `findLongIds` 가 허용 ID 를 통과시키고 그 밖의 15자리 이상 숫자를 잡는다.
- **한 줄에 허용 ID 와 실제 ID 가 같이 있을 때 실제 ID 를 잡는다.**
  줄 단위로 걸렀으면 이 테스트가 실패한다.
- 14자리 이하 숫자는 잡지 않는다.
- `findUnknownProjects` 가 허용 project 를 통과시키고 그 밖의 값을 잡는다.
- project 자리에 하위 명령 이름이 온 형태를 잡지 않는다.
- `<project>` 처럼 `<` 로 시작하는 placeholder 를 잡지 않는다.

`check-public-refs` 쪽에서 확인할 것은 이렇다.

- `findInternalRefs` 가 `ADR-030` 을 잡는다.
- `Issue #154` 를 잡는다.
- `task 12` 를 잡는다.
- 내부 참조가 없는 문장을 통과시킨다.
- `walkFiles` 가 `node_modules` 와 `.git` 과 `dist` 와 `worktrees` 를 건너뛴다.
  임시 디렉터리를 만들어 확인한다. `node:fs` 의 `mkdtemp` 를 쓴다.

테스트 대상 파일 자체를 `vi.mock` 하지 않는다. 같은 파일 안의 함수 참조가 교체되지 않아 실제 구현이 불린다.
문자열을 직접 넘겨 순수 함수를 검증한다.

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
pnpm vitest run scripts/check-pii.test.mjs scripts/check-public-refs.test.mjs
```

새 스크립트가 실제로 도는지 확인한다.

```bash
# cwd: <repo root>
node scripts/check-pii.mjs; echo $?            # = 0
node scripts/check-public-refs.mjs; echo $?    # = 0
```

둘 다 0 이어야 한다. 지금 저장소는 깨끗한 상태다.

위반을 실제로 잡는지 확인한다.

```bash
# cwd: <repo root>
node -e '
import("./scripts/check-public-refs.mjs").then(m=>{
  console.log("내부 참조:", m.findInternalRefs("ADR-030 참조").length);
});
'
node -e '
import("./scripts/check-pii.mjs").then(m=>{
  const bad = "https://evil-" + "dooray.com/x";
  console.log("경계 앵커:", m.findForeignDomains(bad, m.OK_DOMAINS).length);
});
'
```

`내부 참조: 1` 과 `경계 앵커: 1` 이 나와야 한다.
앞이 0 이면 정규식이 잘못 옮겨진 것이고, 뒤가 0 이면 호스트 경계 앵커가 빠진 것이다.
두 번째 명령이 문자열을 이어 만드는 이유는 위 의도 메모에 있다.

의존성을 쓰지 않았는지 확인한다.

```bash
# cwd: <repo root>
grep -chE "^import .* from ['\"]node:" scripts/check-pii.mjs scripts/check-public-refs.mjs   # 각각 >= 1
grep -chE "^import .* from ['\"][^n]" scripts/check-pii.mjs scripts/check-public-refs.mjs    # 각각 = 0
```

두 번째가 둘 다 0 이어야 한다. `node:` 로 시작하지 않는 import 가 있으면 CI 의 설치 앞 단계에서 실패한다.

셸 스크립트가 사라졌는지 확인한다.

```bash
# cwd: <repo root>
ls scripts/*.sh 2>/dev/null | wc -l   # = 0
```

## Critical Files

| 파일 | 변경 |
|---|---|
| `scripts/check-pii.mjs` | 신규 |
| `scripts/check-public-refs.mjs` | 신규 |
| `scripts/check-pii.test.mjs` | 신규 |
| `scripts/check-public-refs.test.mjs` | 신규 |
| `scripts/check-pii.sh` | 삭제 |
| `scripts/check-public-refs.sh` | 삭제 |
| `package.json` | 수정 |
