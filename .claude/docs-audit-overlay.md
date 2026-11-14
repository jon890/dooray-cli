# dooray-cli docs-audit 오버레이

설치된 `docs-audit` 스킬에 dooray-cli 특화를 주입한다.

## 검증 위임 (단일 소스)

dooray-cli 의 6축 검증은 [.claude/docs-audit-axes.md](docs-audit-axes.md)를 읽고 수행한다.
그 문서가 검증 항목, 자동 grep 명령, 문서별 담당의 단일 소스다.
하위 에이전트를 띄울 때도 그 문서 경로를 프롬프트에 담는다.

검토가 파일을 고치지 않는 것은 지시로 지키고, 실행 뒤 `git status` 로 확인한다.

## 문서 목록

```bash
# cwd: <repo root>
ls docs docs/adr docs/api docs/guide docs/features docs/pitfalls \
   .claude/skills/*/SKILL.md skills/*/SKILL.md skills/*/references
```

문서별 담당은 `docs-audit-axes.md` 의 「dooray-cli docs 역할」 표가 소유한다.
