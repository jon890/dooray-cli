# Phase 01. `wiki page move` 를 만든다

**Execution profile**: standard

## 목표

`dooray wiki page move` 를 새로 만들어 위키 페이지의 부모를 바꾸고 형제 사이의 정렬을 바꾼다.
위키 간 이동도 같은 명령이 처리한다.

지금은 위키 트리를 정리하려면 페이지를 지우고 다시 만드는 수밖에 없고, 그러면 첨부와 인라인 이미지와 댓글과 페이지 ID 가 사라진다.

**범위 외**: `README.md` 와 스킬 문서는 phase 02 다.
`wiki page edit` 은 건드리지 않는다. 그 명령에 `--parent` 를 넣지 않는다.
공식 문서 대조와 틀린 서술 정정은 plan060 이 맡는다.

## 컨텍스트

**근거 문서**: `docs/adr/047-wiki-page-move.md`,
`docs/adr/036-delete-confirmation-policy.md`, `CLAUDE.md` 의 「명령 공통 규약」.

공식 API 스펙은 이렇다. 브라우저로 공식 문서를 열어 확인한 것이다.

```
POST /wiki/v1/wikis/{wiki-id}/pages/{page-id}/move
```

요청 본문의 필드는 넷이다.

| 필드 | 필수 | 뜻 |
| --- | --- | --- |
| `targetParentPageId` | 필수 | 이동 대상 부모 페이지 id |
| `targetWikiId` | 선택 | 이동 대상 위키 id |
| `withChildren` | 선택 | 하위 페이지까지 함께 이동. 기본값 참 |
| `beforePageId` | 선택 | 이 페이지 바로 뒤에 위치. `null` 이면 정렬 변경 없음, `0` 이면 맨 앞 |

응답은 `result` 가 `null` 이다. `header` 만 온다.

**이 저장소의 기존 서술이 틀렸다.** `skills/dooray-cli/references/wiki.md` 가
「전용 endpoint 도 없다」고 적고 `docs/adr/032-wiki-page-delete.md` 의 참고 절이
「`/move` 류 endpoint 없음」이라고 적었다. 둘 다 사실과 다르다.
그 정정은 plan060 이 맡으므로 이 phase 에서 그 파일들을 고치지 않는다.

현재 상태는 이렇다.

- `src/api/client.ts` 에 이동 메서드가 없다.
- `src/api/client.ts:656` 의 `deleteWikiPage(wikiId, pageId)` 가 `DoorayApiUnitResponse` 를 쓰는 선례다.
  `result` 가 `null` 인 응답에 그 타입을 쓴다.
- `src/api/client.ts:325` 가 `set-parent-post` 를 `post` 로 부르는 선례다. 업무 쪽의 같은 성격 작업이다.
- `src/commands/wiki/page-delete.ts` 가 `resolveWikiPageInput` 을 쓰고 네 입력 형태를 받는 완성된 예다.
- `src/commands/wiki/index.ts` 가 `wiki page` 하위 명령을 등록한다. 새 명령을 여기 더한다.
- `src/formatters/file-output.ts` 의 `emitDeleteResult` 가 `--json` 과 `--quiet` 과 산문 셋을 가르는 헬퍼다.

## 의도 메모

- `wiki page edit --parent` 로 넣지 않는다. ADR-047 이 그 이유를 담는다.
  `src/commands/post/edit.ts` 가 본문 수정과 상위 변경을 한 명령에 담은 결과로 경고 둘을 내고 있다.
- 확인 절차를 넣지 않는다. ADR-036 의 정책은 되돌릴 수 없는 삭제를 대상으로 하고 이동은 되돌려진다.
- `beforePageId` 의 세 상태를 구별해 보낸다. 미지정과 `0` 과 특정 페이지 ID 다.
  `0` 을 문자열로 보낼지 숫자로 보낼지는 공식 문서가 `"0"` 이라는 문자열 예시를 주지 않으므로
  다른 필드와 같이 문자열로 보낸다. 서버가 거부하면 숫자로 바꿔 확인하고 그 결과를 ADR 에 덧붙인다.
- `--no-children` 은 Commander 의 부정 플래그다. `--children` 을 정의하지 않고 `--no-children` 만 두면
  기본값이 참이 된다. 공식 기본값과 같다.
