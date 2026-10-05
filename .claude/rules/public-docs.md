---
paths:
  - "README.md"
  - "CONTRIBUTING.md"
  - "docs/guide/**"
  - "skills/**"
---

# 공개 문서의 내부 참조 번호 제외

`README.md`, `CONTRIBUTING.md`, `docs/guide/` 와 `skills/` 아래 문서에는 `ADR-NNN`, `Issue #NN`, `task NN` 같은 내부 추적 번호를 넣지 않는다.
검사 범위는 `scripts/check-public-refs.mjs` 의 `TARGETS` 목록이 소유한다.
`skills/dooray-cli/references/` 와 `skills/dooray-persona/` 도 그 범위에 들어간다.
사용자는 ADR 맥락을 모르고, 이 문서를 그대로 LLM 에 붙여 실행을 요청하기도 한다.

- 기능 동작과 사용법만 기술한다. "왜 이렇게 설계했는가" 는 `docs/adr/` 에만 둔다
- 괄호 참조(`... (ADR-027)`)는 삭제하고, 문장에 녹은 참조는 번호를 빼고 재작성한다
- 내부 문서(`CLAUDE.md`, `docs/*`, `tasks/*`)는 내부 참조를 그대로 유지한다

**검증** (README·SKILL 작성·수정 후 실행):

```bash
# cwd: <repo root>
node scripts/check-public-refs.mjs
```

CI 가 같은 스크립트를 돌린다.
필수 경로가 없거나 파일을 읽지 못하면 오류를 출력하고 종료 코드 2 로 끝난다.
