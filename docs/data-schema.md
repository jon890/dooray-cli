# Data Schema — dooray-cli

## 파일 위치

```
~/.dooray/
  config.json                 # 인증·연결 설정
  last-run.json               # 직전 명령 sanitized argv + 에러 (ADR-023, opt-in)
  cache/
    me.json                   # 내 정보 캐시
    projects.json             # 프로젝트 목록 캐시
    projects-private.json     # 개인 프로젝트 목록 캐시
    wikis.json                # 위키 목록 캐시 (projectId → wikiId 매핑)
    members/{projectId}.json       # 프로젝트별 멤버 캐시
    workflows/{projectId}.json      # 프로젝트별 워크플로우 캐시
    tags/{projectId}.json           # 프로젝트별 태그 캐시 (ADR-019)
    milestones/{projectId}.json     # 프로젝트별 마일스톤 캐시 (ADR-019)
    member-groups/{projectId}.json  # 프로젝트별 멤버 그룹 캐시 (`--mention-group`)
    templates/{projectId}.json      # 프로젝트별 템플릿 목록 캐시 (ADR-027, TTL 24h)

${XDG_DATA_HOME}/dooray-cli/              # XDG_DATA_HOME이 절대 경로일 때
~/.local/share/dooray-cli/                # XDG_DATA_HOME이 없거나 상대 경로일 때
  skills/
    {packageVersion}-{contentDigestHex}/
      SKILL.md
      references/...
      .dooray-skill.json            # 관리형 설치 매니페스트

~/.claude/skills/
  dooray-cli -> <dataRoot>/skills/{packageVersion}-{contentDigestHex}/

~/.claude/dooray-persona.config.json       # dooray-persona 스킬 설정 (ADR-038)
~/.local/share/dooray-persona/             # dooray-persona 중간 산출물
  candidates.json
  corpus.jsonl
  classified.jsonl
  stats.json
```

`templates/{projectId}.json` — `GET /project/v1/projects/{projectId}/templates` 응답의 id/templateName/메타만 보존 (body 는 미포함 — list 응답 자체가 body 제외).
`--template <name|id>` 시 캐시에서 templateName 부분일치 후 단건 GET 으로 본문/interpolation 받음.

---

## Claude Code 스킬 매니페스트

`.dooray-skill.json`은 설치된 스킬과 현재 CLI 패키지의 정합성을 판별하는 관리 메타데이터다.
외부 파일이므로 읽을 때 반드시 모든 필드를 타입 가드로 검증한다.

```typescript
interface DooraySkillManifest {
  schemaVersion: 1;
  skillName: "dooray-cli";
  packageName: "@bifos/dooray-cli";
  packageVersion: string;
  contentDigest: `sha256:${string}`;
  installedAt: string; // ISO 8601
  managedBy: "@bifos/dooray-cli";
}
```

콘텐츠 해시는 다음 계약으로 계산한다.

1. `.dooray-skill.json`을 제외한 `SKILL.md`와 `references/` 아래 정규 파일만 포함한다.
2. 심볼릭 링크와 정규 파일이 아닌 항목은 거부한다.
3. 상대 경로는 `/` 구분자로 정규화하고 코드 포인트 순으로 정렬한다.
4. 해시 입력은 UTF-8 바이트 `dooray-skill-content-v1\0`으로 시작한다.
5. 정렬된 각 파일마다 경계 바이트 `0x01`, 상대 경로 UTF-8 바이트 길이의 unsigned 64-bit big-endian 정수, 상대 경로 바이트, 콘텐츠 바이트 길이의 unsigned 64-bit big-endian 정수, 원본 콘텐츠 바이트를 순서대로 반영한다.
6. 길이는 문자열의 문자 수가 아니라 `Buffer.byteLength`와 실제 콘텐츠 `Buffer.length`를 사용한다.
7. 줄바꿈과 파일 내용을 정규화하지 않는다.

