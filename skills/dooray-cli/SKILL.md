---
name: dooray-cli
description: Dooray 업무 관리 CLI. 프로젝트/업무/댓글/위키 조회·생성·수정. AI 에이전트가 두레이 업무를 자동화할 때 사용.
---

# dooray-cli

NHN Dooray REST API 를 래핑한 CLI 다. 이 파일은 라우터이므로, 작업 영역에 맞는 reference 를 먼저 읽는다.

## 어느 reference 를 읽을지

| 하려는 일 | reference |
| --- | --- |
| 자연어 요청을 커맨드로 옮기기 (여기서 시작) | [intent-map.md](references/intent-map.md) |
| 설치·초기 설정, 출력 모드, API 제약, 에러 처리, 캐시, 피드백 등록 | [common.md](references/common.md) |
| 업무 식별·생성·수정, 참조자·담당자 변경, 첨부 보호, 부모 지정, 태그 | [post.md](references/post.md) |
| 업무 댓글 추가·필터·조회 | [comment.md](references/comment.md) |
| 위키 페이지 조회·트리·삭제, 첨부와 인라인 이미지, 위키 댓글 | [wiki.md](references/wiki.md) |
| 그룹 멘션·cc 판단, 멘션·링크 자동 삽입, Dooray 마크다운 링크 | [mention-link.md](references/mention-link.md) |
| 워크플로우 판단 기준, 정형 task 자동화, 명령 체이닝 | [workflow.md](references/workflow.md) |

## 대상 지정 방법

`post get`/`edit`/`done`/`workflow`, `post comment` 전체, `post file` 전체, `post comment file` 전체,
그리고 `wiki page file` 과 `wiki page comment` 전체가 네 가지 형태를 모두 받는다.

- `<project> <number>` — 업무는 번호, 위키는 `<project> <page-id>`
- `--id <postId>` / `--id <pageId>` — 위키는 `--project` 를 함께 줘야 한다 (API 가 page 단독 조회를 지원하지 않는다)
- `--url <url>`
- 첫 인자에 Dooray URL 을 직접

받아들이는 URL 형식은 셋이다.

- `https://*.dooray.com/task/to/<postId>`
- `https://*.dooray.com/task/<projectId>/<postId>` — 브라우저 주소창 복사본
- `https://*.dooray.com/project/tasks/<postId>` — 업무 목록에서 업무를 열었을 때

## 실행 규칙

- 사용자가 Dooray URL 을 줬으면 그대로 첫 인자로 넘긴다 — resolve 단계를 건너뛰어 가장 빠르다
- 구조화 결과가 필요하면 `--json`, 다음 명령에 ID 만 넘길 때는 `--quiet` 를 쓴다
- 조회는 `--json` 으로 먼저 실행해 응답 구조를 확인한 뒤 쓰기 명령으로 넘어간다
- 쓰기 명령은 대상 ID 를 명시하고, 지원하면 `--dry-run` 으로 먼저 확인한다
- 이름 기반 조회(멤버·그룹·워크플로우·태그)는 부분일치를 지원한다. 모호하면 에러와 후보 목록이 나오므로 임의로 고르지 말고 사용자에게 확인한다
- 실패하면 [common.md](references/common.md) 의 에러 처리 표와 대조한다

## 파일 명령의 `--json` 스키마

`post file` 과 `wiki page file` 이 같은 스키마를 쓴다. 한쪽 파싱 코드를 다른 쪽에 그대로 쓸 수 있다.

| 명령 | `--json` | `--quiet` |
| --- | --- | --- |
| `upload` | API 응답의 `result` 원형 | `id` |
| `download` | `{outputPath, fileName, size}` | `outputPath` |
| `download-all` | `{count, succeeded: [{path, fileName}], failed: [{fileId, error}]}` | — |
| `delete` | `{fileId, status: "deleted"}` | `fileId` |

`download-all` 은 일부만 실패해도 나머지를 계속 내려받고 **종료 코드 1** 을 반환한다.
성공과 실패를 갈라 처리해야 하므로 종료 코드만 보고 전체 실패로 판단하지 않는다.

`wiki page file upload --type inline_image` 는 `--json` 에 `markdownSnippet` 이 더 붙는다.
본문에 그대로 넣을 수 있는 markdown 이며, `general` 타입과 `--quiet` 에는 없다.

## 삭제 명령의 확인 동작

같지 않으므로 실행 전에 확인한다. 확인 절차가 없는 명령은 되돌릴 수 없다.

| 명령 | 확인 | 자동화 |
| --- | --- | --- |
| `wiki page delete` | 있음 | `-y`, `--yes` |
| `post comment file delete` | 있음 | `--yes` |
| `post file delete` | **없음 — 즉시 삭제** | — |
| `wiki page file delete` | **없음 — 즉시 삭제** | — |
| `post comment delete` | **없음 — 즉시 삭제** | — |
| `wiki page comment delete` | **없음 — 즉시 삭제** | — |

확인이 있는 명령은 TTY 가 아니면 중단되므로, 자동화에서는 위 플래그를 붙인다.
