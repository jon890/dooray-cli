# Phase 03 — 단위 테스트 + README/SKILL 갱신

## 컨텍스트

phase 1~2 구현의 테스트 + 사용자 문서.
README/SKILL 은 코드 산출물 의존 → planning 이 아닌 이 마지막 phase 에서 갱신 (갱신 시점 분리).

## 작업 항목 (5개 이하)

1. **단위 테스트** — 순수 로직만 (네트워크·TTY 의존 제외, 억지 mock 금지).
   - `resolveMemberByIdOrEmail`: 15+자리 → id 반환, 이메일 → (searchMembers mock) 경로, 그 외 → null 반환. (member.test.ts 패턴, client mock 최소.)
   - `resolveMessengerChannel`: numeric → 그대로, 이름 정확/부분/모호/없음 분기 (getMessengerChannels mock, title 빈값 제외 확인). resolver 테스트 패턴 참조.
   - 출력 emit 은 기존 `res.result` raw 방식이면 별도 헬퍼 없을 수 있음 — 있으면 테스트, 없으면 생략.
2. **README.md** — 메신저 사용 예 섹션 추가 (DM + channel-send). 공개 문서 규칙: ADR/Issue 번호 금지, 동작·사용법만.
3. **skills/dooray-cli/SKILL.md** — messenger 자동화 시나리오 추가 (배포 알림 등 `--to`/`--channel` + `--body`). 내부 참조 번호 금지.
4. **검증 grep** (README/SKILL 수정 후):
   ```bash
   grep -rnE "ADR-[0-9]+|Issue #[0-9]+|task [0-9]+" README.md skills/dooray-cli/SKILL.md   # 0건
   grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ CLAUDE.md src/ 2>/dev/null | grep -vE "dooray\.com|gov-dooray\.com|dooray\.co\.kr|gov-dooray\.co\.kr|helpdesk\.dooray\.com|github\.com|npmjs\.com|example\.com|youtube\.com"   # 0건 (placeholder 만)
   ```

## 검증

```bash
pnpm build && pnpm test 2>&1 | grep -E "Test Files|Tests "
pnpm tsc --noEmit 2>&1 | grep "^src/" | wc -l   # 0
```
- 전체 테스트 통과, tsc 0, README/SKILL grep 0건.
- index.json phase 3 completed + status "completed". commit.

## 구현 완료 후 (다음 세션 안내)

- feat/047-feat-messenger-send branch 에서 구현 → PR (`feat(commands): add messenger send/channel-send`).
- 독립 code-reviewer 리뷰 (spinner 순서 / body 없음 / 출력 모드 / 공유 헬퍼 하위호환) 후 머지.
- 실전송 실측: 본인 계정 DM + 테스트 채널로 1회씩.
