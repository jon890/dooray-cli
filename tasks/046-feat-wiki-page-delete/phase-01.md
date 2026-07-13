# Phase 01 — client deleteWikiPage + page-delete 명령 + 등록

## 컨텍스트

Issue #87 — `dooray wiki page delete` 신규 명령.
**설계 단일 소스**: `docs/adr/032-wiki-page-delete.md` + `CLAUDE.md` "### wiki page delete (Issue #87, ADR-032)" 섹션. 먼저 정독하고 그대로 구현한다.
planning 결정 docs (ADR/CLAUDE.md/code-architecture/flow) 는 이미 반영됨 — **이 phase 에서 변경 금지**.

## 구현

1. **client** `src/api/client.ts` 에 `deleteWikiPage(wikiId, pageId)` 추가.
   - `DELETE wiki/v1/wikis/{wikiId}/pages/{pageId}`, plain `.delete()` (파일 API 307 처리 불요 — post log delete `deletePostLog` 패턴 참조).
   - 반환 `DoorayApiUnitResponse`. `try/catch` → `toDoorayCliError` (기존 메서드 동일).
   - 메서드 위 주석에 "비공식(미문서화) endpoint, ADR-032" 한 줄.
2. **명령** `src/commands/wiki/page-delete.ts` 신규 — `wikiPageDeleteCommand`.
   - 입력: `resolveWikiPageInput` 재사용 (`<project> <page-id>` / `--id`+`--project` / `--url` / positional URL). `page-file/delete.ts` 의 input 분기 참고하되 fileId 없음 (더 단순).
   - 옵션 `--yes` / `-y` "confirm 없이 삭제 (자동화용)".
   - 도움말 `.description()` 에 "(비공식 endpoint)" 표기.
   - confirm: `!opts.yes` 일 때
     - non-TTY (`!process.stdin.isTTY`) → `DoorayCliError` abort ("non-TTY … --yes 로 다시 실행", `EXIT_PARAM_ERROR`). `attachment-check.ts` 패턴 참조.
     - TTY → `@inquirer/prompts` confirm ("페이지 <pageId> 를 삭제할까요?"). 거부 시 stderr 안내 + 정상 종료(비삭제).
   - 삭제 실행: spinner → `deleteWikiPage` → stop.
3. **출력** — `--json {pageId, status:"deleted"}` / `--quiet pageId` / 기본 prose ("페이지(<pageId>)가 삭제되었습니다").
   - `formatters/file-output.ts` `emitDeleteResult` 가 `fileId` 전용 → pageId 로 쓰려면 **id 라벨을 받도록 일반화**하거나 `emitWikiPageDeleteResult` 신설. 과설계 피해 최소 변경으로 (권장: emit 함수에 `{ id, label }` 받는 형태로 일반화 + 기존 file 호출부 보존).
4. **등록** — `src/index.ts` 에서 `wikiPageDeleteCommand` import + wiki page 명령군에 `addCommand` (기존 `wikiPageEditCommand` 등록 지점 옆).

## code-review pitfalls self-check (docs/pitfalls/code-review/ — 코드 작성 직전 확인)

- **spinner 순서**: confirm(사용자 입력) → 그 다음 spinner 시작 → API. validation/confirm 전에 spinner 켜지 않기 (spinner-before-validation / resolver-before-editor 계열).
- **non-TTY 경고 vs 실제 동작 일치**: `--yes` 없고 non-TTY 면 실제로 abort. 경고 문구와 동작 mismatch 금지.
- **출력 모드 누락**: 조기 반환(confirm 거부) 분기 포함 모든 경로에서 `--json`/`--quiet` 고려. confirm 거부는 "삭제 안 함"이라 삭제 성공 출력 내보내지 않기.
- **exitCode**: abort/거부 시 적절한 exit (param 에러 abort = EXIT_PARAM_ERROR, confirm 거부 = 정상 0).

## 검증

```bash
pnpm build && pnpm tsc --noEmit 2>&1 | grep "^src/" | wc -l   # 기대 0
node dist/index.js wiki page delete --help                    # 명령 등록 + --yes 노출 확인
```

- 실제 삭제 API 호출은 파괴적이라 이 phase 에서 실행 안 함 (help/build/tsc 로 검증). 실측은 사용자가 테스트 페이지로.
- index.json phase 1 completed, current_phase 2. commit.
