---
id: duplicated-inline-guard-across-modes
category: code-review
title: non-interactive / interactive 분기 동일 가드 inline 중복
triggers: [interactive, non-interactive, orchestrator helper, guardDroppedAttachments]
tool_catchable: false
source: [CLI11, PR #43]
related: []
---

**증상**: 한 명령이 두 입력 모드 (`--body` non-interactive vs `$EDITOR` interactive) 를 가지면서 동일한 사전 검사 시퀀스 (find + warn + confirm 등) 를 양쪽에 inline 으로 중복. 후속 변경 시 한쪽만 갱신되어 모드 간 동작이 달라지는 회귀 위험.
**Good**: orchestrator helper 로 추출 (예: `checkAndGuardDropped(oldBody, newBody, attachments, noConfirm)`), 두 분기에서 한 줄로 호출. helper 내부에서 검사 → 경고 → 확인 → throw 순서를 단일 정의.
**검출**: 한 명령 파일 안에서 같은 helper 가 2회 이상 호출되면서 사이에 비슷한 입력 준비 (`(... ?? []).map`) 가 반복되면 후보.
**Why**: PR #43 review — `post edit` non-interactive + interactive 두 분기가 `findDroppedAttachments → guardDroppedAttachments` 시퀀스를 inline 중복.
