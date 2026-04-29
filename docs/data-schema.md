# Data Schema — dooray-cli

## 파일 위치

```
~/.dooray/
  config.json                 # 인증·연결 설정
  cache/
    me.json                   # 내 정보 캐시
    projects.json             # 프로젝트 목록 캐시
    members/{projectId}.json  # 프로젝트별 멤버 캐시
    workflows/{projectId}.json # 프로젝트별 워크플로우 캐시
```

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
- 미설정 키 접근 시 에러 + `dooray setup` 안내 출력
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

### TTL 설계 근거

| 엔티티    | TTL | 이유                                 |
| --------- | --- | ------------------------------------ |
| me        | 24h | 거의 불변                            |
| projects  | 1h  | 자주 안 바뀌나 새 프로젝트 생성 가능 |
| members   | 1h  | 팀원 추가·변경 반영 필요             |
| workflows | 24h | 프로젝트 생성 후 거의 고정           |

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
