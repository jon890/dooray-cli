# Phase 02 — docs: ADR-020 보강 + CLAUDE.md + code-architecture.md + README + SKILL

## 컨텍스트

phase-01 코드(타입 판별기 + URL 확장 + 진입점 검증)의 docs 반영.

**왜 docs 가 planning 이 아닌 phase 에 있는가**: 사용자가 "계획만 이 세션, 구현은 다른 세션 단일 실행" 으로 요청.
ADR-020 보강 문구는 본 phase 에 최종형으로 박아두어 구현 세션이 그대로 반영한다.
README/SKILL 은 phase-01 의 실제 에러 문구·옵션에 의존하므로 코드 확정 후 작성.

## 변경 파일 (정확)

```
docs/adr.md                       (수정 — ADR-020 본문 끝에 보강 섹션)
CLAUDE.md                         (수정 — "공통 — 명령 입력 통합" 섹션에 타입 판별 한 줄)
docs/code-architecture.md         (수정 — resolvers/ + utils/dooray-url 줄에 한 줄)
README.md                         (수정 — post get/comment 사용 예: --id 안내 + URL 형식들)
skills/dooray-cli/SKILL.md        (수정 — 라우팅 안내 + 빠른 참조)
tasks/041-feat-post-input-type-classifier/index.json   (완료 마킹)
```

## 작업 항목 (5개 이하)

### 1. ADR-020 보강 섹션 — `docs/adr.md`

ADR-020 본문 끝(`후속 (wiki input 통합, CI 통합) 은 별도 task.` 줄 다음, `---` 앞)에 추가:

```markdown
**보강 (Issue #82/#83, 2026-06)**: 입력 처리를 '만능 추론' 에서 '명시적 타입 분류' 로 강화.
`classifyPostInputToken` 이 토큰을 postId / postNumber / url / project 로 분류한다.
진입점(`--id` / `--url` / positional)이 기대 타입과 불일치하면 타입별 안내 에러를 던진다.

- positional 2번째가 postId(15+자리 numeric)면 "`--id` 를 쓰세요" 안내 (#82).
- URL 형식에 `/project/tasks/{postId}` 추가 (#83 — `/task/{pid}/{id}` 는 기존 처리).

길이 임계(15+자리)는 **안내 트리거로만** 쓰고 조회 분기로는 쓰지 않는다.
따라서 본 ADR 의 'positional numeric → postId 자동 인식 기각' 은 유지된다.
긴 numeric 을 postId 로 조용히 조회하지 않고 `--id` 명시 경로로 유도한다.
ID 체계가 바뀌어 분류가 틀려도 `--id` 경로는 영향받지 않는다.
```

### 2. CLAUDE.md — "공통 — 명령 입력 통합" 섹션

`resolvePostInput` 설명에 타입 판별 한 줄 추가 (기존 분기 헬퍼 설명 아래):

```markdown
  - 입력 토큰 타입 판별 (`classifyPostInputToken`): postId(15+자리) / postNumber / url / project
    - 진입점이 기대 타입과 불일치 시 타입별 안내 에러 (예: positional 에 postId → `--id` 안내). ADR-020 보강
```

ADR 참조 표의 ADR-020 행은 이미 존재 → 변경 불요(보강이라 신규 행 없음).

### 3. docs/code-architecture.md — resolver/url 한 줄

- `resolvers/post-input.ts` 설명에 "입력 토큰 타입 판별 (`classifyPostInputToken`) + 진입점별 검증 (ADR-020 보강)" 추가
- `utils/dooray-url.ts` 설명에 "지원 URL: `/task/to/{id}`, `/task/{pid}/{id}`, `/project/tasks/{id}`" 명시

### 4. README.md — post 조회 사용 예

- `post get` / `post comment` 예시에 세 입력 방식 정리:
  - `<project> <업무번호>`
  - `--id <postId>` (internal ID — create 출력값을 그대로)
  - `--url <브라우저 URL>` (지원 형식 3종 표기)
- "create 가 출력하는 긴 숫자는 internal postId → 조회 시 `--id` 로" 한 줄 주의.

### 5. skills/dooray-cli/SKILL.md — AI 라우팅 안내 강화 (사용자 핵심 요청)

빠른 참조 표 / 자동화 시나리오에 **강하게** 명시:

- `post create` 결과의 긴 숫자는 **internal postId** 이다 (업무 번호 #N 아님).
- 그 id 로 후속 조회·수정·댓글 시 **반드시 `--id <postId>`** 사용:
  - `dooray post get --id <postId>`
  - `dooray post comment add --id <postId> ...`
- positional `<project> <number>` 의 number 자리에 internal postId 를 넣으면 안 된다 (안내 에러로 거부됨).
- 브라우저 URL 을 그대로 넘길 때 `--url` 지원 형식: `/task/to/{id}`, `/task/{pid}/{id}`, `/project/tasks/{id}`.

## 검증 기준

- `docs/adr.md` 보강 섹션이 ADR-020 본문 안에 위치 (신규 ADR 번호 아님)
- 가독성 self-check: phase 작성 형식 6패턴 + 한국어 표현 정책 grep 통과
  ```bash
  for f in docs/adr.md CLAUDE.md docs/code-architecture.md; do
    grep -nE "매트릭스|게이트|트리아지|베이스라인|스파이크" "$f"
  done
  # 0건이어야 함
  ```
- 개인 식별 정보 grep (CLAUDE.md 검증 절차) 통과 — README/SKILL 예시에 placeholder 사용