- 위키 간 이동에서 대상 위키 권한을 미리 확인하지 않는다. 4xx 로 드러난다.

## 작업 항목

### 1. `src/api/types.ts` 에 요청 타입을 더한다

`MoveWikiPageRequest` 를 export 한다.

```ts
export interface MoveWikiPageRequest {
  targetParentPageId: string;
  targetWikiId?: string;
  withChildren?: boolean;
  beforePageId?: string;
}
```

`targetParentPageId` 만 필수다. 나머지는 값이 있을 때만 본문에 넣는다.

### 2. `src/api/client.ts` 에 `moveWikiPage` 를 더한다

`moveWikiPage(wikiId: string, pageId: string, body: MoveWikiPageRequest)` 를 만들고
반환형은 `Promise<DoorayApiUnitResponse>` 로 둔다.

- `wiki/v1/wikis/` 아래 `wikiId` 와 `pages/` 와 `pageId` 와 `/move` 를 이은 경로를 `this.api.post` 로 부른다.
- 본문은 `json: body` 로 넘긴다. 기존 `post` 호출과 같은 형태다.
- `catch` 에서 `toDoorayCliError(e)` 를 `await` 해 던진다.

`deleteWikiPage` 근처에 둔다. 같은 리소스를 다루는 메서드끼리 모은다.

### 3. `src/commands/wiki/page-move.ts` 를 새로 만든다

`src/commands/wiki/page-delete.ts` 의 인자와 옵션 구성을 그대로 본뜬다. 확인 절차만 빼고 옵션을 더한다.

명령 이름은 `move` 이고 설명은 `위키 페이지 이동 (부모 변경, 정렬 변경, 위키 간 이동)` 으로 한다.

positional 과 입력 옵션은 `page-delete.ts` 와 같다.
첫 positional 과 둘째 positional 을 선택으로 두고 `--id`, `--url`, `--project` 를 받는다.

이동 옵션은 이렇다.

- `--parent <page-id>` 는 필수다. 설명은 `이동 대상 부모 페이지 ID (필수)` 로 한다.
- `--to-wiki <project|wikiId>` 는 선택이다. 설명은 `이동 대상 위키 (프로젝트 코드 또는 위키 ID)` 로 한다.
- `--before <page-id>` 는 선택이다. 설명은 `이 페이지 바로 뒤에 위치` 로 한다.
- `--first` 는 선택이다. 설명은 `형제 중 맨 앞으로 이동` 으로 한다.
- `--no-children` 은 선택이다. 설명은 `하위 페이지를 함께 옮기지 않는다 (기본은 함께 이동)` 으로 한다.

동작 순서는 이렇다.

1. `--parent` 가 없으면 `EXIT_PARAM_ERROR` 로 끝낸다.
   문구는 `--parent 는 필수입니다. 이동 대상 부모 페이지 ID 를 지정하세요.` 로 한다.
2. `--before` 와 `--first` 를 함께 주면 `EXIT_PARAM_ERROR` 로 끝낸다.
   문구는 `--before 와 --first 는 동시에 사용할 수 없습니다.` 로 한다.
3. `resolveWikiPageInput` 을 스피너보다 먼저 부른다. `page-delete.ts` 의 주석이 그 이유를 담는다.
4. `--to-wiki` 가 있으면 값을 판정한다.
   15자리 이상 numeric 이면 위키 ID 로 보고 그대로 쓴다.
   그 밖이면 프로젝트 코드로 보고 `resolveWiki(client, 값)` 으로 위키 ID 를 얻는다.
   판정에 쓰는 정규식은 `src/resolvers/project.ts` 의 `PROJECT_ID_RE` 를 가져다 쓴다.
5. 본문을 만든다. `targetParentPageId` 는 `--parent` 값이다.
   `--to-wiki` 를 해석한 값이 있으면 `targetWikiId` 에 넣는다.
   `--no-children` 이 주어졌으면 `withChildren` 을 거짓으로 넣는다. 주어지지 않으면 그 필드를 넣지 않는다.
   `--first` 가 주어졌으면 `beforePageId` 를 `"0"` 으로 넣는다.
   `--before` 가 주어졌으면 그 값을 넣는다. 둘 다 없으면 그 필드를 넣지 않는다.
6. `client.moveWikiPage` 를 부른다.

출력은 셋을 가른다.

