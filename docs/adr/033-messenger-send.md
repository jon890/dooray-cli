## ADR-033: messenger send / channel-send — Dooray Messenger API 래핑

**결정**: `dooray messenger send`(1:1 DM)와 `dooray messenger channel-send`(대화방) 두 명령을 추가한다.

- DM: `POST /messenger/v1/channels/direct-send`, body `{ text, organizationMemberId }` — 대화방 생성 없이 memberId 로 바로 발송.
- 채널: `POST /messenger/v1/channels/{channelId}/logs`, body `{ text }`.
- 응답 둘 다 `{ result: { id } }` (채널은 `channelId` 추가) — `id` = log-id.

**맥락**: `mail send` 는 있으나 Dooray 메신저 전송 명령이 없어, 빠른 알림·배포 요청을 CLI/에이전트가 REST 직접 호출로만 처리했다 (Issue #88). 위 endpoint 는 공식 문서에 명시된 정식 API.

**대안 기각**:
- Incoming Hook(webhook URL) 방식 — 봇/채널당 URL 발급 필요, 받는 사람 지정 불가. 토큰 소유자 명의 1:1 DM 이 목적에 맞음.
- direct-send 전에 `POST /messenger/v1/channels` 로 대화방 먼저 생성 — direct-send 가 organizationMemberId 를 직접 받으므로 불필요한 왕복.

**적용 범위 (설계 결정)**:

- **`--to` 는 id / 이메일만** (이름 미지원). messenger 는 project 스코프가 없어 `matchByName`(project 멤버 목록 필요)을 못 쓴다. `resolveMember` 의 id(`getMemberDetail`)·email(`searchMembers`) 분기를 공유 헬퍼로 추출해 재사용, 이름 입력 시 "id 또는 이메일 사용" 안내 에러.
- **`--channel` 은 channelId(15+자리) 또는 대화방 이름** — 이름이면 `GET /messenger/v1/channels`(내가 속한 방) title 매칭(정확 → 부분 → 모호 시 후보 출력, 일반 resolver 정책). `resolveMessengerChannel` 신설. 제약: 이름 검색은 **내가 속한 방만** 대상이며, direct 방(title 빈값)은 매칭 불가 → 그 경우 raw channelId 사용.
- **body**: `--body` / `--body-file`(`-`=stdin) 또는 `$EDITOR` fallback (comment add/edit 와 일관). 셋 다 없으면 $EDITOR 진입.
- **출력**: `--json` = `res.result` raw (file upload 과 동일 패턴 — DM `{id}`, 채널 `{id, channelId}`) / `--quiet` = `id` / 기본 prose.
- 전송은 **API 토큰 소유자 명의**로 나간다 (personal token). 본문은 `text` plain 만 — mention/첨부/rich 는 scope 밖.

**미확인 (서버 4xx 에 위임)**: 미가입 채널 전송 가부, 자기 자신(me) DM 가부. 사전 검증 두지 않고 API 에러 메시지로 안내.
