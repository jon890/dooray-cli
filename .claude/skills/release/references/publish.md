# npm 게시

게시 경로는 아래 표와 같고, 저장소 변수 `NPM_TRUSTED_PUBLISHING` 이 어느 쪽으로 갈지 정한다.

```bash
gh variable list | grep NPM_TRUSTED_PUBLISHING || echo "설정되지 않음"
```

| 변수 | 게시 주체 | provenance |
| --- | --- | --- |
| `true` | `.github/workflows/release.yml` 이 태그 push 에 반응해 게시 | 붙는다 |
| 없음이나 다른 값 | 사용자가 로컬에서 게시 | 붙지 않는다 |

## CI 게시

태그를 밀면 워크플로가 검증을 모두 돌린 뒤 `npm publish --access public --provenance` 를 실행한다.
저장소 secret 에 npm 토큰을 두지 않고 OIDC 신원으로 인증한다.

에이전트가 할 일은 태그를 미는 것까지다. 그 뒤 실행 결과를 확인한다.

```bash
gh run list --workflow=release.yml --limit 1 --json status,conclusion,url \
  --jq '.[] | "\(.status)/\(.conclusion // "-")  \(.url)"'
```

변수가 켜져 있지 않으면 게시 단계를 건너뛰고 그 사실을 로그에 남긴다.
검증 단계는 그대로 돌므로 태그와 `package.json` 버전이 어긋나면 여기서 걸린다.

## 로컬 게시

2단계 인증이 필요해 에이전트가 실행할 수 없다. 올라갈 내용을 먼저 확인한다.

```bash
npm publish --access public --dry-run
```

파일 목록과 버전과 크기를 보고, 의도하지 않은 파일이 섞였으면 멈춘다.
확인했으면 명령을 사용자에게 넘긴다.

```
cd <repo root> && npm publish --access public
```

**`--otp=<code>` 를 안내하지 않는다.** 계정의 2단계 인증이 `auth-and-writes` 이면
npm 이 브라우저 인증 URL 을 띄우고 ENTER 를 기다린다. 코드를 직접 입력하는 흐름이 아니다.

게시가 `404 Not Found - PUT https://registry.npmjs.org/@bifos%2fdooray-cli` 로 실패하면 로그인이 만료된 것이다.
registry 는 인증 없는 scoped 패키지의 PUT 에 401 대신 404 를 낸다. `npm whoami` 가 401 이면 이 경우다.
사용자에게 `npm login` 을 요청하고 같은 명령으로 다시 게시한다. 태그와 Release 는 그대로 둔다.

게시가 접수되면 npm 이 `Your package is being processed and may take a few minutes to become available.` 를 낸다.
최신 버전은 몇 분 뒤에 바뀌고, 그 사이 `npm view` 는 이전 버전을 보여 준다.
사용자가 게시했다고 하는데 이전 버전이 보이면 `~/.npm/_logs/` 에서 가장 최근 `publish` 로그를 연다.
`PUT 202` 가 있으면 접수된 것이니 7단계의 스크립트가 반영을 기다리게 둔다.

## Trusted Publishing 등록

2026-11-13 에 등록했고 변수를 켰다. 등록이 사라졌거나 저장소·워크플로 이름이 바뀌어 다시 등록할 때만 이 절을 따른다.

```bash
npm trust github @bifos/dooray-cli --file release.yml --repo jon890/dooray-cli --allow-publish --yes
gh variable set NPM_TRUSTED_PUBLISHING --body true
```

- **`--allow-publish` 가 없으면 npm 11.19 는 `At least one permission flag is required` 로 거부한다.**
- **등록과 `npm trust list` 는 사용자가 별도 터미널에서 실행한다.** 둘 다 2단계 인증이 필요하고,
  npm 이 브라우저 인증 URL 을 띄운 뒤 ENTER 를 기다린다. 에이전트 세션의 `!` 로 실행하면 기다리지 못하고 `EOTP` 로 끝난다.
- `401 ... You must be logged in` 이면 로그인이 만료된 것이다. `npm login` 뒤 같은 명령을 다시 실행한다.
- 2026-09-07 에는 같은 등록이 본문 없는 400 으로 실패했다. 그때 명령에는 `--allow-publish` 가 없었다.

CI 의 게시 단계가 인증 오류(`ENEEDAUTH`, `E401`, `E404`)로 실패하면 등록이 사라졌을 수 있다.
태그와 Release 는 그대로 두고 「로컬 게시」 로 이번 버전을 내보낸 뒤, 사용자에게 재등록을 요청한다.
