# Phase 02. 코드와 내부 문서의 틀린 API 서술을 고친다

**Execution profile**: standard

## 목표

공식 문서와 어긋난 것으로 확인된 서술을 코드 주석과 내부 문서에서 고친다.
그리고 phase 01 의 스크립트가 낸 목록을 읽어 아직 찾지 못한 어긋남을 더 찾는다.

**범위 외**: `README.md` 와 `skills/` 는 phase 03 이다.
새 기능을 만들지 않는다. `wiki page move` 는 Issue #148 의 별도 plan 이 맡는다.
`plan059` 가 고치는 자리는 건드리지 않는다. 아래 컨텍스트가 그 목록을 준다.

## 컨텍스트

**근거 문서**: `docs/adr/046-official-api-doc-precedence.md`.

이미 확인된 어긋남은 셋이다. 공식 문서를 브라우저로 직접 열어 확인한 결과다.

| 저장소 서술 | 위치 | 공식 문서 |
| --- | --- | --- |
| 위키 API 가 page-only fetch 를 지원하지 않는다 | `CLAUDE.md`, `src/resolvers/wiki-page-input.ts` | `GET /wiki/v1/pages/{page-id}` 가 있다 |
| 위키 페이지 이동 endpoint 가 없다 | `skills/dooray-cli/references/wiki.md`, `docs/adr/032-wiki-page-delete.md` 의 참고 절 | `POST /wiki/v1/wikis/{wiki-id}/pages/{page-id}/move` 가 있다 |
| 페이지 삭제가 비공식 미문서화 endpoint 다 | `docs/adr/032-wiki-page-delete.md` 의 결정 | `DELETE /wiki/v1/wikis/{wiki-id}/pages/{page-id}` 가 문서에 있다 |

**`plan059` 가 이미 고치는 자리는 건드리지 않는다.**
그 plan 의 phase 02 가 `CLAUDE.md` 의 page-only fetch 서술과
`src/resolvers/wiki-page-input.ts` 의 `INPUT_HELP` 를 고친다.
`plan059` 가 머지된 뒤 이 phase 를 실행하고, 그 두 자리가 이미 고쳐졌는지 확인한다.
아직 남아 있으면 이 phase 가 고친다.

`skills/dooray-cli/references/wiki.md` 는 `plan059` 의 phase 04 도 건드린다.
그 파일의 이동 관련 절은 이 phase 가 아니라 phase 03 이 맡는다. 공개 문서이기 때문이다.

ADR 은 지우지 않는다. 결정 전체가 번복돼도 `status` 를 `superseded` 로 바꾸고
`대체된 부분` 에 대체한 ADR 을 가리킨다. 형식은 공용 코어의 `references/task-create.md` 가 소유한다.

ADR-032 는 전체가 번복된 것이 아니다. 삭제 명령을 만든 결정과 하위 페이지 재부착 실측은 그대로 유효하다.
`비공식 미문서화` 라는 판정과 이동 endpoint 가 없다는 참고만 사실과 다르다.

## 의도 메모

- ADR-032 를 `superseded` 로 바꾸지 않는다. 결정이 뒤집힌 것이 아니라 근거 서술이 낡았다.
  `대체된 부분` 절을 결정 바로 아래에 넣어 어느 서술이 정정됐는지 밝힌다.
- 확인 날짜를 서술에 붙이지 않는다. ADR-046 이 그 방식을 기각했다.
  날짜가 있어도 읽는 사람이 그 서술을 의심할 근거가 되지 않는다.
- 코드 주석의 API 서술도 대상이다. 주석은 사용자에게 노출되지 않지만 다음 구현자가 근거로 읽는다.
- `docs/pitfalls/` 는 대상이 아니다. 코드 리뷰와 plan 작성의 함정이라 API 서술이 아니다.

## Blocked 조건

- `plan059` 가 머지되지 않았으면 `PHASE_BLOCKED: plan059 미머지` 를 출력하고 멈춘다.
  `git log origin/main --oneline -30 | grep -c "plan059\|page-only"` 로 판정한다.
  같은 자리를 두 plan 이 동시에 고치면 머지에서 부딪힌다.

## 작업 항목

### 1. phase 01 의 스크립트를 돌려 어긋남을 더 찾는다

```bash
# cwd: <repo root>
node scripts/api-endpoint-inventory.mjs
```

`구현에 있고 공식에 없는 것` 목록을 읽는다. 그 목록의 각 항목마다 둘 중 하나다.

- 비공식 endpoint 를 쓰고 있다. 그 사실이 ADR 이나 주석에 적혀 있는지 확인한다.
- 스냅샷이 낡았다. 공식 문서를 다시 열어 확인한다.

`공식에 있고 구현에 없는 것` 목록도 읽는다.
그중 저장소 문서가 「없다」 또는 「불가능하다」고 적어 둔 것이 있는지 찾는다.

```bash
# cwd: <repo root>
grep -rn "불가능\|지원하지 않\|없다\|endpoint 없" docs/adr/ CLAUDE.md src/ --include="*.md" --include="*.ts" | grep -iE "api|endpoint" | head -40
```

찾은 것을 아래 항목들과 같은 방식으로 고친다.
새로 찾은 것이 없으면 없다고 보고에 적는다.

### 2. `docs/adr/032-wiki-page-delete.md` 를 정정한다

