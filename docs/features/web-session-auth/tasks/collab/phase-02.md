# Phase 02. stream 명령을 웹 방식으로 돌게 한다

**Execution profile**: standard

## 목표

`stream list` 가 웹 방식에서 공식 응답 모양(`{type, <type>: {…}}` 원소와 `cursor`)으로 돈다. `--before`, `--since`, `--unread`, `--all`, `--size` 가 그대로 동작한다.

**범위 외**: 웹에만 있는 카드(`calendar`)와 공식 종류 `project`·`fileEvent` 는 낸 적이 없어 지원하지 않는다.

## 컨텍스트

**요구사항**: REQ6, REQ8

**근거 문서**: `docs/api/web-endpoints/stream.md`

**전제**: PR1 머지 뒤 main 의 `StreamClient`(`src/api/stream/types.ts`), `WebContext`·`WebHttp`.

## 작업 항목

### 1. 응답 고정 파일

`src/api/web/fixtures/stream/responses.json` 에 카드 목록(`mail`, `post`+`eventList`, `page`+댓글, `schedule`, 웹에만 있는 `calendar` 카드)과 `references` 맵(`mailMap`, `postMap`, `eventMap`, `pageMap`, `pageCommentMap`, `scheduleMap`, `organizationMemberMap`, `nextTimestamp`)을 직접 쓴다. 가짜 id·이름만 쓴다.

### 2. `src/api/stream/web.ts` 의 `createStreamWeb(context): StreamClient`

- `getStreams(params)`: `GET v2/wapi/streams` 에 `services=project,mail,calendar,drive,wiki,contacts,ai`, `size`, `before`, `read` 를 보낸다. `Dooray-Api-Version` 은 붙이지 않는다(결과가 같다).
- 카드를 공식 원소로 바꾸는 순수 함수를 `src/api/stream/web-convert.ts` 에 둔다: `mail`, `post`(+ `eventList` 마다 `event` 원소), `page`(+ 위키 댓글 `pageComment` 원소), `schedule`. 사용자 객체는 `{type, member{organizationMemberId, name}}` 로 줄인다. 공식에 없는 카드·하위 항목은 뺀다.
- `result.references.nextTimestamp` 를 `cursor` 로 올린다. 끝에서는 `cursor` 없이 빈 `result` 를 낸다.
- 뺀 카드의 개수는 stderr 한 줄로 알린다(출력이 달라지는 것을 숨기지 않는다).
- 참조 맵에 카드의 id 가 없으면 `EXIT_API_ERROR` 로 멈춘다. 웹 쪽 변경을 조용히 넘기지 않는다는 설계 규칙을 따른다.

### 3. `src/api/stream/web.test.ts`

가짜 `fetch` 로 `services`·`size`·`before`·`read` 쿼리, 카드→원소 변환(고정 파일), `cursor` 승격, 빈 응답, 알 수 없는 카드를 뺀 개수 알림, 참조 누락 오류를 확인한다. 변환 결과의 키·구조가 `docs/api/web-endpoints/stream.md` 의 공식 필드와 같은지 본다. 기존 `src/commands/stream/list.test.ts` 가 쓰는 `Pick<…>` 대신 영역 계약 타입을 쓴다.

### 4. 지원 목록·배선

`src/commands/web-support/stream.ts`(`"stream list": []`), `src/api/web/index.ts` 의 `stream` 한 줄, `src/commands/web-support.ts` 영역 파일 한 줄. `src/commands/stream/list.ts` 는 `createClient(config)` 와 `StreamClient` 를 쓴다. `Pick<DoorayApiClient, "getStreams">` 같은 메서드 이름 나열은 영역 계약 타입으로 바꾼다.

### 5. 문서

stream 은 지원하지 않는 옵션이 없어 가이드 표에 줄이 늘지 않는다. 웹 방식의 차이(카드 하나가 원소 여러 개가 되어 `--size` 가 카드 수인 점, 웹에만 있는 알림 제외)는 `docs/api/web-endpoints/stream.md` 가 소유한다. stream 을 설명하는 `README.md`·`skills/dooray-cli/SKILL.md` 는 이 영역 담당 밖이라 고치지 않고, 고칠 일이 생기면 코디네이터에게 알린다.

## 검증

```bash
# cwd: 저장소 루트
pnpm test
pnpm tsc --noEmit
pnpm run build
pnpm api:inventory
node scripts/check-pii.mjs
node scripts/check-public-refs.mjs
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/api/stream/web.ts`, `src/api/stream/web-convert.ts`, `src/api/stream/web.test.ts` | 신규 |
| `src/api/web/fixtures/stream/responses.json` | 신규 |
| `src/commands/web-support/stream.ts` | 신규 |
| `src/api/web/index.ts`, `src/commands/web-support.ts` | 한 줄씩 |
| `src/commands/stream/list.ts` | 클라이언트 생성과 타입 |
