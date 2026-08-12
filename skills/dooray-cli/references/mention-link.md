# mention-link

## 멘션·링크 옵션

`post create`, `post edit`, `post comment add`, `post comment edit` 이 모두 지원한다.

| 옵션 | 동작 |
| --- | --- |
| `--mention <name>` | 이름으로 멤버를 찾아 본문 앞에 멘션을 붙인다 (반복 가능) |
| `--mention-group <code>` | 그룹 코드로 찾아 멘션을 붙인다 (반복 가능) |
| `--link-task <ref>` | 다른 업무 링크를 본문 끝에 붙인다. `<project>/<number>` 또는 postId (반복 가능) |
| `--dry-run` | API 를 호출하지 않고 합성된 본문만 stdout 에 출력한다 |

```bash
dooray post comment add <project> 1 --mention 홍길동 --mention-group 개발 --body "..."
# 본문 앞에: [@홍길동](dooray://<orgId>/members/<memberId> "member") [@<project>/개발](dooray://<orgId>/member-groups/<groupId>)
```

멘션 순서는 멤버가 먼저, 그룹이 다음으로 고정이다.
`$EDITOR` 로 여는 interactive 모드의 `post edit` 는 이 옵션들을 무시하고 경고만 낸다.

쓰기 전에 `--dry-run` 으로 합성 결과를 확인하면 잘못된 멤버를 멘션하는 일을 막을 수 있다.

## 그룹을 못 찾을 때

`--mention-group` 과 `--cc-group` 은 code 부분일치로 찾는다 ("AI-Data" → "AI-Data파트").
실패하거나 후보가 여러 개면 `dooray project groups <project>` 로 ID 와 Code 를 확인한다.

후보가 여러 개일 때 임의로 고르지 않고 사용자에게 어느 그룹인지 묻는다.
code 로 못 찾으면 15자리 이상 numeric ID 를 직접 넣을 수도 있다.

## Dooray 마크다운 링크 형식

CLI 옵션(`--mention` 등)을 쓰면 아래 markdown 을 자동으로 만들어 주므로 직접 조립할 필요가 없다.
본문을 손으로 쓸 때만 이 형식을 쓴다. Dooray 앱이 inline 멘션과 내부 이동으로 렌더링한다.

### 멤버

```markdown
[@본인이름](dooray://{orgId}/members/{memberId} "me")
[@타인이름](dooray://{orgId}/members/{memberId} "member")
```

title 은 본인이면 `"me"`, 그 외에는 `"member"` 다.

### 그룹

```markdown
[@projectCode/그룹명](dooray://{orgId}/member-groups/{groupId})
```

`projects/{projectId}/` 경로를 **넣지 않는다** — 직관과 반대라 흔히 틀리는 지점이다.
title 속성도 없다.

### 업무

```markdown
[projectCode/{number} {subject}](dooray://{orgId}/tasks/{postId} "registered")
```

title 은 workflow class 다 — `registered` / `working` / `closed` / `backlog`.
클릭하면 브라우저가 아니라 Dooray 앱 안에서 이동하며 workflow 상태가 함께 보인다.

**표시 텍스트의 대괄호는 엔티티로 바꾼다.** `[` 는 `&#91;`, `]` 는 `&#93;` 다.
제목에 모듈명을 대괄호로 붙이는 팀이 많은데, 조회한 `subject` 를 그대로 넣으면 링크 문법과 충돌해 깨진다.

| 입력 | 결과 |
| --- | --- |
| `[my-project/524 [MOD] 한도 분리](dooray://...)` | 링크 깨짐 |
| `[my-project/524 &#91;MOD&#93; 한도 분리](dooray://...)` | 정상 |

치환 대상은 표시 텍스트뿐이고 URL 은 해당 없다.
`--link-task` 옵션을 쓰면 CLI 가 알아서 치환하므로 손으로 조립할 때만 신경 쓴다.

### 위키 페이지

```markdown
[표시텍스트](dooray://{orgId}/pages/{pageId} "publish")
```

업무 링크와 같은 구조이고 경로만 `pages/{pageId}` 로 다르다. title 은 페이지 상태다.
표시 텍스트의 대괄호 치환도 업무 링크와 같다.

### ID 를 얻는 곳

| ID | 얻는 방법 |
| --- | --- |
| `orgId` | `~/.dooray/cache/me.json` 의 `data.orgId` |
| `memberId` | 응답에 있으면 그 값을 쓴다 (아래 참조). 없을 때만 `dooray member search <name>` |
| `groupId` | `dooray project groups <project>` |
| `postId` | `dooray post get <project> <number> --json` 의 `id` |
| `pageId` | `dooray wiki page get <project> <page-id> --json` 의 `id` |

### 답장 대상은 이름으로 찾지 않는다

답장할 상대의 ID 는 이미 조회 응답 안에 있다. 검색할 필요가 없다.

| 대상 | 응답의 위치 |
| --- | --- |
| 업무 작성자 | `post get ... --json` 의 `users.from.member.organizationMemberId` |
| 댓글 작성자 | `post comment list ... --json` 의 `creator.member.organizationMemberId` |

이 값을 쓰면 표시 이름이 한자든 영문이든 닉네임이든 항상 정확하다.

**검색 결과가 1건이어도 확정 근거로 삼지 않는다.**
표시 이름이 한자로 되어 있으면 한글 이름 검색에 원 작성자가 아예 안 잡히고, 표기가 비슷한 **다른 사람만** 걸린다.
후보가 여럿이면 모호하다는 신호라도 있지만, 하나뿐이면 오히려 확신하게 되는 것이 함정이다.

이름 검색은 대상이 응답에 없을 때만 쓰고, 그때도 이메일이나 사번으로 교차 확인한다.
