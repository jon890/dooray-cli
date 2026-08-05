# Phase 5: 빌드 + 테스트 + help/docs 정합성 + 시나리오 검증

## 컨텍스트

phase 1-4 산출물 통합 검증. 코드 변경 없음(문서·help 검증 + 실호출).

### 먼저 읽을 파일

- `tasks/011-feat-post-input-unification/index.json` — phase 1-4 상태 확인
- `docs/adr.md` ADR-020
- `CLAUDE.md` 표 / 주의사항

## 작업 목록 (5개)

### 1) 빌드 + 단위 테스트

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm build
pnpm test
```

기대:
- 빌드 성공, warning 없음
- 모든 vitest 테스트 통과 (URL parser 8+ + resolvePostInput 6+)
- `dist/index.js` 안에 "vitest" 또는 테스트 코드 미포함:
  ```bash
  grep -c "vitest\|describe\|expect(" dist/index.js
  ```
  → 0 또는 무관 매칭만 (vitest 라이브러리 내부 코드는 미포함이어야 함)

### 2) `--help` 출력 검증

12개 명령 각각 `--help` 호출 후 옵션 노출 확인:

```bash
node dist/index.js post get --help            # --id, --url
node dist/index.js post edit --help           # --id, --url
node dist/index.js post done --help           # --id, --url
node dist/index.js post workflow --help       # --id, --url, --workflow
node dist/index.js post comment add --help    # --id, --url
node dist/index.js post comment edit --help   # --id, --url, --comment-id
node dist/index.js post comment delete --help # --id, --url, --comment-id
node dist/index.js post comment list --help   # --id, --url
node dist/index.js post file upload --help    # --id, --url, --file
node dist/index.js post file download --help  # --id, --url, --file-id
node dist/index.js post file download-all --help # --id, --url
node dist/index.js post file list --help      # --id, --url
node dist/index.js post file delete --help    # --id, --url, --file-id
```

(workflow는 명령 1개 — 위 13개 중복은 무시).

### 3) docs 정합성 grep

```bash
# CLAUDE.md 표에 ADR-020 등록 확인
grep -c "ADR-020" CLAUDE.md
# → 1 이상

# CLAUDE.md 주의사항에 12개 명령 안내 확인
grep -c "post 하위 12개 명령\|--id <postId>" CLAUDE.md
# → 1 이상

# ADR-020 본문 존재
grep -c "^## ADR-020" docs/adr.md
# → 1
```

### 4) 실호출 시나리오 (best-effort, 사용자 환경 의존)

**시나리오 A — 기존 호환** (positional 2개):
```bash
node dist/index.js post get <project> 337
```
→ 기존과 동일 동작.

**시나리오 B — `--id` 모드**:
```bash
node dist/index.js post get --id 1234567890123456789
node dist/index.js post comment list --id 1234567890123456789
```

**시나리오 C — URL 첫 positional**:
```bash
node dist/index.js post get https://<tenant>.dooray.com/task/to/1234567890123456789
```

**시나리오 D — sub-id 옵션**:
```bash
# comment edit
node dist/index.js post comment edit --id 1234567890123456789 --comment-id <id> --body "test"

# file upload
node dist/index.js post file upload --id 1234567890123456789 --file ./test.txt

# file download
node dist/index.js post file download --id 1234567890123456789 --file-id <id>
```

**시나리오 E — 충돌 에러**:
```bash
node dist/index.js post get --id 1 --url https://x.dooray.com/task/to/2
# stderr: "--id와 --url은 동시에 사용할 수 없습니다."

node dist/index.js post get --id 1 <project> 337
# stderr: "--id/--url과 positional 인자(<project> <post-number>)는 동시에 사용할 수 없습니다."

node dist/index.js post get
# stderr: "업무를 식별할 정보가 부족합니다. ..."
```

각 케이스 exit code non-zero (`EXIT_PARAM_ERROR`) 확인:
```bash
node dist/index.js post get; echo "exit=$?"
# → exit=2 (또는 EXIT_PARAM_ERROR 정의 값)
```

> 시나리오 B-D는 사용자 환경(API 키, 실제 post-id) 필요 — best-effort. 시나리오 A/E는 인증 없이도 일부 검증 가능 (E는 입력 검증 단계).

### 5) Issue #16 close 준비

PR 머지 후 별도로 진행:
```bash
gh issue comment 16 --body "PR #N 에서 구현 — --id/--url/URL positional 모두 지원. 12개 명령 적용. ADR-020 참조."
gh issue close 16
```

본 phase에서는 commit/PR 만들 때 close 키워드 사용 권장 (`Closes #16` in commit body).

## 성공 기준

- [ ] `pnpm build` 성공 (warning 없음)
- [ ] `pnpm test` 모든 테스트 통과
- [ ] 12개 명령 `--help`에 `--id`/`--url` 노출
- [ ] sub-id 옵션화 명령 4개(`comment edit`, `comment delete`, `file download`, `file delete`)에 sub-id 옵션 노출 + `file upload`에 `--file`
- [ ] 시나리오 E (충돌·빈 입력 에러) 정상 동작 — non-zero exit + 안내 메시지
- [ ] (선택) 시나리오 A 기존 호출 호환
- [ ] (선택) 시나리오 B/C/D 실호출 성공
- [ ] CLAUDE.md ADR-020 행 + 12개 명령 안내 존재
- [ ] `dist/index.js` 번들에 vitest/테스트 코드 미포함

## 주의사항

- **시나리오 A 회귀 검증이 핵심**: 기존 사용자가 깨지면 안 됨
- **이슈 close commit 메시지에 `Closes #16` 포함** (본 task 머지 시 자동 close)
- **vitest watch 모드는 검증에 사용 금지** — `pnpm test`(run 모드)만 사용
- **테스트 파일이 번들에 포함되면 phase 1 retry**: tsup 설정 검토 (`entry`만 명시되어 있으면 자동 제외)

## Blocked 조건

- 시나리오 E 충돌 케이스가 통과하지 않음 (분기 누락) → `PHASE_BLOCKED: resolvePostInput 분기 결함`
- `--help` 출력에 옵션 미노출 → `PHASE_BLOCKED: 해당 phase 미완료`
- vitest 번들 포함 → `PHASE_BLOCKED: tsup 설정 변경 필요`
