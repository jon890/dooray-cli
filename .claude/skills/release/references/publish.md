# npm 게시

경로가 둘이다. 저장소 변수 `NPM_TRUSTED_PUBLISHING` 이 어느 쪽으로 갈지 정한다.

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
npm 이 브라우저 인증 URL 을 띄우고 ENTER 를 기다린다. 코드를 손으로 넣는 흐름이 아니다.

## Trusted Publishing 등록

CI 게시를 켜려면 먼저 npm 에 신뢰 관계를 등록하고 변수를 켠다.

```bash
npm trust list @bifos/dooray-cli
npm trust github @bifos/dooray-cli --file release.yml --repo jon890/dooray-cli
gh variable set NPM_TRUSTED_PUBLISHING --body true
```

**2026-09-07 시점에 등록이 되지 않는다.** registry 가 본문 없이 400 을 낸다.
공개 저장소, 기본 브랜치 `main`, `main` 에 있는 `release.yml`, `auth-and-writes` 2단계 인증,
200 으로 통과한 OTP 교환, npm CLI 소스로 확인한 정확한 요청 본문까지 전제가 모두 충족된 상태였다.

**같은 400 이 다시 나오면 원인을 더 좁히려 시도하지 않는다.** 로컬 게시로 진행하고
npm 쪽 문제로 남긴다. 로컬 토큰으로 endpoint 를 직접 부르면 2단계 인증 때문에 401 이라
CLI 경로 밖에서 확인할 방법이 없다.
