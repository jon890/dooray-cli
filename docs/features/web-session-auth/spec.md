# 웹 로그인 세션 인증 방식

확인: 2026-11-13

## 목표

Dooray API 키가 막혀도, 사용자가 웹에 로그인한 세션으로 CLI 의 명령을 그대로 쓸 수 있다.
API 키 방식도 그대로 남아, 설정 값 하나로 두 방식을 오간다.

## 배경

2026-11-13 Dooray 가 보안 사고 대응으로 개인 API·Admin API 키를 모두 폐기하고 새 키의 호출도 막았다.
웹 화면은 정상이다.

2026-11-13 실측(테넌트 웹 주소, 로그인한 브라우저):

- 웹 화면은 `/wapi/<서비스>/v1/...` 와 `/v2/wapi/...` 경로를 섞어 부른다. 공개 API 와 경로·응답 형태가 다른 별도 API 다.
- 공개 API 경로에 `/wapi` 만 붙여 통한 것은 `GET /wapi/project/v1/projects` 하나였다. `common/v1/members/me`, `wiki/v1/wikis`,
  `messenger/v1/channels`, `calendar/v1/calendars`, `common/v1/members`, `project/v1/projects/*/posts` 는 `/wapi` 를 붙이면 404 였다.
- 브라우저 밖 Node `fetch` 에 `SESSION` 쿠키 하나만 넣어 `/wapi/project/v1/projects` 를 부르면 200 이었다. `JSESSIONID` 만으로는 401 이었다.
- `SESSION` 은 httpOnly 세션 쿠키다. 브라우저 화면의 JavaScript 로는 읽을 수 없고, 다시 로그인하면 바뀐다.

`SESSION` 쿠키는 API 키와 달리 범위를 좁힐 수 없다. 웹에 로그인한 사람이 할 수 있는 모든 일이 된다.

## 범위

- 인증 방식 `api-key`·`web` 을 설정 값으로 고른다. 웹 방식은 테넌트 웹 주소에 `SESSION` 쿠키를 붙여 부른다.
- API 키를 쓰는 CLI 명령 전체를 웹 방식으로도 돌게 한다. `--json` 출력은 공개 API 모양을 지킨다.
- `dooray-persona` 스킬 스크립트도 웹 방식을 따른다.
- `setup`·`config`·`doctor` 가 웹 방식을 다룬다.

PR 순서와 단위:

1. 기반: 인증 방식 설정, 쿠키 저장, `setup`·`doctor`, 웹 클라이언트 골격, `project`·`member` 명령
2. `post` 명령(댓글·첨부·워크플로 포함)
3. `wiki` 명령(페이지·첨부·댓글 포함)
4. `messenger`·`calendar`·`stream` 명령과 `dooray-persona` 스킬 스크립트

이 기능 전에 `docs/features/secret-file-hardening/spec.md` 의 PR 을 먼저 낸다.

범위 밖:

- `mail` 명령. IMAP·SMTP 비밀번호를 써서 이번 차단과 관계없다.
- 브라우저 쿠키 저장소를 CLI 가 자동으로 읽기. 쿠키는 사용자가 붙여 넣는다.
- 아이디·비밀번호로 CLI 가 직접 로그인하기.
- `api-key` 로 먼저 부르고 실패하면 웹으로 다시 부르는 자동 전환.
- 명령마다 인증 방식을 바꾸는 옵션.
- Windows 비밀값 암호화 저장. 비밀값 저장 위치는 OS 별 기존 규칙([ADR-069](../../adr/069-macos-keychain-secret-store.md))을 따른다.

## 요구사항과 인수 조건

