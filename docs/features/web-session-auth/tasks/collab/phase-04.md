# Phase 04. dooray-persona 스크립트가 CLI 를 부르게 한다

**Execution profile**: standard

## 목표

`skills/dooray-persona/scripts` 의 수집 단계가 자기 HTTP 호출과 인증 읽기 대신 `dooray ... --json` 명령을 불러, 같은 설정의 인증 방식(`api-key`·`web`)을 그대로 따른다.

**범위 외**: 문체 분류·통계·세션 스캔 스크립트(`classify.mjs`, `stats.mjs`, `scan-sessions.mjs`, `lib/signals.mjs`, `lib/stats.mjs`)는 Dooray 를 부르지 않아 바꾸지 않는다.

## 컨텍스트

**요구사항**: REQ14

**근거 문서**: 스펙 DECISION11, `skills/dooray-persona/references/collection.md`

**전제**: 이 phase 의 실제 웹 실행은 `project list`(PR1)와 `post list`·`post get`·`post comment list`(PR2)가 웹 방식에서 지원될 때 가능하다. PR2 가 머지되기 전에는 단위 테스트(CLI 실행을 가짜로 바꿈)까지만 확인하고, 웹 실행 확인은 PR2 머지 뒤로 미룬다.

## 현재 호출과 CLI 대응

| 지금(`lib/dooray.mjs`) | 바꿀 CLI 호출 |
| --- | --- |
| `loadApiConfig`, `readKeychainApiKey`, `keychainApiKeyAccount`, `createClient`, `createRateLimiter` | 삭제. 인증과 호출 간격은 CLI 가 맡는다 |
| `getMe` (`common/v1/members/me`) | **대응 명령이 없다.** 아래 「열린 결정」 |
| `listProjects` (`project/v1/projects?member=me`) | `dooray project list --json` (이미 `member=me`) |
| `listPosts` (`project/v1/projects/{id}/posts`, `order=-createdAt`, 100 건씩, `since` 에서 멈춤) | `dooray post list <projectId> --all --size 100 --order -createdAt --created "<since>~" --json` |
| `getPost` | `dooray post get --id <postId> --json` |
| `listComments` (`.../logs`, 100 건씩 전체) | `dooray post comment list --id <postId> --size 100 --page <n> --json` 을 빈 페이지까지 반복 |

- `post list` 의 첫 인자는 프로젝트 코드나 id 다. 스크립트는 대상의 `projectId` 를 넘긴다.
- 스크립트의 빈 페이지 재시도(`EMPTY_PAGE_*`)는 공개 API 의 속도 제한이 빈 결과로 나오는 것을 막으려던 것이다. CLI 가 토큰 버킷으로 간격을 지키므로 걷어낸다. CLI 가 429 로 끝내면(종료 코드 6) 스크립트도 그 메시지로 멈춘다.
- CLI 실행은 `child_process.execFile`(셸 없이)로 하고 인자는 배열로 넘긴다. 종료 코드가 0 이 아니면 CLI 의 stderr 를 그대로 보이되 쿠키·키가 들어갈 길은 없다(CLI 가 이미 가린다). `dooray` 실행 파일이 없으면 설치 안내로 멈춘다.
- 입력과 출력은 `--json` 이 공개 API 모양을 지키므로 `classifyInvolvement` 등 기존 판정 함수는 그대로 쓴다.

## 작업 항목

### 1. `lib/dooray.mjs` 를 CLI 호출 도우미로 바꾼다

공개 함수 이름과 반환 모양(`getMe`, `listProjects`, `listPosts`, `getPost`, `listComments`, `classifyInvolvement`)은 유지해 `collect.mjs`·`discover-targets.mjs` 의 바뀜을 호출 한 줄씩으로 줄인다. 실행기는 `runDooray(args, { execFile })` 로 주입 가능하게 만들어 테스트가 가짜로 바꾼다.

### 2. `collect.mjs`·`discover-targets.mjs` 에서 `loadApiConfig`·`createClient` 호출을 걷어낸다

스크립트에 쿠키나 API 키를 읽는 코드가 남지 않아야 한다(REQ14). `rg -n "apiKey|keychain|find-generic-password|SESSION|Authorization|baseUrl" skills/dooray-persona/scripts` 가 `config.mjs` 의 페르소나 설정 필드(`outputPath` 등)를 빼고 비어야 한다.

### 3. `lib/dooray.test.mjs` 를 CLI 호출 테스트로 바꾼다

가짜 `execFile` 로 인자 배열(예: `["post","list","<projectId>","--all","--size","100","--order","-createdAt","--created","2026-01-01~","--json"]`), 페이지 반복의 끝, 종료 코드·stderr 전달, `dooray` 미설치 안내를 확인한다. 기존 인증·키체인·속도 제한 테스트는 삭제한다.

### 4. 문서

`skills/dooray-persona/SKILL.md`, `references/collection.md`, `references/bootstrap.md` 와 `docs/guide/persona.md` 에서 「API 호출이 초당 5회를 넘으면」 「토큰을 따로 입력하지 않는다」 「키체인에서 읽는다」 같은 자기 호출 전제를 CLI 전제로 고친다. `docs/guide/persona.md` 에 「웹 방식에서는 `post` 명령이 웹을 지원해야 동작한다」 와 지원하지 않는 명령 표(없음)를 적는다.

## 열린 결정

스크립트가 내 organizationMemberId 를 얻을 CLI 명령이 없다. `member get` 은 id 를 받고 `me` 를 받지 않는다. 안은 둘이다.

- 안 1(권장): `dooray member get me` 가 `getMe` 결과를 낸다. `--from me` 처럼 이미 쓰는 `me` 표기와 같다. 대신 member 영역의 명령(`src/commands/member/get.ts`)과 지원 목록을 고쳐야 해 이 영역 담당 밖이다. 2단계 시작 때 ask 로 묻는다.
- 안 2: `post list <projectId> --from me --size 1 --json` 의 첫 업무에서 등록자 id 를 얻는다. 새 명령이 필요 없지만 내가 쓴 업무가 없는 프로젝트에서는 얻지 못해 프로젝트를 돌며 찾아야 한다.

## 검증

```bash
# cwd: 저장소 루트
pnpm test    # vitest 가 skills/dooray-persona/scripts/lib/*.test.mjs 도 돌린다
pnpm tsc --noEmit
pnpm run build
node scripts/check-pii.mjs
node scripts/check-public-refs.mjs
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `skills/dooray-persona/scripts/lib/dooray.mjs`, `dooray.test.mjs` | CLI 호출로 교체 |
| `skills/dooray-persona/scripts/collect.mjs`, `discover-targets.mjs` | 인증 읽기 제거 |
| `skills/dooray-persona/SKILL.md`, `references/collection.md`, `references/bootstrap.md` | 전제 문구 |
| `docs/guide/persona.md` | CLI 전제와 웹 방식 안내 |
