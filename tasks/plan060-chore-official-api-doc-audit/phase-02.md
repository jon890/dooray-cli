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

**`plan059` 를 기다리지 않는다.**
그 plan 의 phase 02 도 `CLAUDE.md` 의 page-only fetch 서술과
`src/resolvers/wiki-page-input.ts` 의 `INPUT_HELP` 를 고친다.
아래 항목 5 가 그 두 자리를 실측으로 판정한다.
이미 고쳐져 있으면 건너뛰고 남아 있으면 이 phase 가 고친다. 어느 쪽이든 결과가 같다.

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

없다. `plan059` 를 기다리지 않는다.

두 plan 이 `CLAUDE.md` 의 같은 자리를 고칠 수 있으므로 아래 항목 5 가 그것을 실측으로 가른다.
이미 고쳐져 있으면 건너뛰고, 남아 있으면 이 phase 가 고친다.
어느 쪽이든 결과는 같아 머지에서 부딪히지 않는다.

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
ADR-046 에서도 ADR-032 를 **마크다운 링크로** 걸어 양방향으로 찾을 수 있게 한다.
지금 그 파일에 `ADR-032` 가 평문으로 세 번 나오지만 링크는 0건이다.
그래서 링크 형태를 검증한다. 문자열 등장 수를 세면 아무 작업 없이 통과한다.

`비공식` 이 이 파일에 세 줄 있다. 실측으로 확인했다.
1행 제목, 4행 결정 본문, 14행 「미확인」 절이다. 각각 다르게 다룬다.

**제목은 고친다.** 지금 제목이 `ADR-032: wiki page delete — 비공식(미문서화) DELETE endpoint` 다.
결정만 읽고 지나가는 독자가 제목에서 낡은 판정을 얻는다.
`비공식(미문서화)` 를 떼고 삭제 endpoint 를 감쌌다는 뜻으로 다시 쓴다.
제목의 엠대시도 함께 없앤다. `check-readability.py` 가 제목의 엠대시를 위반으로 잡는다.

**결정 본문 4행과 미확인 절 14행은 그대로 둔다.** 그것이 당시의 판단 기록이다.
ADR 은 지우지 않는다는 규칙이 여기 적용된다. `대체된 부분` 이 그 둘을 가리켜 정정한다.
그래서 이 파일에서 `비공식` 이 0건이 되지 않는다. 그것을 기대값으로 쓰지 않는다.

4행이 「명령 도움말과 클라이언트 메서드 주석에 표기해」 라고 지시하는 부분은
`대체된 부분` 에서 그 지시가 더 이상 유효하지 않다고 밝힌다. 4행 자체를 고치지 않는다.
실제 코드의 표기를 없애는 것은 아래 항목 3 과 4 가 맡는다.

**편집한 뒤 이 파일에 가독성 검사를 돌린다.** 실측으로 1행과 27행이 걸린다.
27행은 아래에서 고칠 `/move` 참고 줄이므로 함께 해소된다.

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
0 이 아니면 이 phase 가 고친다. 고칠 내용은 이렇다.

`CLAUDE.md` 의 입력 형식 항목에 wiki 의 `--id` 모드가 `--project` 동반 필수이며
위키 API 가 page-only fetch 를 지원하지 않는다고 적은 줄이 있다.
공식 API 에 `GET /wiki/v1/pages/{page-id}` 가 있어 사실이 아니다.
`--id` 는 단독으로 동작하며 `--project` 는 선택이고 주면 wikiId 해석 호출을 아낀다는 내용으로 바꾼다.
`src/resolvers/wiki-page-input.ts` 의 `INPUT_HELP` 에 같은 취지의 문구가 있으면 함께 고친다.

**코드는 고치지 않는다.** 문구만 고친다.
`--project` 요구를 실제로 없애는 구현은 `plan059` 가 맡는다.
그 plan 이 머지되기 전이면 문서가 앞서 나간 상태가 되지만, 둘 다 같은 사실을 향하므로 어긋나지 않는다.
이 phase 는 틀린 서술을 없애는 것이 목적이다.

### 6. `docs/adr/INDEX.md` 에 ADR-046 을 등재하고 ADR-032 줄을 고친다

ADR-046 은 한 줄을 append 한다.

ADR-032 줄은 예외로 고친다. 지금 `wiki page delete 비공식(미문서화) DELETE endpoint` 로 적혀 있어
제목과 같은 낡은 판정을 담고 있다. 위 항목 2 에서 고친 제목과 같은 문구로 맞춘다.

다른 줄은 고치지 않는다. 동시에 도는 다른 planning 이 각자 자기 줄을 append 하고 있어
기존 줄을 함께 손대면 머지에서 부딪힌다. ADR-032 줄 하나만 예외다.

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
grep -c "비공식 endpoint" src/commands/wiki/page-delete.ts        # = 0
head -1 docs/adr/032-wiki-page-delete.md | grep -c "비공식"        # = 0
head -1 docs/adr/032-wiki-page-delete.md | grep -c "—"             # = 0
grep -c "미문서화" docs/adr/INDEX.md                               # = 0
grep -c "대체된 부분" docs/adr/032-wiki-page-delete.md             # = 1
grep -c "](046-official-api-doc-precedence.md)" docs/adr/032-wiki-page-delete.md   # >= 1
grep -c "](032-wiki-page-delete.md)" docs/adr/046-official-api-doc-precedence.md   # >= 1
grep -c "ADR-046" docs/adr/INDEX.md                                # = 1
python3 ~/.claude/scripts/check-readability.py docs/adr/032-wiki-page-delete.md; echo $?   # = 0
```

아홉 기대값이 모두 맞아야 한다.
제목만 보는 두 줄이 본문의 역사 기록과 제목의 낡은 판정을 가른다.
마크다운 링크를 세는 두 줄이 ADR 을 양방향으로 찾을 수 있게 했다는 근거다.
문자열 등장 수로 세면 지금도 통과하므로 링크 형태를 본다.

`대체된 부분` 이 결정 바로 아래에 있는지 확인한다.

```bash
# cwd: <repo root>
grep -n "결정\|대체된 부분\|맥락" docs/adr/032-wiki-page-delete.md | head -5
```

`대체된 부분` 의 줄 번호가 `결정` 보다 크고 `맥락` 보다 작아야 한다.
결정만 읽고 지나가는 독자가 낡은 결론을 얻는 것을 막는 것이 그 위치의 목적이다.

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
