---
name: dooray-cli
description: Dooray 업무 관리 CLI. 프로젝트/업무/댓글/위키 조회·생성·수정. AI 에이전트가 두레이 업무를 자동화할 때 사용.
---

# dooray-cli

NHN Dooray REST API를 래핑한 CLI 도구다.
이 파일은 router다.
작업하려는 영역에 맞는 reference를 먼저 읽고, 자연어 요청은 [intent-map.md](references/intent-map.md) 표로 커맨드를 찾는다.

## 먼저 읽을 것

| 상황 | 읽을 reference |
|------|----------------|
| 자연어 요청 → 커맨드 매핑 (마스터 표) | [intent-map.md](references/intent-map.md) |
| 설치, 초기 설정, 출력 모드, API 제약사항, 피드백 등록, 에러 핸들링, 캐시 | [common.md](references/common.md) |
| 업무(post) 식별·생성·수정, 참조자/담당자 변경, 본문 attachment 보호, 부모 지정, 태그 자동화 | [post.md](references/post.md) |
| 업무 댓글 추가/필터/단일 조회 | [comment.md](references/comment.md) |
| 위키 페이지 조회(트리 포함), 삭제, 첨부파일, 인라인 이미지, 위키 댓글 | [wiki.md](references/wiki.md) |
| 그룹 멘션/cc 판단, 멘션·링크 자동 삽입, Dooray 마크다운 링크 형식 | [mention-link.md](references/mention-link.md) |
| 워크플로우 판단 기준, 정형 task 자동화, 체이닝 시나리오 | [workflow.md](references/workflow.md) |

## 공통 우선 규칙

- 자연어 요청이 오면 먼저 [intent-map.md](references/intent-map.md) 표에서 대응 커맨드를 찾는다.
- 사용자가 Dooray URL을 줬으면 그대로 첫 인자로 전달하는 것이 가장 빠른 경로다 (resolve 단계 단축).
- 구조화 출력이 필요하면 `--json`을 우선 사용한다.
- 결과를 다음 액션에 넘길 때는 `--quiet`로 ID만 뽑아 스크립팅한다.
- 이름 기반 조회(멤버/그룹/워크플로우/태그)는 부분일치를 지원하되, 모호하면 에러와 후보 목록이 출력된다 — 임의 선택하지 말고 사용자에게 확인한다.
- 파괴적 명령(위키 페이지 삭제, 파일 삭제 등)은 기본적으로 confirm이 있거나 즉시 실행됨이 reference마다 다르니 해당 reference에서 먼저 확인한다.

## 빠른 시작

```bash
npm install -g @bifos/dooray-cli
dooray setup   # API endpoint, API key, 메일 설정까지 대화형 진행
dooray skill status
dooray skill install
dooray post list <project> --json
```

전역 npm 패키지를 갱신한 뒤에는 `dooray skill update`를 실행해 Claude Code 스킬을 현재 CLI 버전으로 맞춘다.
스킬 활성 링크는 Node 설치 경로가 아니라 dooray-cli 관리 저장소를 가리킨다.
`modified`, `corrupt`, `unmanaged` 상태는 내용을 확인한 뒤 `dooray skill update --force`로 백업 후 복구한다.

## 안전한 탐색 순서

1. [common.md](references/common.md)에서 설치·설정·출력 모드를 확인한다.
2. 자연어 요청이면 [intent-map.md](references/intent-map.md)에서 커맨드를 찾는다.
3. 대상 영역(post/comment/wiki/mention-link/workflow) reference를 읽는다.
4. 조회 명령은 `--json`으로 먼저 실행해 구조를 확인한다.
5. 쓰기 명령은 대상 id, `--dry-run`(지원 시), confirm 옵션을 명시한다.
6. 실패하면 [common.md](references/common.md)의 에러 핸들링 표와 대조한다.
