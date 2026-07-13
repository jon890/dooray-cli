# Phase 02 — messenger 명령 (send / channel-send) + 등록

## 컨텍스트

phase 1 의 client/resolver 위에 CLI 명령을 얹는다.
**설계 단일 소스**: `docs/adr/033-messenger-send.md` + `CLAUDE.md` "### messenger". planning docs 변경 금지.

## 작업 항목 (5개 이하)

1. **`src/commands/messenger/index.ts`** — `messengerCommand` (`new Command("messenger")`) 조립, `send`/`channel-send` 서브커맨드 addCommand. `src/index.ts` 에 top-level 등록 (mail/wiki 등록 지점 옆).
2. **`src/commands/messenger/send.ts`** — `messenger send`.
   - `--to <id|email>` (필수, 단일값 — direct-send 는 1:1), `--body` / `--body-file` / `-y` 불요.
   - `--to` 해석: `resolveMemberByIdOrEmail`; null 이면 `DoorayCliError` "id 또는 이메일을 사용하세요 (이름 미지원)".
   - body: `--body` / `--body-file`(`-`=stdin), 없으면 `$EDITOR` fallback (comment add 의 body 수집 패턴 재사용).
   - `sendDirectMessage(memberId, text)` → 출력.
3. **`src/commands/messenger/channel-send.ts`** — `messenger channel-send`.
   - `--channel <channelId|이름>` (필수), body 동일.
   - `--channel` 해석: `resolveMessengerChannel`.
   - `sendChannelMessage(channelId, text)` → 출력.
4. **출력** (두 명령 공통): `--json` = `res.result` raw / `--quiet` = `res.result.id` / 기본 prose ("메시지를 전송했습니다 (log-id: X)"). file upload `--json = res.result` 패턴 참조.

## code-review pitfalls self-check (docs/pitfalls/code-review/)
- **spinner 순서**: 입력 검증(`--to`/`--channel` resolve) + body 수집($EDITOR) → **그 다음** spinner 시작 → API. resolver-before-editor / spinner-before-validation 위반 금지.
- **body 없음 처리**: `--body`/`--body-file`/$EDITOR 모두 실패 시(예: non-TTY + body 없음) 명확한 에러 (EDITOR 미설정 에러 재사용).
- **출력 모드**: `--json`/`--quiet` 모든 경로 일관. spinner 는 stderr, 데이터는 stdout.
- **exitCode**: resolve 실패 EXIT_PARAM_ERROR, API 실패는 toDoorayCliError.

## 검증

```bash
pnpm build && pnpm tsc --noEmit 2>&1 | grep "^src/" | wc -l   # 0
node dist/index.js messenger --help
node dist/index.js messenger send --help          # --to/--body/--body-file 노출
node dist/index.js messenger channel-send --help  # --channel/--body 노출
```
- 실전송 없음 (help/build/tsc). 실측은 사용자가 자기 계정으로.
- index.json phase 2 completed, current_phase 3. commit.
