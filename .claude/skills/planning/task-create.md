# Task 생성 가이드

이 문서는 AI 에이전트가 구현 task를 생성할 때 따르는 규칙이다.

## 디렉터리 구조

```
tasks/
  {task-name}/
    index.json        # task 메타데이터 및 phase 목록
    phase-01.md       # phase 1 프롬프트 (Claude에게 전달되는 실행 지시)
    phase-02.md
    ...
```

## index.json 스키마

**모든 필드가 필수**. 생략하면 `run-phases.py`가 오류를 발생시키거나 기존 task와 구조가 불일치한다.

```jsonc
{
  // ── Task 메타데이터 (필수) ──
  "name": "task-name", // kebab-case, 디렉터리명과 일치
  "description": "무엇을 구현하는 task인지 한 줄 설명",
  "created_at": "2026-04-03T00:00:00Z", // ISO 8601, 최초 생성 시각
  "updated_at": "2026-04-03T00:00:00Z", // run-phases.py가 자동 갱신
  "status": "pending", // pending | running | completed | failed | blocked
  "current_phase": 0, // 현재 실행 중인 phase 번호 (0 = 미시작)
  "total_phases": 3, // phases 배열 길이와 일치해야 함
  "error_message": null, // failed 시 오류 메시지
  "blocked_reason": null, // blocked 시 사유

  // ── Phase 목록 (필수, 1개 이상) ──
  "phases": [
    {
      "number": 1, // 1부터 순차 증가
      "title": "phase 제목", // 간결하게 (한글 OK)
      "file": "phase-01.md", // 동일 디렉터리 내 파일명
      "status": "pending", // pending | running | completed | failed | blocked
      "allowedTools": ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
      "model": "sonnet", // (선택) "haiku" | "sonnet" | "opus" — 생략 시 기본 모델
    },
  ],
}
```

### status 값

- `pending` — 아직 실행 전
- `running` — 현재 실행 중
- `completed` — 성공 완료
- `failed` — 오류 발생 (error_message 참고)
- `blocked` — 사용자 개입 필요 (blocked_reason 참고)

### model 라우팅 가이드

작업 복잡도에 따라 적절한 모델을 선택하여 토큰 비용을 최적화한다.

| 모델     | 용도                                                  | 예시                                       |
| -------- | ----------------------------------------------------- | ------------------------------------------ |
| `haiku`  | 기계적 작업 (git commit+push, 빌드 검증, 파일 삭제)   | 빌드 검증 + 커밋 phase, 단순 삭제          |
| `sonnet` | **실제 구현 대부분** — 코드 작성/수정/rename/리팩토링 | 함수 작성, 커맨드 추가, resolver 수정      |
| `opus`   | **계획/설계/논의** + 복잡 알고리즘 설계               | 새로운 아키텍처 설계, 복잡한 알고리즘 구현 |

`model` 필드를 생략하면 기본 모델(현재 세션 모델)이 사용된다.

### 검증 체크리스트

index.json 작성 후 아래를 확인:

- [ ] `total_phases` == `phases` 배열 길이
- [ ] 모든 phase에 `number`, `title`, `file`, `status`, `allowedTools` 존재
- [ ] `number`가 1부터 순차 증가
- [ ] 각 `file`에 해당하는 `.md` 파일이 실제로 존재
- [ ] `created_at`이 ISO 8601 형식

---

## phase 파일 작성 규칙

### 핵심 원칙

1. **자기완결적** — 각 phase 프롬프트는 이전 대화 컨텍스트 없이 `claude --print`로 독립 실행된다. 필요한 모든 맥락을 프롬프트 안에 포함해야 한다.
2. **단일 책임** — 한 phase는 명확히 하나의 작업 단위를 담당한다.
3. **검증 가능** — phase 마지막에 실행 가능한 성공 기준을 명시한다.
4. **작업 항목 5개 이하** — 너무 많은 항목을 담으면 AI 에이전트가 뒤쪽 항목을 누락한다. 5개 초과 시 반드시 분리.

### phase 파일 구조

