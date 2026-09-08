---
id: live-send-in-phase-verification
category: plan
title: phase 검증이 실제 발송을 시키고 대상을 placeholder 로 둔다
triggers: [실제 발송, 발송 확인, messenger send, mail send, placeholder 대상, 본인 이메일, 본인 대화방, 외부 호출 검증]
tool_catchable: false
source: [실제 사고 2026-09-08, plan066 phase-01]
related: []
---

**증상**: phase 의 검증 절이 실제로 메시지나 메일을 보내는 명령을 담고,
그 대상 자리를 `<본인 이메일>` 이나 `<본인 대화방>` 같은 placeholder 로 둔다.
phase 를 실행하는 것은 사람이 아니라 executor 이고, executor 는 그 값을 모른다.
그래서 목록 API 로 후보를 받아 하나를 골라 채운다. 그 값이 무관한 상대일 수 있다.

실제로 `messenger thread-send --channel <본인 대화방> --body "스레드 확인"` 이
다른 사람과의 direct 대화방으로 나갔다. executor 가 `GET /messenger/v1/channels` 로
목록을 받아 direct 방 하나를 골랐다. 5건이 발송됐고 4건만 회수됐다.
`--quiet` 로 실행된 건은 log-id 가 출력되지 않았고, Dooray 공개 API 에 메시지 조회가 없어
사후에 그 값을 얻을 방법이 없었다.

**Good**: 외부로 나가는 동작은 phase 검증에 넣지 않는다.
그 동작이 옳은지는 요청을 만드는 순수 함수의 단위 테스트와,
`fetch` 를 흉내 내 클라이언트를 통째로 거치는 테스트가 판정한다.
서버 응답의 실제 모양이 필요하면 planning 단계에서 사람이 한 번 확인해 ADR 에 적고,
phase 는 그 ADR 을 근거로 삼는다.

**검출**:

```bash
grep -rnE '(messenger (send|thread-send|channel-send)|mail send|curl -X POST).*(<[^>]+>|\$\{?[A-Z_]+)' tasks/*/phase-*.md
```

`<...>` placeholder 나 셸 변수가 대상 자리에 있는 발송 명령을 찾는다.

**Self-check**: phase 를 쓴 뒤 검증 절을 다시 읽고 셋을 본다.

1. 이 명령이 저장소 밖으로 나가는가. 발송, 게시, 등록, 결제가 여기 해당한다
2. 대상 자리에 실행하는 쪽이 채워야 하는 값이 있는가
3. 실패했을 때 되돌릴 수 있는가

1번과 2번이 함께 참이면 그 절을 지운다.
1번이 참이고 3번이 거짓이면 사람이 하는 일로 남기고 phase 의 통과 조건에서 뺀다.

**Why**: phase 파일은 사람이 읽는 안내문이 아니라 executor 가 그대로 실행하는 지시다.
사람이 읽는 문서라면 `<본인 이메일>` 이 "당신 것을 넣으세요" 로 읽히지만,
실행하는 쪽에게는 채워야 하는 빈칸이다. 빈칸을 남기면 채워진다.
