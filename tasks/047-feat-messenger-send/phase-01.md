# Phase 01 — types + client + resolveMessengerChannel + --to 공유 헬퍼

## 컨텍스트

Issue #88 messenger 명령의 데이터 계층.
**설계 단일 소스**: `docs/adr/033-messenger-send.md` + `CLAUDE.md` "### messenger (Issue #88, ADR-033)". 먼저 정독.
planning 결정 docs 는 반영 완료 — 이 phase 에서 ADR/CLAUDE.md/code-architecture/flow 변경 금지.

## API 스펙 (공식 문서 실측)

- **DM**: `POST /messenger/v1/channels/direct-send` — body `{ "text": "...", "organizationMemberId": "<id>" }` → `{ result: { id } }` (id = log-id).
- **채널**: `POST /messenger/v1/channels/{channelId}/logs` — body `{ "text": "..." }` → `{ result: { id, channelId } }`.
- **채널 목록**: `GET /messenger/v1/channels` → `{ result: [{ id, title, type, users: { participants }, ... }] }`. `type` = direct/private/me/bot. direct 방은 `title` 빈값.

## 작업 항목 (5개 이하)

1. **types** (`src/api/types.ts`): `DirectSendRequest { text; organizationMemberId }`, `ChannelLogRequest { text }`, `MessengerChannel { id; title; type; ... }`(목록에 필요한 필드만), `MessengerChannelListResponse`, send 응답 타입 (`{ id; channelId? }`). 기존 `DoorayApiResponse` 래퍼 재사용.
2. **client** (`src/api/client.ts`): 기존 메서드 패턴(try/catch → toDoorayCliError) 동일하게 3개 추가.
   - `sendDirectMessage(organizationMemberId, text)` → `.post("messenger/v1/channels/direct-send", { json: {...} })`.
   - `sendChannelMessage(channelId, text)` → `.post("messenger/v1/channels/${channelId}/logs", { json: { text } })`.
   - `getMessengerChannels()` → `.get("messenger/v1/channels")`.
3. **`--to` 공유 헬퍼 추출**: `src/resolvers/member.ts` 의 `resolveMember` 에서 **id 분기(getMemberDetail)+email 분기(searchMembers)** 를 `resolveMemberByIdOrEmail(client, input): Promise<string | null>` 로 추출 (id/email 이면 memberId, 아니면 null).
   - `resolveMember` 는 이 헬퍼 호출 후 null 이면 기존 matchByName 폴백 — **기존 동작·에러 메시지 byte 동일 보존** (기존 member 테스트 통과 확인).
4. **`resolveMessengerChannel`** (`src/resolvers/messenger-channel.ts` 신규): 입력이 15+자리 numeric(`/^\d{15,}$/`) → 그대로 channelId. 그 외 → `getMessengerChannels()` 의 `title` 매칭.
   - `matchByName` 은 `name` 필드 기준(`NameRecord`)이므로 채널을 `{ name: title, ...ch }` 로 매핑해 넘기거나 title 기준 매칭 로직 사용. **title 빈값(direct/me 방)은 매칭 후보에서 제외** (member-group `code` 누락 가드 패턴 참조).
   - 정확 → 부분 → 모호 시 후보 목록 에러 (일반 resolver 정책). not-found 안내에 "channelId 직접 입력 또는 dooray … 로 방 확인" 힌트.

## code-review pitfalls self-check
- 이중 단언(`as unknown as`) 금지 — 응답 타입을 types.ts 에 정확히 선언.
- 공유 헬퍼 추출이 기존 resolveMember 3 호출부(--to/--cc/--mention)의 동작을 바꾸지 않는지 (id/email/name 3분기 모두).

## 검증

```bash
pnpm build && pnpm tsc --noEmit 2>&1 | grep "^src/" | wc -l   # 0
pnpm test 2>&1 | grep -E "Tests "                              # 기존 member/resolver 테스트 통과
```
- 파괴적/실전송 API 호출 없음 (build/tsc/test 로만).
- index.json phase 1 completed, current_phase 2. commit.