- `--json` 은 `{ pageId, targetParentPageId, targetWikiId, withChildren, beforePageId, status: "moved" }` 를 낸다.
  값이 없는 필드는 넣지 않는다.
- `--quiet` 은 `pageId` 만 낸다.
- 기본은 산문이다. 어느 페이지가 어느 부모 아래로 갔는지 적고,
  하위 페이지가 함께 이동했는지를 한 문장으로 덧붙인다.
  `--no-children` 을 주지 않았으면 하위도 함께 이동했다고 알린다.

### 4. `src/commands/wiki/index.ts` 에 새 명령을 등록한다

`wiki page` 아래에 `move` 를 더한다. `delete` 를 등록하는 자리 근처에 둔다.

### 5. `src/commands/wiki/page-move.test.ts` 로 본문 조립을 검증하는 테스트를 만든다

명령 파일 전체를 돌리지 않고 본문을 만드는 부분을 순수 함수로 빼서 검증한다.
`buildMoveBody(opts, resolvedTargetWikiId)` 를 `page-move.ts` 에서 export 한다.

검증할 것은 이렇다.

- `--parent` 만 주면 `targetParentPageId` 하나만 든 본문이 나온다.
  `withChildren` 과 `beforePageId` 와 `targetWikiId` 가 본문에 없다.
- `--no-children` 을 주면 `withChildren` 이 거짓으로 들어간다.
- `--first` 를 주면 `beforePageId` 가 `"0"` 이 된다.
- `--before` 를 주면 `beforePageId` 가 그 값이 된다.
- 해석된 위키 ID 를 넘기면 `targetWikiId` 가 들어간다.
- 아무 선택 옵션도 없으면 본문의 키가 하나다.

옵션 충돌 판정도 순수 함수로 빼서 검증한다.
`validateMoveOptions(opts)` 를 export 하고 아래를 확인한다.

- `--parent` 가 없으면 `EXIT_PARAM_ERROR` 로 던지고 메시지에 `--parent` 가 들어간다.
- `--before` 와 `--first` 를 함께 주면 `EXIT_PARAM_ERROR` 로 던지고 메시지에 둘 다 들어간다.
- `--parent` 만 주면 던지지 않는다.

여러 줄 메시지를 정규식 하나로 이어 검사하지 않는다.
메시지에 각 문구가 들어 있는지를 따로 확인한다.

테스트 대상 파일 자체를 `vi.mock` 하지 않는다. 같은 파일 안의 함수 참조가 교체되지 않아 실제 구현이 불린다.

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
pnpm vitest run src/commands/wiki/page-move.test.ts
```

명령이 실제로 등록됐는지 확인한다.

```bash
# cwd: <repo root>
node dist/index.js wiki page move --help | grep -c -- "--parent"        # >= 1
node dist/index.js wiki page move --help | grep -c -- "--to-wiki"      # >= 1
node dist/index.js wiki page move --help | grep -c -- "--no-children"  # >= 1
node dist/index.js wiki page move --help | grep -c -- "--first"        # >= 1
node dist/index.js wiki page move --help | grep -c -- "--before"       # >= 1
```

다섯 다 1 이상이어야 한다.

`--parent` 없이 부르면 파라미터 오류로 끝나는지 확인한다.

```bash
# cwd: <repo root>
node dist/index.js wiki page move --id 1234567890123456789 > /dev/null 2>&1; echo $?   # = 3
```

공식 경로를 그대로 부르는지 확인한다.

```bash
# cwd: <repo root>
grep -c "pages/\${pageId}/move\|/move\`" src/api/client.ts   # >= 1
grep -c "v2/wapi" src/api/client.ts                          # = 0
```

두 번째가 0 이어야 한다. 웹 앱 내부 경로를 쓰지 않았다는 근거다.

개인 식별 정보 검사를 통과시킨다.

```bash
# cwd: <repo root>
bash scripts/check-pii.sh
```

테스트와 예시에는 `scripts/check-pii.sh` 의 `OK_IDS` 에 있는 값을 쓴다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/api/types.ts` | 수정 |
| `src/api/client.ts` | 수정 |
| `src/commands/wiki/page-move.ts` | 신규 |
| `src/commands/wiki/page-move.test.ts` | 신규 |
| `src/commands/wiki/index.ts` | 수정 |
