# Phase 02 — 단위 테스트 + README/SKILL 갱신

## 컨텍스트

phase 1 의 `wiki page delete` 구현에 대한 테스트 + 사용자 문서.
README/SKILL 은 코드 산출물(실제 명령 시그니처)에 의존하므로 planning 이 아닌 **이 마지막 phase 에서** 갱신 (planning skill 갱신 시점 분리 규칙).

## 작업

1. **단위 테스트** — 순수 로직만 대상 (I/O·네트워크 없는 부분).
   - `emitDeleteResult`(또는 신설 emit) 를 pageId 로 일반화했으면 그 출력 스키마 테스트 (`formatters/file-output.test.ts` 패턴).
   - `resolveWikiPageInput` 은 기존 테스트(`resolvers/wiki-page-input.test.ts`)가 커버 — 신규 입력 분기 없으면 추가 불요.
   - confirm/삭제 흐름은 네트워크·TTY 의존이라 단위 테스트 대상 아님 (억지 mock 금지).
   - 테스트할 순수 함수가 없으면 "추가 테스트 없음 — 기존 커버" 로 명시하고 건너뛴다 (억지 생성 금지).
2. **README.md** — 위키 사용 예 섹션에 `dooray wiki page delete` 추가.
   - 공개 문서 규칙: ADR/Issue 번호 넣지 않기. 동작·사용법만.
   - confirm 기본 + `--yes` 언급.
3. **skills/dooray-cli/SKILL.md** — wiki 자동화 시나리오에 page delete 추가.
   - 자동화 맥락: `--yes` 로 비대화 삭제. 내부 참조 번호 금지.
4. **개인 식별 정보 / 공개 문서 검증 grep** (README/SKILL 수정 후):
   ```bash
   grep -rnE "ADR-[0-9]+|Issue #[0-9]+|task [0-9]+" README.md skills/dooray-cli/SKILL.md   # 0건
   grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ CLAUDE.md src/ 2>/dev/null | grep -vE "dooray\.com|gov-dooray\.com|dooray\.co\.kr|gov-dooray\.co\.kr|helpdesk\.dooray\.com|github\.com|npmjs\.com|example\.com|youtube\.com"   # 0건
   ```

## 검증

```bash
pnpm build && pnpm test 2>&1 | grep -E "Test Files|Tests "
pnpm tsc --noEmit 2>&1 | grep "^src/" | wc -l   # 0
```

- 전체 테스트 통과, tsc 0.
- README/SKILL 검증 grep 0건.
- index.json phase 2 completed + status "completed". commit.
