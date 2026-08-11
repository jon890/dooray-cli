# Phase 02 — 대상 탐색과 수집 스크립트

**Execution profile**: standard

---

## 목표

페르소나 표본을 실제로 모으는 두 스크립트를 만든다.

- `discover-targets.mjs` — 참여 중인 프로젝트를 훑어 본인 관련 업무가 많은 순으로 후보를 낸다
- `collect.mjs` — 선택된 프로젝트에서 본인이 쓴 업무 본문과 댓글만 모은다

**범위 외**: 모은 표본을 사람·AI·정형 양식으로 나누는 일은 phase 03 이다. 이 phase 는 원문 수집까지만 한다.

---

## 전제

phase 01 이 만든 `skills/dooray-persona/scripts/lib/dooray.mjs` 를 사용한다.
그 모듈이 없으면 진행하지 말고 base 를 확인한 뒤 멈춘다.

설정 파일 스키마는 `docs/data-schema.md` 의 "dooray-persona 스킬 데이터" 절이 단일 소스다.
필드를 임의로 늘리거나 이름을 바꾸지 않는다.

---

## 작업 항목 (3)

### 1. 공통 인자 처리와 설정 로딩

두 스크립트가 같은 인자를 받는다. 중복 구현하지 말고 `lib/config.mjs` 로 뽑는다.

| 인자 | 기본값 | 뜻 |
| --- | --- | --- |
| `--config <path>` | `~/.claude/dooray-persona.config.json` | 설정 파일 경로 |
| `--out <dir>` | 설정의 `workDir`, 없으면 `~/.local/share/dooray-persona` | 산출물 디렉터리 |

`lib/config.mjs` 가 내보낼 것은 둘이다.

- `parseArgs(argv)` — 위 인자를 파싱해 `{ configPath, outDir, flags }` 반환. 모르는 플래그는 `flags` 에 담아 호출자가 쓴다
- `loadPersonaConfig(configPath)` — 파일이 없으면 기본값으로 채운 객체를 반환하고 `exists: false` 를 함께 알린다. 없다고 실패하지 않는다. 최초 실행에서는 설정이 없는 것이 정상이다

경로의 `~` 는 홈 디렉터리로 펼친다.

두 스크립트 모두 **데이터는 stdout 에 JSON 으로, 진행 상황과 경고는 stderr 로** 낸다.
이 저장소 CLI 의 출력 규약과 같다.

### 2. `skills/dooray-persona/scripts/discover-targets.mjs` — 신규

흐름은 다음과 같다.

1. `loadApiConfig` 로 인증을 읽고 `createClient` 로 클라이언트를 만든다
2. `getMe` 로 본인 `organizationMemberId` 를 얻는다. 설정 파일에서 읽지 않는다
3. `listProjects` 로 참여 프로젝트를 모두 가져온다
4. 프로젝트마다 `listPosts` 로 목록을 훑고 `classifyInvolvement` 로 로컬 집계한다
5. `related` 내림차순으로 정렬해 `candidates.json` 에 쓰고, 같은 내용을 stdout 으로 낸다

`candidates.json` 모양은 다음과 같다.

```json
{
  "generatedAt": "<ISO 8601>",
  "projects": [
    {
      "projectId": "1234567890123456789",
      "code": "my-project",
      "name": "My Project",
      "total": 0,
      "authored": 0,
      "assignedAsMember": 0,
      "assignedViaGroup": 0,
      "cc": 0,
      "related": 0
    }
  ]
}
```

`related` 는 `authored`·`assigned`·`cc` 중 하나라도 참인 업무 수다. 세 값을 더하지 않는다 — 한 업무가 여러 축에 걸리면 중복 계산된다.

`assignedViaGroup` 을 따로 세는 이유가 있다. 그룹 담당이 왜 중요한지를 사용자가 후보 화면에서 바로 알아보게 하려는 것이다.