```markdown
# Phase N: {제목}

## 컨텍스트

이 프로젝트가 무엇인지, 현재 상태, 이 phase가 해야 하는 일.
이전 phase에서 무엇이 생성/변경되었는지 설명.

먼저 아래 문서들을 읽어라:

- `CLAUDE.md` — 코딩 규칙
- `docs/...` — 관련 설계 문서 (구체적 경로)

기존 코드 참조 (패턴 파악용):

- `src/...` — 동일 패턴의 기존 파일 (구체적 경로)

## 목표

이 phase에서 구현해야 할 것을 명확히 기술.

## 작업 목록

### 섹션 제목

- [ ] 구체적인 작업 (파일 경로 포함)
  - 함수 시그니처, 파라미터, 반환 타입 등 구체적으로 명시
  - 기존 패턴 참조 지시

## 성공 기준

- `pnpm build` 성공 (타입 에러 없음)
- 특정 파일이 존재해야 함
- 특정 함수가 export되어야 함

## 주의사항

- `CLAUDE.md` 규칙 준수
- 하지 말아야 할 것 구체적으로

## Blocked 조건

- 다음 상황이면: `PHASE_BLOCKED: {이유}`
```

### 특수 마커

```
PHASE_BLOCKED: {이유}    # 사용자 개입 필요 → exit 2
PHASE_FAILED: {오류}     # 복구 불가능 → exit 1
```

### phase 작성 시 체크리스트

- [ ] "먼저 읽을 문서" 섹션에 `CLAUDE.md` + 관련 docs 경로 명시했는가?
- [ ] "기존 코드 참조" 섹션에 패턴 파악용 파일 경로를 명시했는가?
- [ ] 생성할 함수의 이름, 파라미터, 반환 타입이 구체적인가?
- [ ] 이전 phase에서 생성된 파일을 참조하는 경우 경로를 명시했는가?
- [ ] 성공 기준에 `pnpm build` 등 실행 가능한 명령어가 있는가?
- [ ] 성공 기준의 검증이 작업 목록의 모든 항목을 커버하는가?
- [ ] Blocked 조건이 정의되어 있는가?

---

## Phase 분리 기준

| 기준           | 설명                                      |
| -------------- | ----------------------------------------- |
| 의존성 경계    | 이전 phase 결과물이 있어야 시작 가능      |
| 검증 가능 단위 | `pnpm build` 등 독립 검증 가능            |
| 실패 격리      | 실패 시 롤백 범위를 최소화할 수 있는 단위 |

**권장 크기**: 30분 ~ 2시간 작업량.

---

## 마지막 2 phase 표준 (필수)

모든 task의 마지막 2개 phase는 아래 구조를 따른다:

| Phase | 제목               | 모델    | 내용                                                               |
| ----- | ------------------ | ------- | ------------------------------------------------------------------ |
| N-1   | 빌드 검증 + 테스트 | `haiku` | `pnpm build`, 금지사항 검증 (`grep` 체크)                          |
| N     | 커밋 + push        | `haiku` | 변경 파일 `git add` → `git commit` → `git push`. task 파일도 포함. |

**커밋 phase 규칙**:

- **반드시 `git status --porcelain`으로 수정/신규 파일 전체 목록 확인**
- 명시적 파일 목록 + `git status`에서 발견한 **task 관련 파일**(암묵적 의존성, 타입 업데이트 등)을 모두 `git add`
  - 예: cache 타입 변경 → 관련 store 파일도 함께 수정되어야 함
  - 예: resolver 변경 → 호출자 커맨드 파일도 함께 변경됨
- `git add -A` 금지 — 다른 task 변경/format-on-save 혼입 방지
- task와 무관한 변경(format-on-save, 다른 작업 중 변경 등)이 `git status`에 있으면 **로그에 명시**하고 포함하지 않음
- 커밋 메시지: `feat/fix/chore(scope): 설명`
- push 실패 시 `PHASE_BLOCKED: push 실패 — 원격 변경사항 확인 필요`

**Phase N (커밋) 실행 순서**:

1. `git status --porcelain` 실행 → 전체 수정/신규 파일 목록 확보
2. task 관련 파일 판별:
   - 명시적 목록에 있는 파일 → 포함
   - 명시적 목록에 없지만 task의 변경으로 인해 수정된 파일(타입, 의존성) → 포함
   - format-only 변경(prettier) + task 무관 파일 → 제외 + 로그
3. 선별된 파일만 `git add`
4. `git commit` + `git push`