| ID | 요구사항 | 관측할 인수 조건 |
| --- | --- | --- |
| REQ1 | `dooray config set auth-mode web` 과 `api-key` 로 방식을 바꾼다. 값이 없으면 `api-key` 다 | 기존 설정 파일(값 없음)로 명령이 지금처럼 `api.dooray.com` 을 부른다. `web` 으로 바꾸면 테넌트 웹 주소를 부른다. 다른 값은 `EXIT_PARAM_ERROR`(3)로 거절한다 |
| REQ2 | `dooray config set session-cookie -` 로 쿠키를 stdin 에서 받는다. 위치 인자 값도 받는다 | stdin 으로 넣은 값으로 웹 방식 명령이 성공한다. 값만 준 형태, `SESSION=<값>`, 개발자 도구에서 복사한 `Cookie:` 헤더 전체(`a=1; SESSION=<값>; b=2`)를 모두 받아 `SESSION` 값만 저장한다. 앞뒤 공백과 따옴표는 뗀다. 헤더 형태인데 `SESSION` 이 없으면 `EXIT_PARAM_ERROR`(3)로 거절한다 |
| REQ3 | 쿠키는 비밀값으로 다룬다. macOS 는 키체인, 그 밖의 OS 는 0600 `config.json` 에 둔다 | macOS 에서 저장 뒤 `config.json` 에 쿠키가 없고 키체인 항목이 있다. `doctor`·오류 메시지·`last-run.json` 에 값이 나오지 않는다. `config get session-cookie` 는 「설정됨」·「미설정」 만 보인다. `config get auth-mode` 는 현재 방식을 보인다 |
| REQ4 | 쿠키는 https 요청에만 붙이고, 테넌트 웹 주소와 그 클라우드 도메인(예: `*.dooray.com`) 밖으로 보내지 않는다. API 응답의 리다이렉트는 따라가지 않는다. 첨부 파일 307 만 같은 도메인의 https 주소로 한 번 따라간다 | 웹 응답이 다른 도메인으로 보내면 쿠키가 붙은 요청이 나가지 않고 `EXIT_API_ERROR`(1)로 실패한다. 첨부 다운로드·업로드가 웹 방식에서 성공한다 |
| REQ5 | 테넌트 웹 주소는 기존 `tenant-name` 과 클라우드(`base-url`)로 정한다 | `tenant-name=example`, `base-url=https://api.dooray.com` 이면 `https://example.dooray.com` 을 부른다. 다른 클라우드의 대응은 technical-design 이 표로 정한다 |
| REQ6 | 웹 방식에서도 API 키를 쓰던 명령의 사람용 출력·`--json`·`--quiet` 가 `api-key` 방식과 같은 모양이다 | 웹 방식 `--json` 의 필드 이름·구조·값 형식(19자리 id 는 문자열, 날짜 표기)이 공식 API 문서의 그 endpoint 응답 스키마와 같다. 웹에 없는 필드는 키를 뺀다. 빠지는 필드는 명령별로 가이드에 적는다. API 가 복구되면 두 방식의 실제 `--json` 을 비교하지만 완료 조건은 아니다 |
| REQ7 | 웹 방식에서 생성·수정·삭제 명령도 동작한다 | 지정한 사내 테스트 프로젝트에서 업무 생성·수정·댓글·삭제, 위키 페이지 생성·수정, 나에게 메신저 발송, 개인 캘린더 일정 등록·삭제가 웹에서 확인된다 |
| REQ8 | 웹에 대응하는 기능이 없는 명령·옵션은 설명과 함께 실패한다 | 그 명령은 API 를 부르지 않고 「웹 방식에서는 지원하지 않습니다. auth-mode 를 api-key 로 바꾸세요」 와 함께 `EXIT_PARAM_ERROR`(3)로 끝난다. 그런 명령·옵션의 목록이 가이드에 있다 |
| REQ9 | 세션이 만료되거나 쿠키가 틀리면 다시 넣는 방법을 안내한다 | 401 이나 로그인 화면으로 가는 리다이렉트를 받으면 `EXIT_AUTH_ERROR`(2)와 함께 브라우저에서 `SESSION` 쿠키를 꺼내 `config set session-cookie -` 로 넣으라는 안내가 나온다. 403 은 같은 종료 코드 2 지만 쿠키 안내 대신 권한이 없다는 안내가 나온다 |
| REQ10 | `dooray setup` 이 처음에 인증 방식을 묻는다 | `web` 을 고르면 테넌트 이름·클라우드를 지금처럼 묻고, 쿠키를 가려진 입력으로 받아 실제 호출로 확인한다. 꺼내는 방법을 화면에 안내한다. `api-key` 를 고르면 지금 흐름과 같다. 고르지 않은 방식의 비밀값(기존 `apiKey` 나 쿠키)은 지우지 않고 남긴다 |
| REQ11 | 웹 방식을 켤 때와 `doctor` 에서 비공식 웹 API 라는 것을 알린다 | `config set auth-mode web`·`setup` 에서 웹을 고른 순간 stderr 경고가 한 번 나온다. `doctor` 가 인증 방식과 그 경고를 보인다. 일반 명령 실행 때는 나오지 않는다. README 와 `skills/dooray-cli/SKILL.md` 에 같은 내용이 있다 |
| REQ12 | `doctor` 가 웹 방식의 쿠키 유효성을 확인한다 | 유효한 쿠키면 통과, 만료된 쿠키면 실패와 REQ9 의 안내가 나온다 |
| REQ13 | 쿠키나 인증 방식을 바꾸면 전체 캐시를 지운다. 웹 방식에서는 `tenant-name` 변경도 같다 | `session-cookie`·`auth-mode` 를 바꾼 뒤, 그리고 웹 방식에서 `tenant-name` 을 바꾼 뒤 캐시 폴더가 비어 있다 |
| REQ14 | `dooray-persona` 스킬 스크립트가 자기 HTTP 호출 대신 `dooray` CLI 의 `--json` 명령을 불러 같은 설정의 인증 방식을 따른다 | `auth-mode web` 에서 스크립트의 수집 단계가 웹으로 성공한다. 스크립트에 쿠키나 API 키를 읽는 코드가 남지 않는다 |
| REQ15 | 테넌트 웹 주소를 정할 수 없으면 쿠키를 보내기 전에 멈춘다 | 웹 방식인데 `tenant-name` 이 없거나 `base-url` 이 알려진 클라우드가 아니면 `EXIT_CONFIG_ERROR`(4)와 함께 `dooray setup` 을 안내한다 |
| REQ16 | 웹 방식이면 `apiKey` 가 없어도 설정이 완료된 것으로 본다 | `apiKey` 없이 웹 방식만 설정한 상태에서 `mail` 명령이 지금처럼 동작한다. `doctor` 는 웹 방식에서 `apiKey` 미설정을 실패로 세지 않는다 |
| REQ17 | 아직 웹으로 옮기지 않은 명령은 웹 방식에서 막힌 API 를 부르지 않는다 | PR 사이 버전에서 옮기지 않은 명령을 웹 방식으로 돌리면 REQ8 과 같은 안내와 종료 코드 3 으로 끝난다 |

