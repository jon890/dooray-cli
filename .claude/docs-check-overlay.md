# dooray-cli docs-check 오버레이

공용 코어(`~/.claude/skills/docs-check`)에 dooray-cli 특화를 주입한다.

## 검증 위임 (단일 소스)

dooray-cli 의 6축 검증은 [.claude/docs-audit-axes.md](docs-audit-axes.md)를 읽고 수행한다.
그 문서가 검증 항목, 자동 grep 명령, 도메인 지식의 단일 소스다.
하위 에이전트를 띄울 때도 그 문서 경로를 프롬프트에 담는다.

검토가 파일을 고치지 않는 것은 지시로 지키고, 실행 뒤 `git status` 로 확인한다.
agent 파일은 없으므로 코어 `docs-check` 의 6축 절차와 `.claude/docs-audit-axes.md` 가 기본 경로다.

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
