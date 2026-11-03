---
id: 00-checklist
category: plan
title: 섹션 소진 체크리스트
triggers: [체크리스트, plan 제출 전, self-check]
tool_catchable: false
source: [섹션 1 소진 체크리스트]
related: []
---

plan 제출 전 아래 패턴을 확인한다.

**판정은 `planning` 스킬의 `verify_task.py` 가 소유한다.**
저장소는 별도 검사기를 두지 않는다. 같은 규칙을 둘이 가지면 서로 어긋난다.
근거는 [ADR-059](../../adr/059-plan-check-owned-by-skill.md) 가 적는다.

```bash
# cwd: <repo root>
python3 ~/.claude/skills/planning/scripts/verify_task.py plan065-...
```

경로는 스킬 번들 기준이다. 하네스가 알려주는 base 디렉터리가 다르면 그것에 붙여 쓴다.
`tasks/` 를 가진 저장소 root 에서 실행한다.

| 항목 | 판정 주체 |
| --- | --- |
| **1-1**: 모든 수치가 실측 명령 결과 | 사람 또는 critic |
| **1-2**: 파일 목록이 `--name-only` 결과와 일치 | 사람 또는 critic |
| **1-3**: 최근 10개 커밋과 이 plan 의 관계 서술 | 사람 또는 critic |
| **1-4**: 모든 Bash 블록에 `# cwd:` 주석 | `verify_task.py` |
| **1-5**: 성공 기준에 인간 의존 문구 없음 | `verify_task.py` |
| **1-6**: 외부 상태 변경 단계에 사전 점검과 rollback | 사람 또는 critic |
| **1-7**: load-bearing 불변식 도입 시 4면 가드 | 사람 또는 critic |
| **1-8**: 마지막 phase 에 index.json `completed` 마킹 지시 | `verify_task.py` |
| **1-9**: rename 시 일괄 치환 도구의 단어 경계 표기를 피한다 | `verify_task.py` |
| **1-10**: type 변경 phase 면 성공 기준에 `pnpm tsc --noEmit` 기준값 비교 | 사람 또는 critic |
| **1-11**: grep 검증 기대값을 구현 후 상태로 실제로 돌려 확인 | 사람 또는 critic |

**1-11 은 판정 주체가 사람으로 바뀌었다.** 저장소 검사기가 `grep -c` 와 같은 줄의
기대값 주석 유무를 보던 것을 `verify_task.py` 가 가지고 있지 않다.
그 규칙이 필요하면 스킬에 넣는다. 저장소에 다시 만들지 않는다.

`verify_task.py` 가 아래 항목을 더 본다. 위 표 밖이다.

- `index.json` 이 스키마와 실제 phase 파일에 맞는가
- phase 에 필수 절(`## 목표`, `**범위 외**`, `## 작업 항목`, `## Critical Files`, `## 검증`)이 있는가
- `**근거 문서**` 가 있고 그 경로가 실제로 있는가
- 범위가 불명확한 표현(`전체 수정` 같은 것)을 쓰지 않았는가

**CI 는 plan 을 검사하지 않는다.** `verify_task.py` 가 저장소 밖에 있어 러너가 닿을 수 없다.
plan 파일은 구현 지시문이고 제품 코드가 아니라서 CI 의 통과 조건으로 두지 않는다.
검사는 plan 을 쓴 직후 로컬에서 돈다.

**이 규칙보다 먼저 쓰인 plan 은 걸린다.** 완료된 plan 의 phase 파일을 고칠지는 `harness-cleanup` 이 판정한다.