## 결정

| ID | 결정 | 답 | 누가 | 근거 |
| --- | --- | --- | --- | --- |
| DECISION1 | 웹 방식을 지원할 명령 | API 키를 쓰는 명령 전체 | 사용자 2026-11-13 | API 키 차단이 모든 명령에 걸린다 |
| DECISION2 | PR 단위 | 기반 + 영역별 PR 네 개(범위 절의 순서) | 사용자 2026-11-13 | PR 마다 그 영역을 바로 쓸 수 있고 리뷰·실측이 나뉜다 |
| DECISION3 | 웹 방식의 쓰기 | 허용한다. [ADR-062](../../adr/062-undocumented-endpoint-policy.md) 의 「읽기 전용」 을 웹 방식에 한해 고친다 | 사용자 2026-11-13 | 쓰기를 할 다른 길이 없다 |
| DECISION4 | 쿠키 받는 방법 | 사용자가 붙여 넣는다 | 사용자 2026-11-13 | 브라우저 종류에 묶이지 않고 구현이 작다 |
| DECISION5 | 방식 고르기 | 설정 값 `auth-mode` 로 고정. 자동 전환·명령별 옵션 없음 | 사용자 2026-11-13 | 어느 쪽을 부르는지 늘 분명하다 |
| DECISION6 | 웹 방식의 `--json` | 공개 API 모양으로 바꿔 낸다 | 사용자 2026-11-13 | 스킬·스크립트가 방식과 무관하게 돈다 |
| DECISION7 | 웹에 대응 기능이 없을 때 | 설명과 함께 실패, 목록을 가이드에 둔다 | 사용자 2026-11-13 | 조용히 다른 결과를 내지 않는다 |
| DECISION8 | 쓰기 실측 장소 | 사용자가 지정한 사내 테스트 프로젝트, 나에게 보내는 메신저, 개인 캘린더 | 사용자 2026-11-13 | 공개 저장소라 프로젝트 이름은 적지 않는다(CLAUDE.md 사내 식별자 규칙) |
| DECISION9 | `setup` | 처음에 인증 방식을 묻는다 | 사용자 2026-11-13 | 처음 쓰는 사람이 웹 방식을 찾을 수 있다 |
| DECISION10 | 비공식 API 경고 자리 | 켜는 순간·`doctor`·README·스킬. 명령마다·`--help` 마다 두지 않는다. [ADR-062](../../adr/062-undocumented-endpoint-policy.md) 조건 4 를 웹 방식에 맞게 고친다 | 사용자 2026-11-13 | 전 명령이 해당돼 명령마다 두면 경고가 의미를 잃는다 |
| DECISION11 | `dooray-persona` 스크립트 | 마지막 PR 에 포함. 스크립트가 `dooray ... --json` 을 부르게 바꾼다 | 사용자 2026-11-13 | 쿠키·호스트 판정·오류 안내를 CLI 한 곳에서 지킨다. 스크립트는 이미 CLI 설정을 읽어 CLI 가 깔려 있어야 쓸 수 있다 |
| DECISION12 | 쿠키 저장 위치 | `apiKey` 와 같은 비밀 필드로 다룬다 | 작성자 | [ADR-069](../../adr/069-macos-keychain-secret-store.md) 의 비밀 필드 규칙을 그대로 쓴다. 쿠키는 API 키보다 권한이 넓다 |
| DECISION13 | 쿠키를 보낼 호스트 | https 의 테넌트 웹 주소. 첨부 307 만 같은 클라우드 도메인으로 한 번 따라간다 | 작성자 | 실측한 `SESSION` 쿠키의 도메인이 `.dooray.com` 이라 브라우저도 그 범위에 보낸다. 첨부 리다이렉트 규칙은 [ADR-074](../../adr/074-file-redirect-hardening.md) 와 같다 |
| DECISION14 | 세션 만료 종료 코드와 안내 | 401·로그인 리다이렉트는 2 와 쿠키 안내, 403 은 2 와 권한 안내 | 작성자 | 401·403 을 2 로 끝내는 기존 규칙(`docs/code-architecture.md` 「에러 처리 원칙」). 실측에서 비로그인 요청은 `/v2/wapi` 가 401, 그 밖의 경로가 `/auth/signin` 302 였다. 403 에 쿠키 안내를 하면 틀린 안내가 된다 |
| DECISION15 | 지원하지 않는 명령의 종료 코드 | `EXIT_PARAM_ERROR`(3), API 호출 전 | 작성자 | 사용자가 설정이나 옵션을 바꿔야 풀린다. 「무시되는 옵션」 규약과 달리 결과가 달라지므로 실패시킨다 |
| DECISION16 | 캐시 무효화 | `session-cookie`·`auth-mode` 변경, 웹 방식의 `tenant-name` 변경 시 전체 캐시를 지운다 | 작성자 | 계정이 바뀔 수 있다([ADR-042](../../adr/042-cache-invalidation-on-mutation.md)). 웹 방식에서는 `tenant-name` 이 부를 호스트를 정한다 |
| DECISION17 | 환경 변수로 쿠키 받기 | 하지 않는다 | 작성자 | [ADR-007](../../adr/007-config-file-only.md) 「환경 변수로 받지 않는다」 |
| DECISION18 | `mail` 명령 | 범위 밖. 웹 방식만 설정해도 동작하게 한다(REQ16) | 작성자 | IMAP·SMTP 비밀번호를 써서 API 키 차단과 무관하다. 지금은 `getConfigOrThrow` 가 `apiKey` 를 요구한다(`src/config/store.ts`) |
| DECISION19 | 쿠키 입력 형태 | 값, `SESSION=값`, `Cookie:` 헤더 전체를 받아 `SESSION` 만 저장 | 작성자 | 실측에서 `SESSION` 하나로 충분했다. 다른 쿠키를 저장하면 비밀값이 늘 뿐이다 |
| DECISION20 | `config get` 의 쿠키 표시 | 「설정됨」·「미설정」 만. `auth-mode`·`session-cookie` 를 조회 키에 더한다 | 작성자 | 쿠키는 API 키보다 권한이 넓어 일부도 보이지 않는다 |
| DECISION21 | `setup` 에서 고르지 않은 방식의 비밀값 | 남긴다 | 작성자 | 목표의 「설정 값 하나로 두 방식을 오간다」 를 지킨다 |
| DECISION22 | 테넌트 웹 주소를 정할 수 없을 때 | 설정 오류(4)로 멈춘다 | 작성자 | 기본값 `example` 로 부르면 엉뚱한 호스트에 쿠키가 나간다 |
| DECISION23 | PR 사이 버전의 옮기지 않은 명령 | 지원하지 않음과 같이 처리 | 작성자 | 막힌 API 를 부르면 401 에 쿠키 안내가 붙어 틀린 안내가 된다 |
| DECISION24 | 웹 방식 `--json` 의 세부 | 없는 필드는 키를 빼고 값 형식은 공개 API 와 맞춘다. CLAUDE.md 「`--json` 은 raw 유지」 를 「공개 API 모양 유지」 로 고친다 | 작성자 | DECISION6 의 목적(스킬·스크립트가 그대로 돈다)에 맞는다. 없는 값을 null 로 지어내지 않는다 |
| DECISION25 | [ADR-062](../../adr/062-undocumented-endpoint-policy.md) 조건 1~3 의 적용 단위 | 웹 방식 전체를 예외 하나로 묶는다. 명령마다 부르는 웹 경로와 실측 날짜는 한 문서에 모은다 | 작성자 | 모든 웹 경로가 공식 문서에 없어 endpoint 마다 확인하는 조건 1 은 뜻이 없다. `pnpm api:inventory` 의 「구현에 있고 공식에 없는 것」 은 공개 API 쪽만 본다 |
| DECISION26 | REQ6 의 비교 기준 | 공식 API 문서의 응답 스키마. API 복구 뒤 두 방식 실측 비교는 완료 조건이 아닌 후속 확인 | 사용자 2026-11-13 | API 가 언제 복구될지 모른다. 복구를 기다리는 완료 조건을 두지 않는다 |

## 도메인 규칙 변경

도메인 규칙 변경 없음: 인증 경로와 저장소 정책만 바꾼다. 정책 변경은 아래 결정 기록 연결에 둔다.

## 결정 기록 연결 (필요할 때만)

| 결정 | 종류 | 선택 이유를 남길 ADR | 현재 규칙의 원본 |
| --- | --- | --- | --- |
| DECISION3 | api-policy | `docs/adr/062-undocumented-endpoint-policy.md` 를 고친다 | [ADR-062](../../adr/062-undocumented-endpoint-policy.md) |
| DECISION10 | api-policy | 같은 [ADR-062](../../adr/062-undocumented-endpoint-policy.md) 의 조건 4 를 고친다 | [ADR-062](../../adr/062-undocumented-endpoint-policy.md) |
| DECISION5 | auth-policy | 새 ADR(인증 방식 두 가지와 고르는 규칙) | 이 스펙 |
| DECISION12 | security-policy | [ADR-069](../../adr/069-macos-keychain-secret-store.md) 의 비밀 필드 목록을 넓힌다 | [ADR-069](../../adr/069-macos-keychain-secret-store.md) |
