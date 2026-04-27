# Phase 5: 빌드 검증 + 실호출 시나리오

## 컨텍스트

본 phase는 코드 변경 없이 검증만. Issue #18 차단 케이스(mandatory-tag 정책 프로젝트 `tc-ocr`)에서 실제로 동작하는지 확인.

### 먼저 읽을 파일

- `tasks/010-feat-post-create-meta-options/index.json` — phase 1-4 완료 상태 확인
- 이슈 본문 차단 케이스: `tc-ocr` 프로젝트, 0/1/2 그룹 mandatory-tag 정책

## 작업 목록 (5개 — 마지막 task 완료 처리 포함)

### 1) 빌드 + lint

```bash
pnpm build
```

성공 확인. 실패 시 phase 1-4 산출물 점검. (cwd는 worktree 루트)

### 2) `--help` 출력 검증

```bash
node dist/index.js post create --help
```

다음 4개 옵션이 노출되어야 함:
- `--tag <name>`
- `--parent <ref>`
- `--workflow <name>`
- `--milestone <name>`

### 3) doctor 출력 검증

```bash
node dist/index.js doctor
```

`Tag 캐시`, `Milestone 캐시` 라인 2줄이 신규로 노출되는지 확인 (phase 4 산출물).

### 4) 실호출 시나리오 (사용자 환경 의존, 가능 범위에서)

**시나리오 A — mandatory-tag 정책 프로젝트 (이슈 본문 케이스)**:

```bash
# 캐시 워밍 (선택)
node dist/index.js project show tc-ocr

# 태그 누락 케이스 — 친절한 에러 기대
node dist/index.js post create tc-ocr --title "[TEST] CLI mandatory 검증" --body "test"
# 기대 stderr: "필수 태그 그룹이 누락되었습니다 ..."

# 정상 케이스
node dist/index.js post create tc-ocr \
  --title "[TEST] CLI mandatory 검증" \
  --body "test" \
  --tag "0: ..." --tag "1: ..." --tag "2: ..."
# 기대 stdout: "업무가 생성되었습니다: <postId>"
```

**시나리오 B — `--parent` `code/number` 형식**:
```bash
node dist/index.js post create tc-ocr \
  --title "[TEST] parent 검증" \
  --body "test" \
  --tag "0: ..." --tag "1: ..." --tag "2: ..." \
  --parent tc-ocr/337
```
기대: 정상 생성.

**시나리오 C — workflow 이름 부분일치 + 실패 시 warn**:
```bash
node dist/index.js post create tc-ocr \
  --title "[TEST] workflow 검증" \
  --body "test" \
  --tag "0: ..." --tag "1: ..." --tag "2: ..." \
  --workflow "등록"
```
기대: post 생성 + workflow 설정 성공 (또는 실패시 stderr warn + exit 0).

**시나리오 D — 모호 매칭**:
```bash
node dist/index.js post create tc-ocr \
  --title "[TEST] 모호" --body "test" --tag "Dev"
```
다중 매칭이면 후보 목록 + exit non-zero.

> 사용자 환경(API 키, 프로젝트 접근권한)에 따라 시나리오 A-D 일부 또는 전부 실행 불가능할 수 있음. **빌드/help/doctor(작업 1-3) 통과를 필수**, 실호출(작업 4)은 best-effort.

### 5) Task 완료 처리 (index.json 업데이트)

`tasks/010-feat-post-create-meta-options/index.json`을 다음과 같이 업데이트:
- 최상위 `status` → `"completed"`
- `current_phase` → `5`
- 모든 `phases[*].status` → `"completed"`
- `updated_at` → 현재 ISO 8601 타임스탬프

이 업데이트는 PR 브랜치 마지막 커밋에 포함되어야 한다 (team-lead가 합본 커밋). 별도 phase로 분리하지 않고 본 phase 마지막 작업으로 수행.

## 성공 기준

- [ ] `pnpm build` 성공 (warning 없음)
- [ ] `node dist/index.js post create --help` 4개 옵션 노출
- [ ] `node dist/index.js doctor` 출력에 Tag/Milestone 캐시 라인 2줄
- [ ] `index.json` `status: "completed"`, 모든 phase `status: "completed"`
- [ ] (선택) 시나리오 A 정상 케이스 실행 → post 생성 성공
- [ ] (선택) 시나리오 A 누락 케이스 → mandatory 에러 메시지 출력
- [ ] (선택) 시나리오 B → `code/number` 분기 정상
- [ ] (선택) 시나리오 D → 모호 후보 목록 노출

## 주의사항

- **실호출 시나리오는 best-effort**: API 키·프로젝트 접근권한 미확보 시 작업 1-3만 수행
- **테스트 게시물 정리**: 시나리오 A-C로 만든 post는 실제 프로젝트에 남으므로, 가능하면 테스트용 프로젝트 사용 또는 실행 후 수동 삭제
- **이슈 #18 close**: 본 task 머지 후 이슈에 PR 링크 코멘트 + close (별도 단계, phase 외)

## Blocked 조건

- `pnpm build` 실패 → `PHASE_BLOCKED: 빌드 실패 (앞 phase 산출물 결함)`
- `--help`에 옵션 미노출 → `PHASE_BLOCKED: phase 3 미완료`
- `doctor`에 신규 캐시 항목 미노출 → `PHASE_BLOCKED: phase 4 미완료`
