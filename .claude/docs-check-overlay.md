# docs-check 오버레이 — dooray-cli

공용 코어(`~/.claude/skills/docs-check`)에 dooray-cli 특화를 주입한다.

## 검증 위임 (단일 소스)

dooray-cli 의 6축 검증은 **반드시** custom agent `dooray-cli-docs-verifier` (`.claude/agents/dooray-cli-docs-verifier.md`)에 위임한다.
agent 본문이 검증 항목·자동 grep 명령·도메인 지식(ADR 인덱스·캐시 규약·개인 식별 정보 검사 등)의 단일 소스 — main session 이 직접 6축 grep 을 따라 적으면 정의 두 곳 동기화 부담이 생긴다.

```
Agent({
  subagent_type: "dooray-cli-docs-verifier",
  description: "6-axis docs audit",
  prompt: "전체 docs (docs/*.md, .claude/skills/*/SKILL.md, skills/*/ 공개 스킬) 6축 점검. Critical / Warning / Safe 분류 보고."
})
```

agent 는 read-only (`disallowedTools: Write, Edit`) — team-lead 가 회신을 받아 Critical 부터 사용자 승인 후 수정한다.

**Fallback**: agent 를 못 쓰는 환경에서는 코어 `docs-check` 의 6축 절차를 직접 따른다. 이때도 grep 명령의 단일 소스는 agent 본문이다.

## docs 구조 + 문서 목록

```bash
# cwd: <repo root>
ls docs/*.md docs/adr/*.md .claude/skills/*/SKILL.md skills/*/SKILL.md skills/*/references/*.md
```

| 문서                                                         | 담당                                      |
| ------------------------------------------------------------ | ----------------------------------------- |
| `docs/prd.md`                                                | 제품 목적·MVP 범위·우선순위               |
| `docs/flow.md`                                               | 사용자 흐름·명령 사용 패턴                |
| `docs/adr/` (ADR 1개 = 파일 1개, 목록은 `docs/adr/INDEX.md`) | 기술 의사결정·왜·대안 기각                |
| `docs/data-schema.md`                                        | `~/.dooray/cache/` 구조·TTL·resolver 로직 |
| `docs/code-architecture.md`                                  | 디렉터리 트리·레이어·API 전략             |
| `CLAUDE.md`                                                  | 코드 작업 지침, 전 명령 공통 규약, 노출 금지 정책 |
| `README.md` / `skills/dooray-cli/`                           | 사용자 가이드 (외부 facing)               |
| `skills/dooray-persona/`                                     | 문체 페르소나 워크플로우 (외부 facing)    |

## 실행 주기

- `build-with-teams` 대규모 task 완료 후
- 외부 PR 머지 후
- 분기별 정기
