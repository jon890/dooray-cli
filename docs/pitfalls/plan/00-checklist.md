---
id: 00-checklist
category: plan
title: 섹션 소진 체크리스트
triggers: [체크리스트, plan 제출 전, self-check]
tool_catchable: false
source: [섹션 1 소진 체크리스트]
related: []
---

plan 제출 전 10개 패턴 모두 self-check:

- [ ] **1-1**: 모든 수치가 실측 명령 결과
- [ ] **1-2**: 파일 목록이 `--name-only` 결과와 일치
- [ ] **1-3**: 최근 10개 커밋과 이 plan 의 관계 서술
- [ ] **1-4**: 모든 Bash 블록에 `# cwd:` 주석
- [ ] **1-5**: 성공 기준에 인간 의존 문구 없음
- [ ] **1-6**: 외부 상태 변경 단계에 gate + rollback
- [ ] **1-7**: load-bearing 불변식 도입 시 4면 가드
- [ ] **1-8**: 마지막 phase 에 index.json `completed` 마킹 지시
- [ ] **1-9**: rename 시 `sed \b` 대신 `perl`
- [ ] **1-10**: type 변경 phase 면 성공 기준에 `pnpm tsc --noEmit` baseline 비교