`대체된 부분` 절을 **결정 바로 아래**에 넣는다. 문서 끝이나 대안 기각 안에 넣지 않는다.
결정만 읽고 지나가는 독자가 낡은 결론을 얻는 것을 막는 것이 목적이다.

담을 내용은 둘이다.

- `비공식(미문서화) DELETE endpoint` 라는 판정이 지금은 사실과 다르다.
  `DELETE /wiki/v1/wikis/{wiki-id}/pages/{page-id}` 가 공식 API 문서에 있다.
  당시 문서 상태에서는 맞았을 수 있다.
- 문서 끝 「참고」 절의 「`/move` 류 endpoint 없음」 도 사실과 다르다.
  `POST /wiki/v1/wikis/{wiki-id}/pages/{page-id}/move` 가 공식 API 문서에 있다.

`대체된 부분` 은 `docs/adr/046-official-api-doc-precedence.md` 를 가리킨다.
ADR-046 에서도 ADR-032 를 링크해 양방향으로 찾을 수 있게 한다.

결정 본문과 실측 관찰은 고치지 않는다. 삭제 명령을 만든 것과 하위 페이지 재부착은 그대로 유효하다.

명령 도움말과 클라이언트 메서드 주석에 `비공식` 을 표기하라는 지시도 고친다.

### 3. `src/commands/wiki/page-delete.ts` 의 도움말을 고친다

`description` 이 `위키 페이지 삭제 (비공식 endpoint)` 다.
공식 API 에 있으므로 `(비공식 endpoint)` 를 뗀다.

### 4. `src/api/client.ts` 의 주석을 고친다

`deleteWikiPage` 근처에 비공식이나 미문서화를 뜻하는 주석이 있으면 고친다.

```bash
# cwd: <repo root>
grep -n "비공식\|미문서화\|공식 문서에 없" src/api/client.ts
```

찾은 자리마다 공식 문서를 확인한 뒤 고친다.
정말로 공식 문서에 없는 것은 그대로 둔다. 확인한 결과를 보고에 적는다.

### 5. `plan059` 가 고쳤어야 할 두 자리를 확인한다

```bash
# cwd: <repo root>
grep -c "page-only fetch" CLAUDE.md                              # = 0
grep -c "page-only fetch" src/resolvers/wiki-page-input.ts       # = 0
```

둘 다 0 이면 `plan059` 가 고친 것이다. 아무것도 하지 않는다.
0 이 아니면 이 phase 가 고친다. 고칠 내용은 `docs/adr/045-wiki-page-standalone-fetch.md` 가 소유한다.

### 6. `docs/adr/INDEX.md` 에 ADR-046 을 등재한다

한 줄을 append 한다. 기존 줄을 고치지 않는다.
동시에 도는 다른 planning 과 같은 줄을 건드리지 않기 위해서다.

### 7. `scripts/api-endpoint-inventory.test.mjs` 에 정정 대상 회귀 테스트를 더한다

phase 01 에서 만든 파일에 더한다. 이 phase 가 고친 것이 되돌아가지 않게 한다.

- 공식 목록 스냅샷에 `POST /wiki/v1/wikis/{wiki-id}/pages/{page-id}/move` 가 들어 있다.
- 공식 목록 스냅샷에 `GET /wiki/v1/pages/{page-id}` 가 들어 있다.
- 공식 목록 스냅샷에 `DELETE /wiki/v1/wikis/{wiki-id}/pages/{page-id}` 가 들어 있다.

스냅샷 파일을 읽어 판정한다. 세 줄이 사라지면 스냅샷이 잘못 갱신된 것이다.

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm run build
pnpm test
```

셋 다 통과해야 한다.

```bash
# cwd: <repo root>
pnpm vitest run scripts/api-endpoint-inventory.test.mjs
```

정정이 실제로 들어갔는지 확인한다.

```bash
# cwd: <repo root>
grep -c "비공식 endpoint" src/commands/wiki/page-delete.ts   # = 0
grep -c "대체된 부분" docs/adr/032-wiki-page-delete.md        # = 1
grep -c "ADR-046" docs/adr/032-wiki-page-delete.md            # >= 1
grep -c "ADR-032" docs/adr/046-official-api-doc-precedence.md # >= 1
grep -c "ADR-046" docs/adr/INDEX.md                           # = 1
```

다섯 기대값이 모두 맞아야 한다. 마지막 둘이 ADR 을 양방향으로 찾을 수 있게 했다는 근거다.

`대체된 부분` 이 결정 바로 아래에 있는지 확인한다.

```bash
# cwd: <repo root>
grep -n "결정\|대체된 부분\|맥락" docs/adr/032-wiki-page-delete.md | head -5
```

`대체된 부분` 의 줄 번호가 `결정` 보다 크고 `맥락` 보다 작아야 한다.

개인 식별 정보 검사를 통과시킨다.

```bash
# cwd: <repo root>
bash scripts/check-pii.sh
```

## Critical Files

| 파일 | 변경 |
|---|---|
| `docs/adr/032-wiki-page-delete.md` | 수정 |
| `docs/adr/046-official-api-doc-precedence.md` | 수정 |
| `docs/adr/INDEX.md` | 수정 |
| `src/commands/wiki/page-delete.ts` | 수정 |
| `src/api/client.ts` | 수정 |
| `scripts/api-endpoint-inventory.test.mjs` | 수정 |
