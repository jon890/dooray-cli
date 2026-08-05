# Phase 02 — docs: README + SKILL 라우팅 안내 (사용자 가이드)

## 컨텍스트

phase-01 코드 (타입 판별기 + URL 확장 + 진입점 검증) 의 **사용자 가이드 docs** 반영.

**planning 결정 docs 는 이미 반영됨**:
ADR-020 보강 / CLAUDE.md / code-architecture.md 는 build-with-teams 3단계 (docs 최신화) 에서 team-lead 가 먼저 커밋했다 (commit 75ae661).
본 phase 는 사용자 가이드 docs (README / SKILL) 만 다룬다.
README/SKILL 은 phase-01 의 실제 에러 문구·옵션에 의존하므로 코드 확정 후 작성한다.

## 변경 파일 (정확)

```
README.md                       (수정 — post get/comment 사용 예: --id 안내 + URL 형식들)
skills/dooray-cli/SKILL.md      (수정 — 라우팅 안내 + 빠른 참조)
tasks/041-feat-post-input-type-classifier/index.json   (완료 마킹)
```

## 작업 항목 (5개 이하)

### 1. README.md — post 조회 사용 예

- `post get` / `post comment` 예시에 세 입력 방식 정리:
  - `<project> <업무번호>`
  - `--id <postId>` (internal ID — create 출력값을 그대로)
  - `--url <브라우저 URL>` (지원 형식 3종 표기)
- "create 가 출력하는 긴 숫자는 internal postId → 조회 시 `--id` 로" 한 줄 주의.
- 예시의 ID 는 placeholder (`<postId>`) 또는 dummy 패턴 사용 — 실제 19자리 금지.

### 2. skills/dooray-cli/SKILL.md — AI 라우팅 안내 강화 (사용자 핵심 요청)

빠른 참조 표 / 자동화 시나리오에 **강하게** 명시:

- `post create` 결과의 긴 숫자는 **internal postId** 이다 (업무 번호 #N 아님).
- 그 id 로 후속 조회·수정·댓글 시 **반드시 `--id <postId>`** 사용:
  - `dooray post get --id <postId>`
  - `dooray post comment add --id <postId> ...`
- positional `<project> <number>` 의 number 자리에 internal postId 를 넣으면 안 된다 (안내 에러로 거부됨).
- 브라우저 URL 을 그대로 넘길 때 `--url` 지원 형식: `/task/to/{id}`, `/task/{pid}/{id}`, `/project/tasks/{id}`.

### 3. index.json 완료 마킹

- `status` 를 `"completed"` 로
- `current_phase` 를 `2` 로
- phase-01 / phase-02 의 `status` 를 각각 `"completed"` 로
- `updated_at` 갱신

## 검증 기준

- 개인 식별 정보 grep 통과 — README/SKILL 예시에 placeholder 사용
  ```bash
  # cwd: <repo root>
  grep -rnE "<사내 식별자 패턴 — CLAUDE.md 참조>" README.md skills/ 2>/dev/null
  # 0건이어야 함
  grep -rnE "[0-9]{15,}" README.md skills/ 2>/dev/null | grep -vE "1234567890123456789|9876543210987654321|<postId>|<pageId>"
  # 0건이어야 함
  ```
- 가독성 self-check: docs 작성 형식 6패턴 + 한국어 표현 정책 grep 통과
- README / SKILL 의 `--url` 지원 형식이 phase-01 의 실제 3종과 일치
