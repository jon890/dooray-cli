# mention-link

그룹 멘션/cc 의사결정, 멘션·링크 자동 삽입, Dooray 마크다운 링크 형식(멤버/그룹/업무/위키 페이지)을 다룬다.

## 그룹 멘션 / cc 시 AI agent 동선

자연어 그룹명을 사용자가 지칭했을 때 AI agent 의 의사결정 순서:

1. **사용자가 명확한 code 를 줬으면 바로 시도**
   ```bash
   dooray post create <project> --mention-group "<code>"
   ```
   부분일치 가능 (예: "AI-Data" → "AI-Data파트" 매칭).

2. **부분일치 모호 / 매칭 실패 시 후보 탐색**
   ```bash
   dooray project groups <project>
   ```
   ID + Code 표 출력.
   AI agent 가 자연어 의도와 가장 가까운 code 선택 후 재시도.

3. **모든 컬럼이 빈값일 때 (response shape 이상) 회피**
   - 최근 수정 이후 거의 발생 안 함 (`fetchAllMemberGroups` 가 nested array 정규화)
   - 만약 발생 시: 사용자에게 그룹 id (UI 의 그룹 URL 에서 19자리 numeric) 확인 요청
   - `--cc-group <id>` / `--mention-group <id>` 직접 입력
   - 또는 그룹 멤버를 개별 `--cc <member>` / `--mention <member>` 로 지정

4. **모호한 자연어 매핑은 사용자에게 확인**
   - 후보가 여러 개일 때 임의 선택 금지 — 사용자에게 선택지 제시
   - 예: "AI-Data파트 / AI-Data실험팀 — 어느 그룹인가요?"

순서 고정 — 멤버 먼저, 그룹 다음 (기존 정책 유지).


## 멘션·링크 자동 삽입 (first-class)

`post create`, `post edit`, `post comment add`, `post comment edit` 모두 지원:

- `--mention <name>` (반복) — 이름으로 멤버 resolve 후 dooray:// markdown prepend
- `--mention-group <code>` (반복) — 그룹 코드로 resolve
- `--link-task <project>/<number>` (반복) — 다른 업무 link 를 본문 끝에 append. 19자리 postId 도 가능
- `--dry-run` — API 호출 없이 합성 결과만 stdout. CI / 자동화 검증용

```bash
dooray post comment add P 1 --mention 홍길동 --mention-group 개발 --body "..."
# 결과 본문: [@홍길동](dooray://orgId/members/m1 "member") [@P/개발](dooray://orgId/member-groups/g1) ...
```

- 이름 부분일치 지원 (모호하면 에러 + 후보 목록 출력)
- 멤버 먼저, 그룹 다음 순서 고정
- interactive (`$EDITOR`) 모드의 `post edit` 는 mention/link-task 무시 + stderr 경고


## Dooray 마크다운 링크 형식 (멤버·그룹·업무·위키 페이지 멘션)

댓글/본문 작성 시 다음 형식으로 마크업하면 Dooray 앱이 인식해 inline 멘션·navigation으로 렌더링한다.
ID는 본인 환경 값으로 채워 사용 — `dooray member get` / `project groups` / `post get` 등으로 조회.

### 멤버 멘션
```markdown
[@본인이름](dooray://{orgId}/members/{memberId} "me")
[@타인이름](dooray://{orgId}/members/{memberId} "member")
```
- title 속성: 본인은 `"me"`, 타인은 `"member"`
- URL: `dooray://{orgId}/members/{memberId}`

### 그룹 멘션 (member-group)
```markdown
[@projectCode/그룹명](dooray://{orgId}/member-groups/{groupId})
```
- **`projects/{projectId}/` 경로 포함하지 않음** (직관과 반대 — 흔한 실수)
- title 속성 **없음**
- URL: `dooray://{orgId}/member-groups/{groupId}`

### 업무(task) 링크
```markdown
[projectCode/{number} {subject}](dooray://{orgId}/tasks/{postId} "registered")
```
- 표시 텍스트: `{project}/{number} {subject}`
- URL: `dooray://{orgId}/tasks/{postId}`
- title: workflow class — `registered` / `working` / `closed` / `backlog`
- 클릭 시 외부 브라우저 안 열고 Dooray 앱 내부 navigation + workflow 상태 표시

### 위키 페이지 링크
```markdown
[표시텍스트](dooray://{orgId}/pages/{pageId} "publish")
```
- URL: `dooray://{orgId}/pages/{pageId}`
- title: 페이지 상태 (`publish` 등) — 업무 링크의 workflow class 자리에 대응
- 업무(task) 링크와 대칭 구조
  - `orgId` 동일
  - 경로만 `pages/{pageId}` 로 차이

### 필요 ID 조회 명령

| ID | 조회 |
|---|---|
| `orgId` | Dooray 앱/웹 URL에서 추출 (`https://{org}.dooray.com/...`의 도메인 + 별도 확인 필요) |
| `memberId` | `dooray member get <id>`, `dooray member search <name>`, `--email <addr>`, `--user-code <code>` 등으로 검색 |
| `groupId` | `dooray project groups <project>` |
| `postId` | `dooray post get <project> <number> --json` 의 `id` 필드 |
| `pageId` | `dooray wiki page get <project> <page-id> --json` 의 `id` 필드 |

---