저장 디렉터리 이름에는 전체 SHA-256을 사용한다.
`contentDigestHex`는 매니페스트의 `contentDigest`에서 `sha256:` 접두사를 제거한 64자리 lowercase hex다.
같은 버전과 해시의 디렉터리가 이미 있으면 매니페스트와 실제 콘텐츠를 검증한 뒤 재사용한다.
새 설치는 같은 파일시스템의 임시 디렉터리에 완성한 후 `rename`하고, Claude Code 활성 링크도 임시 링크를 `rename`해 전환한다.

같은 최종 저장 경로의 매니페스트·실제 콘텐츠가 기대값과 다르면 기본 동작은 종료 코드 3으로 실패하며 저장소와 활성 링크를 보존한다.
`--force`에서는 기존 저장 디렉터리를 같은 `skills/` 아래 `.backup-<UTC timestamp>-<basename>/`으로 격리한 뒤 staging 디렉터리를 최종 경로로 `rename`한다.
전환 실패 시 격리한 저장 디렉터리를 원래 경로로 복구한다.
이 저장 디렉터리 격리는 `~/.claude/skills/dooray-cli` 활성 항목의 백업과 별개다.

---

## config.json

```typescript
interface Config {
  version: 1;
  tenantName?: string;     // 회사 테넌트명 (e.g. "<tenant>"), 기본값: "<tenant>"
  apiKey: string;          // Dooray API 토큰
  baseUrl: string;         // API Endpoint, 4개 환경 중 택 1
  imapHost?: string;       // 기본값: "imap.dooray.com"
  imapPort?: number;       // 기본값: 993
  imapUsername?: string;    // IMAP 로그인 이메일 (필수)
  imapPassword?: string;   // IMAP 앱 비밀번호 (필수)
  smtpHost?: string;       // 기본값: "smtp.dooray.com"
  smtpPort?: number;       // 기본값: 465
}

// API Endpoint 선택지
const API_ENDPOINTS = {
  "민간 클라우드":       "https://api.dooray.com",
  "공공 클라우드":       "https://api.gov-dooray.com",
  "공공 업무망 클라우드": "https://api.gov-dooray.co.kr",
  "금융 클라우드":       "https://api.dooray.co.kr",
} as const;
```

- `tenantName`은 API Key 발급 링크(`https://{tenant}.dooray.com/setting/api/token`)와 메일 설정 링크 생성에 사용
- `baseUrl`은 4개 환경 중 하나로 고정 (자유 입력 아님)
- 미설정 키 접근 시 에러와 `dooray setup` 안내 출력
- env var 폴백 없음 (보안 원칙)
- IMAP/SMTP 서버 정보는 기본값 제공. 사용자는 username/password만 설정하면 됨

---

## 캐시 파일 구조

각 캐시 파일은 독립적인 JSON으로 저장되며, 파일별 TTL을 `updatedAt` 필드로 관리한다.
파일 분리로 race condition을 방지하고, 프로젝트별 멤버/워크플로우를 독립 관리한다.

### me.json

```typescript
interface CacheEntry<CachedMe> {
  updatedAt: string; // ISO8601, TTL 24h
  data: CachedMe;
}

interface CachedMe {
  id: string; // organizationMemberId
  name: string; // /common/v1/members/me 에서 조회
}
```

### projects.json

```typescript
interface CacheEntry<CachedProject[]> {
  updatedAt: string; // ISO8601, TTL 1h
  data: CachedProject[];
}

interface CachedProject {
  id: string;
  code: string; // resolver 키 (e.g. "my-project")
  wikiId?: string; // project.wiki.id — WikiResolver에서 사용
}
```

### members/{projectId}.json

```typescript
interface CacheEntry<CachedMember[]> {
  updatedAt: string; // ISO8601, TTL 1h
  data: CachedMember[];
}

interface CachedMember {
  organizationMemberId: string; // Dooray API 내부 ID
  name: string; // /common/v1/members/{id} 에서 조회
}
```

### workflows/{projectId}.json

```typescript
interface CacheEntry<CachedWorkflow[]> {
  updatedAt: string; // ISO8601, TTL 24h
  data: CachedWorkflow[];
}

interface CachedWorkflow {
  id: string;
  name: string; // resolver 키 (e.g. "진행 중")
  class: "backlog" | "registered" | "working" | "closed";
  order?: number;
}
```

