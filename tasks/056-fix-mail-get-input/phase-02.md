# Phase 02 — IMAP 계층의 mail id → UID 이분 탐색

**Execution profile**: deep

---

## 목표

웹 mail id 를 IMAP UID 로 바꾸는 조회 함수를 `src/api/imapClient.ts` 에 만든다.

id 에서 꺼낸 도착 시각으로 UID 를 이분 탐색한다.
IMAP UID 는 도착 순서대로 증가하므로 시각을 알면 위치를 좁힐 수 있다.
받은 메일함 3879통 기준 11~12회 조회로 끝났다. 근거는 `docs/adr/040-mail-url-to-uid-lookup.md` 에 있다. 작업 전에 읽는다.

**범위 외**: 명령 파일 수정은 phase 3 의 책임이다.

**전제**: 이 phase 는 phase 1 이 만드는 `src/utils/dooray-id.ts` 의 `decodeDoorayIdTimeMs` 를 전제한다.
그 파일이 없으면 base 를 확인하고 멈춘다.

---

## 작업 항목 (3)

### 1. `src/api/imapClient.ts` — 사서함 매개변수 추가

`listMails` 와 `getMail` 이 `getMailboxLock("INBOX")` 로 사서함을 코드에 고정하고 있다.
주소가 `sent` 같은 다른 폴더를 가리킬 수 있으므로 매개변수로 뺀다.

- `getMail(config, uid, mailbox = "INBOX")` 로 시그니처를 넓힌다. 기본값이 있으므로 기존 호출부는 바뀌지 않는다.
- `listMails` 는 이번 범위에서 손대지 않는다. 목록 명령에 폴더 선택 옵션을 붙이는 것은 별개의 결정이다.

### 2. `src/api/imapClient.ts` — `resolveUidByMailId` 추가

```ts
export interface MailIdCandidate {
  uid: number;
  subject: string;
  from: string;
  date: Date | null;
}

export async function resolveUidByMailId(
  config: Config,
  mailId: string,
  mailbox: string,
): Promise<number>;
```

동작 순서다.

1. `decodeDoorayIdTimeMs(mailId)` 로 목표 시각 `wantMs` 를 얻는다.
2. `client.search({ all: true }, { uid: true })` 로 UID 목록을 받아 오름차순으로 둔다. 한 번의 조회로 끝난다.
3. UID 목록을 이분 탐색한다. 각 단계에서 `client.fetchOne(String(uid), { uid: true, internalDate: true }, { uid: true })` 로 도착 시각을 읽고,
   `internalDate < wantMs - 2000` 이면 오른쪽, 아니면 왼쪽으로 좁힌다.
4. 좁혀진 위치를 중심으로 앞뒤 8통의 도착 시각을 한 번에 받아 후보를 고른다.
   후보 조건은 도착 시각의 초가 `Math.floor(wantMs / 1000)` 또는 그 다음 초와 같은 것이다.

   id 의 시각은 도착 시각보다 0.3초 안팎 앞서고 `internalDate` 는 초 단위라, 초 경계를 넘는 경우까지 덮으려면 두 초를 봐야 한다.
5. 후보가 정확히 1건이면 그 UID 를 돌려준다.
6. 후보가 0건이면 `DoorayCliError` 를 던진다.
   메일이 다른 폴더로 옮겨졌거나 삭제됐을 수 있다는 것과 `dooray mail list --search "<제목 일부>"` 우회를 안내한다.
7. 후보가 2건 이상이면 임의로 고르지 않고 `DoorayCliError` 를 던진다.
   메시지에 후보의 UID, 도착 시각, 보낸사람, 제목을 줄 단위로 싣는다. 사용자가 UID 를 골라 다시 조회할 수 있어야 한다.
   같은 초에 도착한 메일은 받은 메일함 3879통 중 33통(0.9%)이라 드물지만 반드시 생긴다.

이 함수는 자체적으로 연결을 열고 닫는다.
`listMails` 와 `getMail` 이 `createImapClient` → `connectImapClient` → `getMailboxLock` → `finally` 해제 순서를 쓰고 있으므로 같은 골격을 따른다.

### 3. 테스트 추가

`src/api/mailErrors.test.ts` 가 이 디렉터리의 테스트 견본이다.

`src/api/imapClient.test.ts` 를 만들어 탐색 논리를 검증한다.
실제 IMAP 서버에 붙지 않도록 `imapflow` 의 `ImapFlow` 를 `vi.mock` 으로 대체하고, `search` 와 `fetchOne` 과 `fetch` 가 고정된 도착 시각을 돌려주게 만든다.

덮을 경우는 넷이다.

- 목표 시각과 맞는 메일이 하나면 그 UID 를 돌려준다.
- 같은 초에 두 통이 있으면 던지고, 메시지에 두 UID 가 모두 들어 있다.
- 맞는 메일이 없으면 던지고, 메시지에 `--search` 우회가 들어 있다.
- 이분 탐색 조회 횟수가 사서함 크기의 로그에 비례한다. 4000통을 흉내 낸 입력에서 `fetchOne` 호출이 20회를 넘지 않아야 한다.

마지막 경우가 이 phase 의 성능 근거를 고정한다. 선형 탐색으로 회귀하면 이 단언이 깨진다.

---

## Critical Files

| 파일 | 변경 |
| --- | --- |
| `src/api/imapClient.ts` | 수정 |
| `src/api/imapClient.test.ts` | 신규 |

## 검증

```bash
# cwd: <repo root>
pnpm vitest run src/api/imapClient.test.ts
pnpm tsc --noEmit
```

- 테스트 4건이 모두 통과한다.
- `pnpm tsc --noEmit` 새 오류 0 건.
- `grep -n "getMailboxLock" src/api/imapClient.ts` 결과에서 `getMail` 과 `resolveUidByMailId` 가 매개변수를 쓰고 문자열 `"INBOX"` 를 직접 넘기지 않는다.

## 의도 메모 (왜)

- 사서함 전체의 도착 시각을 받아 선형 탐색하면 3879통에 약 2분이 걸린다. 결과가 같은데 비용만 크다.
- 후보가 여럿일 때 하나를 고르지 않는 것은 이 레포 resolver 의 공통 정책이다. 모호하면 후보를 보여주고 멈춘다.
- 도착 시각 역전은 3879통 중 1건 있었고 2023년에 다른 폴더에서 옮겨진 것으로 보인다.
  이분 탐색이 그 근처에서 빗나갈 수 있지만, 4단계의 후보 검사가 있어 엉뚱한 메일을 돌려주지 않고 못 찾았다고 답한다.

## Blocked 조건

- `src/utils/dooray-id.ts` 가 없으면 `PHASE_BLOCKED: phase 1 산출물 부재` 를 출력하고 멈춘다.
