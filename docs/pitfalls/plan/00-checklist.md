---
id: 00-checklist
category: plan
title: 섹션 소진 체크리스트
triggers: [체크리스트, plan 제출 전, self-check]
tool_catchable: false
source: [섹션 1 소진 체크리스트]
related: []
---

plan 제출 전 11개 패턴을 확인한다.

**다섯은 스크립트가 판정한다.** plan 을 쓴 쪽이 스스로 훑으면
대조한 것과 대조했다고 적은 것을 구별할 수 없다. 종료 코드가 그 구별을 만든다.

```bash
# cwd: <repo root>
node scripts/check-plan.mjs                    # 미완료 plan 전부
node scripts/check-plan.mjs plan065-...        # 특정 plan
```

| 항목 | 판정 주체 |
| --- | --- |
| **1-1**: 모든 수치가 실측 명령 결과 | 사람 또는 critic |
| **1-2**: 파일 목록이 `--name-only` 결과와 일치 | 사람 또는 critic |
| **1-3**: 최근 10개 커밋과 이 plan 의 관계 서술 | 사람 또는 critic |
| **1-4**: 모든 Bash 블록에 `# cwd:` 주석 | `check-plan.mjs` (`CWD`) |
| **1-5**: 성공 기준에 인간 의존 문구 없음 | `check-plan.mjs` (`HUMAN`) |
| **1-6**: 외부 상태 변경 단계에 사전 점검과 rollback | 사람 또는 critic |
| **1-7**: load-bearing 불변식 도입 시 4면 가드 | 사람 또는 critic |
| **1-8**: 마지막 phase 에 index.json `completed` 마킹 지시 | `check-plan.mjs` (`MARK`) |
| **1-9**: rename 시 `sed \b` 대신 `perl` | `check-plan.mjs` (`SEDB`) |
| **1-10**: type 변경 phase 면 성공 기준에 `pnpm tsc --noEmit` 기준값 비교 | 사람 또는 critic |
| **1-11**: grep 검증 기대값을 구현 후 상태로 실제로 돌려 확인 | `check-plan.mjs` (`GREP`) — 기대값 주석 유무까지 |

`GREP` 은 `grep -c` 와 같은 줄에 기대값 주석(`# = 1`, `# >= 1`)이 있는지 본다.
기대값을 다음 줄 산문에 적으면 실행하는 쪽이 그 줄만 보고 판정하지 못한다.
그 값이 실제 상태와 맞는지는 스크립트가 판정하지 못하므로 사람이 돌려 확인한다.

`HUMAN` 은 `## 검증` 절 안만 본다. 본문 산문의 서술은 성공 기준이 아니다.

**이 검사기가 생기기 전에 쓰인 plan 은 걸린다.** 기본 실행 대상은
`index.json` 의 `status` 가 `completed` 가 아닌 plan 이라 완료된 것은 빠진다.
완료된 plan 의 phase 파일을 고칠지는 `harness-cleanup` 이 판정한다.