### tags/{projectId}.json (ADR-019)

```typescript
interface CachedTag {
  id: string;
  name: string;
  color?: string;
  // mandatoryTagGroup 등 메타는 코드 src/cache/types.ts 참조
}
```

`post create/edit --tag <name>` 시 사전 검증 (mandatory-tag 그룹 누락 시 클라이언트 에러).
`post edit --tag-remove`/`--tag-clear` 도 동일 캐시 사용 (Issue #66, ADR-019 확장).

`project tags create` 와 `project tags group` 은 성공 직후 이 파일을 삭제한다 (ADR-041).
TTL 이 24시간이라 삭제하지 않으면 방금 만든 태그와 바뀐 그룹 속성을 `post create --tag` 가
최대 24시간 보지 못한다. 삭제만 하고 재조회하지 않으며, 다음 조회가 API 에서 다시 채운다.

그룹 정보는 별도 캐시가 없다. 그룹 목록을 주는 API 경로가 없어 `tagGroup` 필드에서 파생하므로,
태그가 하나도 없는 그룹은 이 캐시에 나타나지 않는다.

### milestones/{projectId}.json (ADR-019)

```typescript
interface CachedMilestone {
  id: string;
  name: string;
}
```

`post create --milestone <name>` 시 이름 lookup.

### member-groups/{projectId}.json

```typescript
interface CachedMemberGroup {
  id: string;
  code?: string;  // optional — 실제 API 응답에서 누락 케이스 존재 (ADR-026 함정 묶음, Issue #65)
}
```

`post create/edit --mention-group <code>` 시 code lookup.
members/ 와 분리된 별도 캐시 — Dooray 의 그룹 멘션 endpoint 가 별도.
resolver 는 code 누락 그룹을 사전 필터링하고 후보 5개 안내 출력.

### TTL 설계 근거

| 엔티티        | TTL | 이유                                 |
| ------------- | --- | ------------------------------------ |
| me            | 24h | 거의 불변                            |
| projects      | 1h  | 자주 안 바뀌나 새 프로젝트 생성 가능 |
| members       | 1h  | 팀원 추가·변경 반영 필요             |
| workflows     | 24h | 프로젝트 생성 후 거의 고정           |
| tags          | 24h | 태그 추가/변경 빈도 낮음 (mandatory 그룹 정책 변경 빈도 기준) |
| milestones    | 24h | 분기/스프린트 단위로 추가됨          |
| member-groups | 24h | 그룹 구성 변경 빈도 낮음             |
| templates     | 24h | 정형 task 템플릿 변경 빈도 낮음 (ADR-027) |
| wikis         | 24h | 위키 home page 거의 불변             |

### Lazy Loading 전략

- 커맨드 실행 시 해당 캐시 파일이 없거나 TTL 만료 시 자동 fetch
- `cache clear` 로 전체 캐시 디렉토리 삭제

---

## Resolver 로직

### MeResolver

```
→ cache/me.json에서 조회
→ 캐시 없거나 TTL 만료 시 API /common/v1/members/me 호출 후 갱신
→ doctor 커맨드 실행 시 자동 캐싱
출력: CachedMe { id, name }
```

### ProjectResolver

```
입력: "my-project" (code) 또는 "123456" (id)
→ cache/projects.json에서 code 또는 id 매칭
→ 캐시 없거나 TTL 만료 시 API getProjects() 호출 후 갱신
출력: projectId (string)
```

### MemberResolver

```
입력: "김철수" (이름)
→ cache/members/{projectId}.json에서 name 부분일치 매칭
→ 복수 매칭 시 에러 + 후보 목록 출력
→ 캐시 없거나 TTL 만료 시:
  1단계: API getProjectMembers() 페이지네이션으로 전체 멤버 ID 수집
  2단계: /common/v1/members/{id} 를 전체 병렬 호출하여 name 보강
출력: organizationMemberId (string)
```

### WorkflowResolver

```
입력: "진행 중" 또는 "working" (class명)
→ cache/workflows/{projectId}.json에서 name 또는 class 매칭
→ 캐시 없거나 TTL 만료 시 API getProjectWorkflows() 호출
출력: workflowId (string)
```

### PostResolver

```
입력: postNumber (number, e.g. 42)
→ API getPosts(projectId, { postNumber: "42" }) 호출
→ 캐시 없음 (포스트는 수시로 변경)
→ 결과 없으면 에러
출력: postId (string)
```

### WikiResolver

```
입력: "my-project" (project code)
→ cache/projects.json에서 code 매칭 → wikiId 반환
→ wikiId null이면 에러 ("프로젝트에 위키가 없습니다")
출력: wikiId (string)
```

---

## dooray-persona 스킬 데이터 (ADR-038)

CLI가 아니라 스킬 스크립트가 읽고 쓴다.
인증은 `~/.dooray/config.json`의 `apiKey`와 `baseUrl`을 **읽기 전용**으로 참조하고, 그 파일을 수정하지 않는다.

### dooray-persona.config.json

```ts
interface DoorayPersonaConfig {
  version: 1;
  targets: Array<{
    projectId: string;   // 판정 키 (유니크)
    code: string;        // 표시용 프로젝트 코드
    name: string;        // 표시용 프로젝트 이름
  }>;
  outputPath: string;    // 생성할 페르소나 문서 경로
  workDir: string;       // 중간 산출물 디렉터리
  since: string | null;  // ISO 날짜. null이면 기간 제한 없음
  sessionScan: {
    enabled: boolean;
    roots: string[];     // 세션 로그 탐색 경로
  };
}
```

대상 프로젝트를 구분자로 이은 문자열이 아니라 객체 배열로 둔다.
표시용 이름은 바뀔 수 있고 판정은 항상 `projectId`로 한다.

본인 식별자는 저장하지 않는다.
매 실행 `common/v1/members/me`로 읽어, 계정이 바뀌었을 때 남의 글을 본인 표본으로 모으는 사고를 막는다.

### 중간 산출물

| 파일 | 내용 |
| --- | --- |
| `candidates.json` | 프로젝트별 본인 관련 업무 집계. 대상 선택 근거 |
| `corpus.jsonl` | 수집한 본문·댓글 원문. 한 줄이 표본 하나 |
| `classified.jsonl` | `corpus.jsonl` 각 줄에 분류 결과를 더한 것 |
| `stats.json` | 기호·종결어미·문장 길이 빈도 |

`corpus.jsonl` 한 줄의 필드는 다음과 같다.

```ts
interface CorpusEntry {
  id: string;                  // "{postId}#body" 또는 "{postId}#log-{logId}"
  kind: "body" | "comment";
  projectId: string;
  projectCode: string;
  postId: string;
  postNumber: number;
  subject: string;
  createdAt: string;
  mimeType: string;
  text: string;
  involvement: { authored: boolean; assigned: boolean; cc: boolean };
  assigneeKind: "member" | "group" | "none";
}
```

`assigneeKind`는 수신자 축 판정의 근거다.
그룹으로 접수된 업무가 대외 문의 성격을 띤다는 실측(ADR-037)이 여기서 문체 추출로 이어진다.

`classified.jsonl`은 위 필드에 분류 결과를 더한다.

```ts
interface ClassifiedEntry extends CorpusEntry {
  label: "human" | "ai-suspect" | "ai-confirmed" | "formal-template";
  signals: Record<string, number>;  // 구조 신호별 점수
  confirmed: boolean;               // 사용자 확인을 거쳤는지
}
```

`ai-confirmed`는 구조 신호가 아니라 등록 기록 대조로 확정된 AI 작성분이다.
`ai-suspect`와 나누는 이유는 확신도가 다르기 때문이다 — 의심은 사용자 확인이 필요하고, 확정은 그대로 제외한다.

스킬은 `workDir`을 자동으로 지우지 않는다.
원문이 남아 있어야 재수집 없이 분류·추출을 다시 돌릴 수 있다.