**서버 필터로 근사하지 않는다.** `toMemberIds` 로 담당 업무만 받으면 그룹 담당이 통째로 빠져 프로젝트 순위 자체가 뒤집힌다.
대신 훑는 양을 `--max-pages <n>` 으로 제한할 수 있게 열어 둔다. 상한을 걸어 잘라냈으면 그 사실을 stderr 에 남긴다 — 조용히 자르면 전수 조사한 것처럼 보인다.

### 3. `skills/dooray-persona/scripts/collect.mjs` — 신규

흐름은 다음과 같다.

1. 설정의 `targets[]` 를 읽는다. 비어 있으면 `discover-targets.mjs` 를 먼저 돌리라는 안내를 stderr 에 내고 종료 코드 1 로 끝낸다
2. 출력 디렉터리에 `corpus.jsonl` 이 이미 있으면 그대로 두고 종료 코드 0 으로 끝낸다. `--refresh` 를 주면 다시 모은다
   - 수집이 이 워크플로우에서 가장 비싼 단계라, 실수로 다시 도는 것을 기본값으로 막는다
3. 대상 프로젝트마다 `listPosts` 로 목록을 받고 `classifyInvolvement` 로 후보를 추린다
4. 후보 중 `authored` 인 업무는 `getPost` 로 본문을 받아 `kind: "body"` 항목을 만든다
5. 후보 전체에 `listComments` 를 돌려 **작성자가 본인인 댓글만** `kind: "comment"` 항목으로 만든다
6. 각 항목을 `corpus.jsonl` 에 한 줄씩 쓴다

한 줄의 필드는 `docs/data-schema.md` 의 `CorpusEntry` 를 그대로 따른다.
`id` 는 본문이 `{postId}#body`, 댓글이 `{postId}#log-{logId}` 다.

`text` 는 API 가 준 본문을 그대로 담는다. 이 단계에서 다듬거나 잘라내지 않는다 — 문체 판단 재료를 미리 훼손하면 4단계에서 되돌릴 수 없다.

진행 상황을 stderr 에 주기적으로 남긴다. 수천 건이면 수 분이 걸리므로 멈춘 것처럼 보이면 안 된다.

---

## Critical Files

| 파일 | 변경 |
| --- | --- |
| `skills/dooray-persona/scripts/lib/config.mjs` | 신규 |
| `skills/dooray-persona/scripts/discover-targets.mjs` | 신규 |
| `skills/dooray-persona/scripts/collect.mjs` | 신규 |

## 검증

```bash
# cwd: <repo root>
node --check skills/dooray-persona/scripts/lib/config.mjs
node --check skills/dooray-persona/scripts/discover-targets.mjs
node --check skills/dooray-persona/scripts/collect.mjs
pnpm test -- skills/dooray-persona
```

설정이 없는 상태에서 안내가 나오는지 확인한다. 네트워크에 닿기 전에 끝나야 한다.

```bash
# cwd: <repo root>
node skills/dooray-persona/scripts/collect.mjs --config /nonexistent/persona.json; echo "exit=$?"
```

- 종료 코드가 1 이다.
- stderr 에 `discover-targets` 를 먼저 실행하라는 안내가 있다.
- stdout 에는 아무것도 없다.

`grep -c "toMemberIds" skills/dooray-persona/scripts/discover-targets.mjs` 가 0 이다 — 서버 필터 근사를 쓰지 않았음을 확인한다.

## 의도 메모 (왜)

- `related` 를 세 축의 합이 아니라 합집합 크기로 정의한 이유는, 담당이면서 참조자인 업무가 흔해 합으로 세면 순위가 부풀려지기 때문이다.
- `corpus.jsonl` 존재 시 기본으로 건너뛰는 이유는, 재실행 사고 한 번의 비용이 수천 회 API 호출이기 때문이다.
- 본문 가공을 뒤로 미루는 이유는, 원문이 남아 있어야 분류 기준을 바꿔도 재수집 없이 다시 돌릴 수 있기 때문이다.
